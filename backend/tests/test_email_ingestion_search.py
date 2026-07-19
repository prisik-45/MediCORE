import unittest
from datetime import UTC, datetime
from types import SimpleNamespace

from backend.app.schemas import ExtractedCatalogItem
from backend.app.services.catalog_table_parser import parse_catalog_table_text
from backend.app.services.email_ingestion import EmailIngestionService
from backend.app.services.nl_query import NaturalLanguageQueryEngine


class EmailIngestionSearchCriteriaTest(unittest.TestCase):
    def setUp(self) -> None:
        self.service = EmailIngestionService(db=SimpleNamespace())

    def test_approach_1_supplier_label_includes_seen_messages(self) -> None:
        account = SimpleNamespace(created_at=datetime(2026, 7, 17, tzinfo=UTC))

        args = self.service._imap_search_args_for_approach("approach_1", account)

        self.assertEqual(args, ("ALL",))
        self.assertNotIn("UNSEEN", args)

    def test_approach_2_new_to_system_is_not_based_on_seen_state(self) -> None:
        account = SimpleNamespace(created_at=datetime(2026, 7, 17, tzinfo=UTC))

        args = self.service._imap_search_args_for_approach("approach_2", account)

        self.assertEqual(args, ("SINCE", "17-Jul-2026"))
        self.assertNotIn("UNSEEN", args)

    def test_parser_preserves_lead_time_range_text(self) -> None:
        rows = parse_catalog_table_text(
            "Product | Qty | Unit | Price | Currency | Lead\n"
            "Citric Acid | 3.88 | kg | 12.75 | USD | 40-50 days\n"
        )

        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0].lead_time_days)
        self.assertEqual(rows[0].lead_time_text, "40-50 days")
        self.assertEqual(rows[0].available_qty, 3.88)

    def test_structured_parser_rows_do_not_block_llm_unstructured_rows(self) -> None:
        service = object.__new__(EmailIngestionService)
        service.llm = SimpleNamespace(
            extract_catalog_items=lambda text, reference_date=None: [
                ExtractedCatalogItem(
                    ingredient_name="Aspirin USP",
                    normalized_name="aspirin",
                    price_per_unit=9.25,
                    currency="USD",
                    available_qty=7.5,
                    unit="kg",
                    notes="source='Aspirin USP stock 7.5 kg price USD 9.25/kg'",
                )
            ]
        )

        rows = service._extract_items_from_text(
            "Product | Qty | Unit | Price | Currency | Lead\n"
            "Citric Acid | 3.88 | kg | 12.75 | USD | 40-50 days\n"
            "Aspirin USP stock 7.5 kg price USD 9.25/kg\n",
            "catalog.pdf",
            reference_date=datetime(2026, 7, 17, tzinfo=UTC),
        )

        names = {row.normalized_name for row in rows}
        self.assertIn("citric acid", names)
        self.assertIn("aspirin", names)

    def test_parser_keeps_rows_with_na_price_as_incomplete_items(self) -> None:
        rows = parse_catalog_table_text(
            "Product | Qty | Unit | Price | Currency | Lead\n"
            "Sodium Chloride | 399.42 | kg | NA | USD |\n"
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].ingredient_name, "Sodium Chloride")
        self.assertIsNone(rows[0].price_per_unit)
        self.assertEqual(rows[0].available_qty, 399.42)
        self.assertEqual(rows[0].unit, "kg")

    def test_parser_preserves_currency_and_quantity_unit_from_cells(self) -> None:
        rows = parse_catalog_table_text(
            "Product | Quantity | Price\n"
            "Vitamin C | 8400 kg | INR 99.02\n"
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].price_per_unit, 99.02)
        self.assertEqual(rows[0].currency, "INR")
        self.assertEqual(rows[0].available_qty, 8400.0)
        self.assertEqual(rows[0].unit, "kg")
        self.assertIn("original_price=INR 99.02", rows[0].notes or "")
        self.assertIn("original_quantity=8400 kg", rows[0].notes or "")

    def test_display_payload_adds_unit_when_quantity_cell_is_numeric_only(self) -> None:
        service = object.__new__(EmailIngestionService)
        item = ExtractedCatalogItem(
            ingredient_name="Sea Moss Powder",
            normalized_name="sea moss powder",
            price_per_unit=11.0,
            currency="USD",
            available_qty=446.02,
            unit="kg",
            notes="original_quantity=446.02; original_price=CIF Vancouver $11.00/kg",
        )

        payload = service._exact_display_payload(item, "Sea Moss Powder | 446.02 | kg | CIF Vancouver $11.00/kg")

        self.assertEqual(payload["quantity_display"], "446.02 kg")
        self.assertEqual(payload["price_display"], "CIF Vancouver $11.00/kg")

    def test_assistant_replaces_false_negative_when_rows_exist(self) -> None:
        engine = object.__new__(NaturalLanguageQueryEngine)

        self.assertTrue(engine._looks_like_false_negative("I couldn't find any matching data for Nicotinamide."))
        summary = engine._fallback_summary(
            "find supplier for Nicotinamide",
            [
                {
                    "supplier_name": "Prince Sikotra",
                    "ingredient_name": "Nicotinamide (Vitamin B3)",
                    "normalized_name": "nicotinamide (vitamin b3)",
                    "price_per_unit": 10.5,
                    "price_display": "CIF Vancouver $10.50/kg",
                    "currency": "USD",
                    "available_qty": 9.99,
                    "quantity_display": "9.99 kg",
                    "unit": "kg",
                }
            ],
        )

        self.assertIn("nicotinamide", summary.lower())
        self.assertIn("Prince Sikotra", summary)


if __name__ == "__main__":
    unittest.main()
