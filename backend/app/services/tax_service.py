from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, List, Tuple, Union

from app.core.exceptions import BadRequestException

TWO_PLACES = Decimal("0.01")


class TaxService:
    """Service dedicated to reliable tax validation and financial calculations."""

    @staticmethod
    def to_decimal(value: Union[Decimal, float, int, str, None], field_name: str = "Amount") -> Decimal:
        """Converts and validates an arbitrary input into a precise financial Decimal."""
        if value is None:
            return Decimal("0.00")
        try:
            dec = Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
            return dec
        except Exception as exc:
            raise BadRequestException(f"Invalid decimal value for {field_name}: {value}") from exc

    @classmethod
    def validate_tax_rate(cls, tax_rate: Union[Decimal, float, int, str, None]) -> Decimal:
        """
        Validates the tax rate percentage.
        Rejects negative rates and rates exceeding 100%.
        """
        if tax_rate is None:
            return Decimal("0.00")

        dec_rate = cls.to_decimal(tax_rate, "Tax rate")
        if dec_rate < Decimal("0.00"):
            raise BadRequestException("Tax rate cannot be negative.")
        if dec_rate > Decimal("100.00"):
            raise BadRequestException("Tax rate cannot exceed 100 percent.")
        return dec_rate

    @classmethod
    def calculate_item_tax(
        cls,
        unit_price: Union[Decimal, float, int, str],
        quantity: int,
        tax_rate: Union[Decimal, float, int, str, None]
    ) -> Decimal:
        """
        Calculates tax for an individual line item using ROUND_HALF_UP.
        Formula: (quantity * unit_price) * (tax_rate / 100)
        """
        dec_price = cls.to_decimal(unit_price, "Unit price")
        if dec_price < Decimal("0.00"):
            raise BadRequestException("Unit price cannot be negative.")
        if quantity < 0:
            raise BadRequestException("Quantity cannot be negative.")

        dec_tax_rate = cls.validate_tax_rate(tax_rate)
        item_subtotal = (dec_price * Decimal(quantity)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        item_tax = ((item_subtotal * dec_tax_rate) / Decimal("100.00")).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )
        return item_tax

    @classmethod
    def calculate_item_line_total(
        cls,
        unit_price: Union[Decimal, float, int, str],
        quantity: int,
        tax_rate: Union[Decimal, float, int, str, None]
    ) -> Decimal:
        """
        Calculates the line total including tax for an invoice line item.
        Formula: line_subtotal + line_tax
        """
        dec_price = cls.to_decimal(unit_price, "Unit price")
        dec_tax_rate = cls.validate_tax_rate(tax_rate)
        subtotal = (dec_price * Decimal(quantity)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        tax = cls.calculate_item_tax(dec_price, quantity, dec_tax_rate)
        return (subtotal + tax).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    @classmethod
    def calculate_invoice_tax(cls, items_tax: Iterable[Decimal]) -> Decimal:
        """Sum total tax for all line items on an invoice."""
        total_tax = sum(items_tax, Decimal("0.00"))
        return total_tax.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    @classmethod
    def calculate_subtotal(cls, items: Iterable[Tuple[Union[Decimal, float, int, str], int]]) -> Decimal:
        """
        Calculates total subtotal across line items.
        Each item is (unit_price, quantity).
        """
        total = Decimal("0.00")
        for unit_price, quantity in items:
            dec_price = cls.to_decimal(unit_price, "Unit price")
            if dec_price < Decimal("0.00"):
                raise BadRequestException("Unit price cannot be negative.")
            if quantity < 0:
                raise BadRequestException("Quantity cannot be negative.")
            total += (dec_price * Decimal(quantity)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        return total.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
