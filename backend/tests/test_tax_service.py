from decimal import Decimal
import pytest

from app.core.exceptions import BadRequestException
from app.services.tax_service import TaxService


def test_valid_tax_calculation():
    """Verify standard tax calculation: unit_price * quantity * (tax_rate / 100)."""
    # 2 items @ 50.00 = 100.00 subtotal. 18% tax = 18.00
    tax = TaxService.calculate_item_tax(
        unit_price=Decimal("50.00"),
        quantity=2,
        tax_rate=Decimal("18.00")
    )
    assert tax == Decimal("18.00")

    line_total = TaxService.calculate_item_line_total(
        unit_price=Decimal("50.00"),
        quantity=2,
        tax_rate=Decimal("18.00")
    )
    assert line_total == Decimal("118.00")


def test_zero_tax_rate():
    """Verify zero tax produces zero tax amount and unchanged line total."""
    tax = TaxService.calculate_item_tax(
        unit_price=Decimal("125.50"),
        quantity=3,
        tax_rate=Decimal("0.00")
    )
    assert tax == Decimal("0.00")

    line_total = TaxService.calculate_item_line_total(
        unit_price=Decimal("125.50"),
        quantity=3,
        tax_rate=Decimal("0.00")
    )
    assert line_total == Decimal("376.50")


def test_invalid_negative_tax_rate():
    """Verify negative tax rates are strictly rejected."""
    with pytest.raises(BadRequestException) as exc_info:
        TaxService.validate_tax_rate(Decimal("-5.00"))
    assert "Tax rate cannot be negative" in str(exc_info.value.message)


def test_invalid_excessive_tax_rate():
    """Verify tax rate exceeding 100% is rejected."""
    with pytest.raises(BadRequestException) as exc_info:
        TaxService.validate_tax_rate(Decimal("105.00"))
    assert "Tax rate cannot exceed 100 percent" in str(exc_info.value.message)


def test_tax_decimal_rounding():
    """Verify ROUND_HALF_UP rounding behavior on fractional cents."""
    # 1 item @ 33.33 with 8.25% tax = 2.749725 -> rounds to 2.75
    tax = TaxService.calculate_item_tax(
        unit_price=Decimal("33.33"),
        quantity=1,
        tax_rate=Decimal("8.25")
    )
    assert tax == Decimal("2.75")

    # 1 item @ 33.33 with 8.24% tax = 2.746392 -> rounds to 2.75
    # 1 item @ 10.05 with 5.5% tax = 0.55275 -> rounds to 0.55
    tax2 = TaxService.calculate_item_tax(
        unit_price=Decimal("10.05"),
        quantity=1,
        tax_rate=Decimal("5.50")
    )
    assert tax2 == Decimal("0.55")


def test_multiple_invoice_items_tax_aggregation():
    """Verify total tax and subtotal calculations across multiple items."""
    items = [
        (Decimal("100.00"), 2),  # subtotal = 200.00
        (Decimal("45.50"), 1),   # subtotal = 45.50
        (Decimal("12.25"), 4),   # subtotal = 49.00
    ]
    subtotal = TaxService.calculate_subtotal(items)
    assert subtotal == Decimal("294.50")

    taxes = [
        TaxService.calculate_item_tax(Decimal("100.00"), 2, Decimal("10.00")),  # 20.00
        TaxService.calculate_item_tax(Decimal("45.50"), 1, Decimal("10.00")),   # 4.55
        TaxService.calculate_item_tax(Decimal("12.25"), 4, Decimal("10.00")),   # 4.90
    ]
    invoice_tax = TaxService.calculate_invoice_tax(taxes)
    assert invoice_tax == Decimal("29.45")
