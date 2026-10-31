from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple, Union
import uuid
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.models.discount import Discount
from app.models.enums import DiscountType

TWO_PLACES = Decimal("0.01")


class DiscountService:
    """Service managing discount policies, validation, calculation, and usage tracking."""

    @staticmethod
    def to_decimal(value: Union[Decimal, float, int, str, None], field_name: str = "Discount value") -> Decimal:
        """Converts and quantizes an input to two-decimal precision."""
        if value is None:
            return Decimal("0.00")
        try:
            return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        except Exception as exc:
            raise BadRequestException(f"Invalid decimal value for {field_name}: {value}") from exc

    @classmethod
    def validate_discount_entity(
        cls,
        discount: Discount,
        subtotal: Decimal,
        total_quantity: int = 1,
        at_time: Optional[datetime] = None
    ) -> Decimal:
        """
        Validates all business constraints on a discount entity against the order subtotal and quantity.
        Returns the calculated discount amount if valid, or raises BadRequestException.
        """
        now = at_time or datetime.now(timezone.utc)

        # 1. Active validation
        if not discount.is_active:
            raise BadRequestException(f"Discount '{discount.name}' is inactive.")

        # 2. Date window validation
        if discount.start_date and now < discount.start_date:
            raise BadRequestException(
                f"Discount '{discount.name}' is not yet active (starts on {discount.start_date.isoformat()})."
            )
        if discount.end_date and now > discount.end_date:
            raise BadRequestException(
                f"Discount '{discount.name}' has expired (ended on {discount.end_date.isoformat()})."
            )

        # 3. Usage limit validation
        usage_cnt = discount.usage_count if discount.usage_count is not None else 0
        if discount.usage_limit is not None and usage_cnt >= discount.usage_limit:
            raise BadRequestException(
                f"Discount '{discount.name}' has reached its maximum usage limit of {discount.usage_limit}."
            )

        # 4. Minimum quantity validation
        min_qty = discount.minimum_quantity if discount.minimum_quantity is not None else 1
        if total_quantity < min_qty:
            raise BadRequestException(
                f"Order quantity ({total_quantity}) does not meet the minimum requirement of "
                f"{min_qty} for discount '{discount.name}'."
            )

        # 5. Value checks
        dec_value = cls.to_decimal(discount.discount_value, "Discount value")
        if dec_value < Decimal("0.00"):
            raise BadRequestException(f"Discount value cannot be negative: {dec_value}")

        # 6. Type-specific calculation and bounds checking
        dec_subtotal = cls.to_decimal(subtotal, "Subtotal")

        if discount.discount_type == DiscountType.PERCENTAGE:
            if dec_value > Decimal("100.00"):
                raise BadRequestException(
                    f"Percentage discount cannot exceed 100 percent: {dec_value}%."
                )
            discount_amount = ((dec_subtotal * dec_value) / Decimal("100.00")).quantize(
                TWO_PLACES, rounding=ROUND_HALF_UP
            )
        elif discount.discount_type == DiscountType.FIXED:
            if dec_value > dec_subtotal:
                raise BadRequestException(
                    f"Fixed discount of {dec_value} cannot exceed eligible subtotal of {dec_subtotal}."
                )
            discount_amount = dec_value
        else:
            raise BadRequestException(f"Unsupported discount type: {discount.discount_type}")

        # Ensure discount amount does not exceed subtotal
        final_discount = min(discount_amount, dec_subtotal).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        return final_discount

    @classmethod
    def consume_discount_usage(cls, discount: Discount) -> None:
        """
        Increments the discount usage count.
        To be committed within the parent transaction.
        """
        discount.usage_count += 1

    @classmethod
    def get_discount_by_id(cls, db: Session, discount_id: uuid.UUID) -> Discount:
        """Fetch discount by ID or raise NotFoundException."""
        discount = db.get(Discount, discount_id)
        if not discount:
            raise NotFoundException(f"Discount with ID {discount_id} not found.")
        return discount

    @classmethod
    def get_discount_by_name(cls, db: Session, name: str) -> Optional[Discount]:
        """Fetch active discount by name/code (case-insensitive)."""
        stmt = select(Discount).where(func.lower(Discount.name) == name.strip().lower())
        return db.scalars(stmt).first()

    @classmethod
    def list_discounts(
        cls,
        db: Session,
        is_active_only: bool = False,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[Discount], int]:
        """Retrieve paginated list of discounts."""
        if page < 1:
            page = 1
        if size < 1 or size > 100:
            size = 20

        query = select(Discount)
        if is_active_only:
            query = query.where(Discount.is_active.is_(True))

        count_query = select(func.count()).select_from(query.subquery())
        total = db.scalar(count_query) or 0

        query = query.order_by(Discount.created_at.desc()).offset((page - 1) * size).limit(size)
        discounts = list(db.scalars(query).all())
        return discounts, total

    @classmethod
    def create_discount(
        cls,
        db: Session,
        name: str,
        discount_type: DiscountType,
        discount_value: Union[Decimal, float, int, str],
        minimum_quantity: int = 1,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        usage_limit: Optional[int] = None,
        is_active: bool = True
    ) -> Discount:
        """Create a new discount policy."""
        dec_val = cls.to_decimal(discount_value, "Discount value")
        if dec_val < Decimal("0.00"):
            raise BadRequestException("Discount value cannot be negative.")
        if discount_type == DiscountType.PERCENTAGE and dec_val > Decimal("100.00"):
            raise BadRequestException("Percentage discount cannot exceed 100 percent.")
        if minimum_quantity < 1:
            raise BadRequestException("Minimum quantity must be at least 1.")
        if start_date and end_date and end_date <= start_date:
            raise BadRequestException("End date must be strictly after start date.")
        if usage_limit is not None and usage_limit < 1:
            raise BadRequestException("Usage limit must be at least 1.")

        # Check for unique name collision if desired
        existing = db.scalars(select(Discount).where(func.lower(Discount.name) == name.strip().lower())).first()
        if existing:
            raise ConflictException(f"Discount policy with name '{name}' already exists.")

        discount = Discount(
            name=name.strip(),
            discount_type=discount_type,
            discount_value=dec_val,
            minimum_quantity=minimum_quantity,
            start_date=start_date,
            end_date=end_date,
            usage_limit=usage_limit,
            usage_count=0,
            is_active=is_active
        )
        db.add(discount)
        db.commit()
        db.refresh(discount)
        return discount

    @classmethod
    def update_discount(
        cls,
        db: Session,
        discount_id: uuid.UUID,
        name: Optional[str] = None,
        discount_type: Optional[DiscountType] = None,
        discount_value: Optional[Union[Decimal, float, int, str]] = None,
        minimum_quantity: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        usage_limit: Optional[int] = None,
        is_active: Optional[bool] = None
    ) -> Discount:
        """Update an existing discount policy."""
        discount = cls.get_discount_by_id(db, discount_id)

        if name is not None:
            name_clean = name.strip()
            existing = db.scalars(
                select(Discount).where(
                    func.lower(Discount.name) == name_clean.lower(),
                    Discount.id != discount.id
                )
            ).first()
            if existing:
                raise ConflictException(f"Discount with name '{name_clean}' already exists.")
            discount.name = name_clean

        if discount_type is not None:
            discount.discount_type = discount_type

        if discount_value is not None:
            dec_val = cls.to_decimal(discount_value, "Discount value")
            if dec_val < Decimal("0.00"):
                raise BadRequestException("Discount value cannot be negative.")
            current_type = discount_type or discount.discount_type
            if current_type == DiscountType.PERCENTAGE and dec_val > Decimal("100.00"):
                raise BadRequestException("Percentage discount cannot exceed 100 percent.")
            discount.discount_value = dec_val

        if minimum_quantity is not None:
            if minimum_quantity < 1:
                raise BadRequestException("Minimum quantity must be at least 1.")
            discount.minimum_quantity = minimum_quantity

        if start_date is not None:
            discount.start_date = start_date
        if end_date is not None:
            discount.end_date = end_date

        if discount.start_date and discount.end_date and discount.end_date <= discount.start_date:
            raise BadRequestException("End date must be strictly after start date.")

        if usage_limit is not None:
            if usage_limit < 0:
                raise BadRequestException("Usage limit cannot be negative.")
            discount.usage_limit = usage_limit

        if is_active is not None:
            discount.is_active = is_active

        db.commit()
        db.refresh(discount)
        return discount
