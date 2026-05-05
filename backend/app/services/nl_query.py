import json
import re
from typing import Any

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from backend.app.schemas import ChatResponse
from backend.app.services.llm import GroqClient
from backend.app.services.query_whitelist import validate_operation
from backend.app.services.ranking import SupplierRanker


class NaturalLanguageQueryEngine:
    def __init__(self, db: Session, cache: Redis) -> None:
        self.db = db
        self.cache = cache
        self.llm = GroqClient()
        self.ranker = SupplierRanker(db)

    def answer(self, question: str) -> ChatResponse:
        cache_key = f"chat:answer:v2:{question.strip().lower()}"
        cached = self._cache_get(cache_key)
        if cached:
            payload = json.loads(cached)
            return ChatResponse(**payload)

        try:
            plan = self.llm.plan_query(question)
        except Exception:
            plan = self._fallback_plan(question)
        validate_operation(plan.operation)
        rows = self._execute_plan(plan)
        try:
            answer = self.llm.summarize_answer(question, rows)
        except Exception:
            answer = self._fallback_summary(question, rows)
        response = ChatResponse(answer=answer, rows=rows)
        self._cache_set(cache_key, response.model_dump_json())
        return response

    def _execute_plan(self, plan) -> list[dict[str, Any]]:
        if plan.operation in {"supplier_compare", "best_price", "catalog_search"}:
            return self.ranker.ranked_items(plan)
        if plan.operation == "history_compare":
            return self.ranker.ranked_items(plan)
        if plan.operation == "supplier_activity":
            return self.ranker.ranked_items(plan)
        return []

    def _cache_get(self, key: str) -> str | None:
        try:
            return self.cache.get(key)
        except RedisError:
            return None

    def _cache_set(self, key: str, value: str) -> None:
        try:
            self.cache.setex(key, 300, value)
        except RedisError:
            return

    def _fallback_plan(self, question: str):
        from backend.app.schemas import QueryPlan

        normalized_question = question.lower()
        known_items = [
            "ascorbic acid",
            "paracetamol",
            "citric acid",
            "sodium benzoate",
            "magnesium stearate",
            "lactose monohydrate",
            "microcrystalline cellulose",
            "povidone k30",
            "ibuprofen",
            "caffeine anhydrous",
            "zinc sulphate",
            "calcium carbonate",
        ]
        item = next((name for name in known_items if name in normalized_question), None)
        if item is None and "vitamin c" in normalized_question:
            item = "ascorbic acid"

        quantities = [float(value.replace(",", "")) for value in re.findall(r"\d[\d,]*", question)]
        min_quantity = max(quantities) if quantities else None
        operation = "best_price" if any(word in normalized_question for word in ["cheap", "best", "price"]) else "catalog_search"
        return QueryPlan(operation=operation, normalized_name=item, min_quantity=min_quantity, limit=10)

    def _fallback_summary(self, question: str, rows: list[dict[str, Any]]) -> str:
        if not rows:
            return "No matching catalogue rows found."

        best = rows[0]
        lines = [
            (
                f"Best: {best['supplier_name']} - {best['normalized_name']} at "
                f"{best['price_per_unit']} {best['currency']}/{best['unit']}, "
                f"{best['available_qty']} {best['unit']} available."
            ),
            f"Why: lowest ranked price with reliability {best['reliability_score']}.",
        ]
        if len(rows) > 1:
            next_best = rows[1]
            lines.append(
                f"Next: {next_best['supplier_name']} at "
                f"{next_best['price_per_unit']} {next_best['currency']}/{next_best['unit']}."
            )
        return "\n".join(lines)
