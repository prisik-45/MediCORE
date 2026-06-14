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
            "Extract supplier catalogue rows into strict JSON. Return an object with an items array. "
            "Each item must include ingredient_name, normalized_name, price_per_unit, currency, "
            "available_qty, unit, valid_until when present, supplier_sku, lead_time_days, moq, and notes. "
            "Extract lead_time_days as number of days (e.g. 5). Extract moq (minimum order quantity) as numeric value if present. "
            "Normalize medicine/API names to lowercase canonical names. Convert INR/Rs/₹ to INR."
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
                "reliability": row.get("reliability_score"),
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
