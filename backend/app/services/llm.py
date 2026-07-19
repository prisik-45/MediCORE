import json
import logging
from datetime import datetime
from typing import Any

from groq import Groq

from backend.app.config import get_settings
from backend.app.schemas import ExtractedCatalogItem, QueryPlan

logger = logging.getLogger(__name__)

EXTRACTION_CHUNK_CHARS = 12000
EXTRACTION_CHUNK_OVERLAP_LINES = 4


class GroqClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.client = Groq(api_key=settings.groq_api_key)
        self.model = settings.groq_model

    def _json_chat(self, system: str, user: str) -> dict[str, Any]:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=8192,
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)

    def extract_catalog_items(self, pdf_text: str, reference_date: datetime | None = None) -> list[ExtractedCatalogItem]:
        extracted: list[ExtractedCatalogItem] = []
        seen: set[tuple] = set()
        for chunk in self._chunk_text(pdf_text):
            for item in self._extract_catalog_items_chunk(chunk, reference_date=reference_date):
                key = (
                    (item.normalized_name or item.ingredient_name).strip().lower(),
                    str(item.price_per_unit),
                    (item.currency or "").upper(),
                    str(item.available_qty) if item.available_qty is not None else None,
                    (item.unit or "").strip().lower(),
                    item.lead_time_text or item.lead_time_days,
                    str(item.moq) if item.moq is not None else None,
                )
                if key in seen:
                    continue
                seen.add(key)
                extracted.append(item)
        return extracted

    def _extract_catalog_items_chunk(self, pdf_text: str, reference_date: datetime | None = None) -> list[ExtractedCatalogItem]:
        date_context = ""
        if reference_date:
            date_context = f"\n- Reference Date Context: The email or document was received on {reference_date.strftime('%Y-%m-%d')}. Use this exact date to resolve relative validity expressions (e.g. 'valid for 15 days' resolves to valid_until='{reference_date.strftime('%Y-%m-%d')}' + 15 days, 'valid until end of month' resolves to the end of the current month, etc.).\n"

        system = (
            "You are an expert AI parser for pharmaceutical and chemical supplier catalogs. "
            "Your task is to analyze the provided text (which could be a structured table, a conversational email body, or an unstructured list/paragraph) "
            "and extract all catalog items into a strict JSON structure. "
            "Return a JSON object containing a single key 'items' mapping to an array of catalog items.\n\n"
            "Each catalog item in the array MUST contain the following fields:\n"
            "- ingredient_name: The raw name of the chemical, ingredient, or medicine (e.g., 'Citric Acid Anhydrous', 'Paracetamol API', 'Aspirin USP')\n"
            "- normalized_name: The lowercase, clean, canonical name of the ingredient, excluding grades, CAS, or pack sizes (e.g., 'citric acid', 'paracetamol', 'aspirin')\n"
            "- price_per_unit: The numeric price from a price/rate column or phrase only. "
            "Never copy the quantity value into price_per_unit. Preserve the exact decimal value visible in the source; do not round. If a price range is given, use the visible lower bound and put the full original range in notes. "
            "If no real price/rate is visible for an item, use null instead of guessing; still extract the item if the product name is visible.\n"
            "- currency: The quoted transaction currency as a currency code. '$' or Price(USD) means 'USD'; "
            "'₹', 'Rs', 'Rupees', or Price(INR) means 'INR'; '€' means 'EUR'. Do not convert values between currencies.\n"
            "- available_qty: The numeric stock/available quantity from a Quantity, Qty, Qty Avail, or Quantity(KG) column. "
            "For example, in 'Quantity(KG)=9.99' and 'Price(USD)=$10.50/kg', available_qty is 9.99 and price_per_unit is 10.50. "
            "Preserve the exact decimal value visible in the source; do not round. If quantity is not visible, use null. Never output 0 unless the source explicitly says zero.\n"
            "- unit: The quantity/price unit (e.g., 'kg', 'g', 'litre', 'tablet', 'capsule', 'pack', 'drum'). Normalize units like 'kilograms', 'kgs' to 'kg'.\n"
            "- valid_until: An ISO 8601 date string (e.g. '2026-12-31') if an offer validity or expiry date is mentioned, otherwise null.\n"
            "- lead_time_days: An integer only when the source gives one exact lead time (e.g., '5 days'). Parse expressions like '1 week' to 7, 'next day' to 1. If the source gives a range like '40-50 days' or '40 to 50 days', use null here.\n"
            "- lead_time_text: The exact source lead-time phrase when present, especially ranges like '40-50 days'. If not mentioned, use null.\n"
            "- moq: A numeric float representing the Minimum Order Quantity. Extract hidden MOQ text inside other columns, "
            "such as '4.66 MOQ:25kg' -> available_qty=4.66, moq=25.0, unit='kg'. If not mentioned, use null.\n"
            "- notes: Any extra specifications, purity levels, packaging details, original price strings, Incoterms, "
            "packing terms, or conditions (e.g., 'CIF Vancouver $6.00/kg', '99% purity', '25kg packing', 'Payment: 30 days').\n\n"
            "CRITICAL TABLE MAPPING RULES:\n"
            "1. Read column headers before values. Values under Quantity/Qty columns are quantities, not prices, even if they look like decimals.\n"
            "2. Values under Price/Rate columns are prices. If the header says Price(USD), use currency='USD' even when the row only says '10.50/kg'.\n"
            "3. Preserve the original quoted currency and commercial terms in notes, but keep price_per_unit numeric.\n"
            "4. Treat 'NA' prices as unavailable and set price_per_unit=null unless a real numeric price is present elsewhere in the same row.\n"
            "5. No hallucination: every ingredient, price, quantity, unit, MOQ, lead time, and date must be directly supported by text visible in this chunk. "
            "Put the exact source row/phrase for each item into notes as source='...'. Do not infer missing numeric values, do not convert units/currencies, and do not round decimal values.\n\n"
            "CRITICAL INSTRUCTIONS FOR UNSTRUCTURED / CONVERSATIONAL TEXT:\n"
            f"1. Conversational Emails: If the text is an email conversation, locate all mentions of products, prices, quantities, and terms, and map them to the schema.{date_context}\n"
            "2. Implicit Packaging: If the text says 'Rs 3000 per 25kg bag', normalize this to a single item with price_per_unit=3000, unit='bag' or price_per_unit=120, unit='kg', depending on how the price is stated, but map it logically.\n"
            "3. Purity & Grades: Keep grades (e.g. 'IP', 'USP', 'Food Grade') and CAS numbers in the ingredient_name and notes, but strip them out of the normalized_name.\n"
            "4. Volume / Tiered Pricing: If the email lists multiple price tiers based on quantity (e.g., '$5/kg for 100kg, or $4/kg for 500kg'), extract EACH tier as a separate catalog item in the array, setting the price_per_unit, moq, and available_qty accordingly.\n"
            "5. CAS Registry Numbers: Extract CAS numbers (e.g. 'CAS 50-78-2') and specify them clearly in the 'notes' field (e.g. 'CAS: 50-78-2').\n"
            "6. Incoterms & Conditions: Extract Incoterms (FOB, CIF, EXW, DDP, CFR) or shipping details (e.g. 'FOB Shanghai', 'origin: India') and save them in 'notes'.\n"
            "7. Thoroughness: Extract EVERY single product listed in this chunk. Do not summarize or stop early. "
            "If there are 20 visible rows, return all 20 rows; use null for missing commercial fields.\n"
            "8. OCR Robustness: Correct obvious OCR confusions only when context is clear, e.g. O/0 in numbers, l/1 in quantities, broken table spacing. "
            "If a row is ambiguous, omit that row instead of guessing."
        )
        payload = self._json_chat(system, pdf_text)
        extracted = []
        for item in payload.get("items", []):
            try:
                extracted.append(ExtractedCatalogItem.model_validate(item))
            except Exception as e:
                logger.warning("Skipping invalid catalog item: %s. Error: %s", item, e)
        return extracted

    def _chunk_text(self, text: str) -> list[str]:
        normalized = text.strip()
        if not normalized:
            return []
        if len(normalized) <= EXTRACTION_CHUNK_CHARS:
            return [normalized]

        lines = normalized.splitlines()
        chunks: list[str] = []
        current: list[str] = []
        current_len = 0
        for line in lines:
            line_len = len(line) + 1
            if current and current_len + line_len > EXTRACTION_CHUNK_CHARS:
                chunks.append("\n".join(current))
                current = current[-EXTRACTION_CHUNK_OVERLAP_LINES:]
                current_len = sum(len(row) + 1 for row in current)
            current.append(line)
            current_len += line_len
        if current:
            chunks.append("\n".join(current))
        return chunks

    def plan_query(self, question: str) -> QueryPlan:
        system = (
            "You produce safe JSON query plans for a supplier catalogue database. "
            "Allowed operations:\n"
            "- supplier_compare: Compare prices and quantities of a specific chemical across different suppliers.\n"
            "- best_price: Find the cheapest/best deal for a specific chemical.\n"
            "- catalog_search: Search catalogs or find suppliers matching a general keyword or semantic context.\n"
            "- history_compare: Compare historical prices or price trends for an ingredient.\n"
            "- supplier_activity: Check recently received/synced emails, catalog activity, or sync statuses.\n"
            "- unrelated: Use when the request is unrelated to supplier catalogs, prices, procurement, or setting configurations.\n\n"
            "If the question is unrelated to the MediCORE procurement system (e.g. general knowledge, personal advice, coding, entertainment, unrelated topics), "
            "you MUST classify the operation as 'unrelated'.\n\n"
            "Do not emit SQL. You MUST output a FLAT JSON object (no nested 'filters' object) containing the following fields:\n"
            "- operation: one of the allowed operations\n"
            "- normalized_name: string or null (extract the chemical/ingredient name and normalize it to its canonical lowercase form, e.g. 'vitamin c' -> 'ascorbic acid', 'nacl' -> 'sodium chloride', 'citric acid anhydrous' -> 'citric acid', 'paracetamol api' -> 'paracetamol')\n"
            "- min_quantity: number or null (extract any minimum quantity/stock requirements)\n"
            "- unit: string or null (normalize units, e.g. 'kg', 'g', 'litre', 'tablet')\n"
            "- semantic_query: string or null\n"
            "- limit: number (default 10)\n\n"
            "Example output for 'Compare citric acid':\n"
            "{\"operation\": \"supplier_compare\", \"normalized_name\": \"citric acid\", \"min_quantity\": null, \"unit\": null, \"semantic_query\": null, \"limit\": 10}"
        )
        payload = self._json_chat(system, question)
        return QueryPlan.model_validate(payload)

    def classify_supplier_subject(self, subject: str, keywords: list[str] | None = None) -> bool:
        keyword_context = ", ".join(keywords or [])
        system = (
            "Classify whether an email subject is semantically about a supplier selling, quoting, "
            "offering, or sharing availability for pharmaceutical ingredients, chemicals, APIs, "
            "excipients, raw materials, catalogues, COA/specifications, stock, or procurement pricing. "
            "Do not require exact keyword matches. Reject newsletters, webinars, job emails, generic "
            "marketing, account notifications, unrelated support, and personal messages. "
            "Return JSON only: {\"is_supplier_sales_email\": true|false, \"reason\": \"short\"}."
        )
        user = json.dumps({"subject": subject, "smart_ingestion_keywords": keyword_context})
        payload = self._json_chat(system, user)
        return bool(payload.get("is_supplier_sales_email"))

    def summarize_answer(self, question: str, rows: list[dict[str, Any]]) -> str:
        compact_rows = [
            {
                "supplier": row.get("supplier_name"),
                "item": row.get("normalized_name") or row.get("ingredient_name"),
                "price": row.get("price_per_unit"),
                "price_display": row.get("price_display"),
                "currency": row.get("currency"),
                "qty": row.get("available_qty"),
                "quantity_display": row.get("quantity_display"),
                "unit": row.get("unit"),
                "lead_time": row.get("lead_time_text") or row.get("lead_time_days"),
                "certifications": row.get("certifications"),
                "score": row.get("recommendation_score"),
            }
            for row in rows[:20]
        ]
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are ProcuraAI, MediCORE's professional procurement assistant. You MUST adhere to these rules:\n"
                        "1. Relevance: You only answer questions related to the MediCORE procurement intelligence system, "
                        "such as supplier catalogues, ingredients/chemicals, prices, inventory, lead times, sync status, settings, or supplier comparisons. "
                        "If the question is unrelated, you must politely refuse to answer. Example: 'I'm sorry, I can only help you with questions related to the MediCORE procurement intelligence system.'\n"
                        "2. No Hallucinations: Do NOT invent or make up any suppliers, ingredient names, prices, quantities, lead times, or scores. "
                        "Only reference facts directly present in the provided context rows.\n"
                        "3. Handling No Data: If there are no matching context rows or if you do not know the answer, "
                        "state politely that you couldn't find any matching data or records in the database, and offer to help with a different procurement query. "
                        "Do not assume or hallucinate search results.\n"
                        "If context rows are provided, they are matching database rows for the user's query. Do not say no data was found when rows are present.\n"
                        "4. Completeness: When mentioning prices, always include the exact currency (e.g. USD, INR, EUR) and unit (e.g. kg, bag, tablet). "
                        "Couple pricing with availability/quantity details if present to give a complete summary.\n"
                        "5. Professional Insights: Provide a brief, helpful insight on the best recommendation or cheapest deal based on the data score or price.\n"
                        "6. Formatting: Respond in a natural, friendly, professional, conversational tone (3-4 sentences max). "
                        "Return plain text only—no markdown, no bold text, no bullet points, and no tables."
                    ),
                },
                {"role": "user", "content": json.dumps({"question": question, "rows": compact_rows}, default=str)},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or "No answer generated."
