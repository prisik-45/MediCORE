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
            "available_qty, unit, valid_until when present, supplier_sku, lead_time_days, and notes. "
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
            "Allowed operations: supplier_compare, best_price, catalog_search, history_compare, "
            "supplier_activity. Do not emit SQL. Use normalized_name for ingredient filters, "
            "min_quantity for stock requirements, and semantic_query for fuzzy product intent."
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
                        "You are MediCORE's friendly procurement assistant. Respond in a natural, conversational tone "
                        "as if you're chatting with a colleague. Return plain text only—no markdown, tables, or bullet points. "
                        "The dashboard already shows the full data, so focus on giving practical buying advice. "
                        "Be concise (2-3 sentences) and mention the best option with key details like price, quantity, and supplier. "
                        "If there are good alternatives or concerns, weave them naturally into your response."
                    ),
                },
                {"role": "user", "content": json.dumps({"question": question, "rows": compact_rows}, default=str)},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or "No answer generated."
