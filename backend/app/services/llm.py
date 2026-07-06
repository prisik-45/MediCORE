import json
import logging
from typing import Any

from groq import Groq

from backend.app.config import get_settings
from backend.app.schemas import ExtractedCatalogItem, QueryPlan

logger = logging.getLogger(__name__)


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
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)

    def extract_catalog_items(self, pdf_text: str) -> list[ExtractedCatalogItem]:
        system = (
            "You are an expert AI parser for pharmaceutical and chemical supplier catalogs. "
            "Your task is to analyze the provided text (which could be a structured table, a conversational email body, or an unstructured list/paragraph) "
            "and extract all catalog items into a strict JSON structure. "
            "Return a JSON object containing a single key 'items' mapping to an array of catalog items.\n\n"
            "Each catalog item in the array MUST contain the following fields:\n"
            "- ingredient_name: The raw name of the chemical, ingredient, or medicine (e.g., 'Citric Acid Anhydrous', 'Paracetamol API')\n"
            "- normalized_name: The lowercase, clean, canonical name of the ingredient, excluding grades or pack sizes (e.g., 'citric acid', 'paracetamol')\n"
            "- price_per_unit: The numeric price from a price/rate column or phrase only. "
            "Never copy the quantity value into price_per_unit. If a price range is given, use the lowest price.\n"
            "- currency: The quoted transaction currency as a currency code. '$' or Price(USD) means 'USD'; "
            "'₹', 'Rs', 'Rupees', or Price(INR) means 'INR'; '€' means 'EUR'. Do not convert values between currencies.\n"
            "- available_qty: The numeric stock/available quantity from a Quantity, Qty, Qty Avail, or Quantity(KG) column. "
            "For example, in 'Quantity(KG)=9.99' and 'Price(USD)=$10.50/kg', available_qty is 9.99 and price_per_unit is 10.50.\n"
            "- unit: The quantity/price unit (e.g., 'kg', 'g', 'litre', 'tablet', 'capsule', 'pack', 'drum'). Normalize units like 'kilograms', 'kgs' to 'kg'.\n"
            "- valid_until: An ISO 8601 date string (e.g. '2026-12-31') if an offer validity or expiry date is mentioned, otherwise null.\n"
            "- lead_time_days: An integer representing the delivery lead time in days (e.g., 5). Parse expressions like '1 week' to 7, 'next day' to 1. If not mentioned, use null.\n"
            "- moq: A numeric float representing the Minimum Order Quantity. Extract hidden MOQ text inside other columns, "
            "such as '4.66 MOQ:25kg' -> available_qty=4.66, moq=25.0, unit='kg'. If not mentioned, use null.\n"
            "- notes: Any extra specifications, purity levels, packaging details, original price strings, Incoterms, "
            "packing terms, or conditions (e.g., 'CIF Vancouver $6.00/kg', '99% purity', '25kg packing', 'Payment: 30 days').\n\n"
            "CRITICAL TABLE MAPPING RULES:\n"
            "1. Read column headers before values. Values under Quantity/Qty columns are quantities, not prices, even if they look like decimals.\n"
            "2. Values under Price/Rate columns are prices. If the header says Price(USD), use currency='USD' even when the row only says '10.50/kg'.\n"
            "3. Preserve the original quoted currency and commercial terms in notes, but keep price_per_unit numeric.\n"
            "4. Treat 'NA' prices as unavailable and skip that item unless a real numeric price is present elsewhere in the same row.\n\n"
            "CRITICAL INSTRUCTIONS FOR UNSTRUCTURED / CONVERSATIONAL TEXT:\n"
            "1. Conversational Emails: If the text is an email conversation, locate all mentions of products, prices, quantities, and terms, and map them to the schema.\n"
            "2. Implicit Packaging: If the text says 'Rs 3000 per 25kg bag', normalize this to a single item with price_per_unit=3000, unit='bag' or price_per_unit=120, unit='kg', depending on how the price is stated, but map it logically.\n"
            "3. Purity & Grades: Keep grades (e.g. 'IP', 'USP', 'Food Grade') in the ingredient_name and notes, but strip them out of the normalized_name.\n"
            "4. Thoroughness: Extract EVERY single product listed in the text. Do not summarize or skip any items."
        )
        payload = self._json_chat(system, pdf_text[:30000])
        extracted = []
        for item in payload.get("items", []):
            try:
                extracted.append(ExtractedCatalogItem.model_validate(item))
            except Exception as e:
                logger.warning("Skipping invalid catalog item: %s. Error: %s", item, e)
        return extracted

    def plan_query(self, question: str) -> QueryPlan:
        system = (
            "You produce safe JSON query plans for a supplier catalogue database. "
            "Allowed operations: supplier_compare, best_price, catalog_search, history_compare, supplier_activity, unrelated.\n"
            "If the question is unrelated to the MediCORE procurement system (e.g. general knowledge, personal advice, coding, entertainment, unrelated topics), "
            "you MUST classify the operation as 'unrelated'.\n"
            "Do not emit SQL. You MUST output a FLAT JSON object (no nested 'filters' object) containing the following fields:\n"
            "- operation: one of the allowed operations\n"
            "- normalized_name: string or null (extract the chemical/ingredient name, e.g., 'citric acid')\n"
            "- min_quantity: number or null (extract any minimum quantity requirements)\n"
            "- unit: string or null\n"
            "- semantic_query: string or null\n"
            "- limit: number (default 10)\n"
            "Example output for 'Compare citric acid':\n"
            "{\"operation\": \"supplier_compare\", \"normalized_name\": \"citric acid\", \"min_quantity\": null, \"unit\": null, \"semantic_query\": null}"
        )
        payload = self._json_chat(system, question)
        return QueryPlan.model_validate(payload)

    def summarize_answer(self, question: str, rows: list[dict[str, Any]]) -> str:
        compact_rows = [
            {
                "supplier": row.get("supplier_name"),
                "item": row.get("normalized_name") or row.get("ingredient_name"),
                "price": row.get("price_per_unit"),
                "currency": row.get("currency"),
                "qty": row.get("available_qty"),
                "unit": row.get("unit"),
                "certifications": row.get("certifications"),
                "score": row.get("recommendation_score"),
            }
            for row in rows[:5]
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
                        "4. Formatting: Respond in a natural, friendly, conversational tone (2-3 sentences max). "
                        "Return plain text only—no markdown, no bold text, no bullet points, and no tables."
                    ),
                },
                {"role": "user", "content": json.dumps({"question": question, "rows": compact_rows}, default=str)},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or "No answer generated."
