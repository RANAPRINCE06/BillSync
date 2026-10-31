import os
import pytest
from unittest.mock import patch
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.quotation import Quotation
from app.models.subscription import Subscription
from app.models.user import User
from scripts.seed_demo_accounts import (
    DEMO_ACCOUNTS_METADATA,
    EnvironmentSafetyError,
    MissingCredentialError,
    _resolve_password_for_account,
    check_environment_safety,
    provision_demo_accounts,
    verify_demo_accounts,
)


def test_environment_safety_blocks_production():
    """Confirms that safety checks immediately block execution in production environments."""
    # 1. Block by settings.ENVIRONMENT
    with patch.object(settings, "ENVIRONMENT", "production"):
        with pytest.raises(EnvironmentSafetyError, match="SAFETY ABORT.*production"):
            check_environment_safety()

    with patch.object(settings, "ENVIRONMENT", "prod"):
        with pytest.raises(EnvironmentSafetyError, match="SAFETY ABORT.*prod"):
            check_environment_safety()

    with patch.object(settings, "ENVIRONMENT", "live"):
        with pytest.raises(EnvironmentSafetyError, match="SAFETY ABORT.*live"):
            check_environment_safety()

    # 2. Block by BILLSYNC_ENV environment variable
    with patch.object(settings, "ENVIRONMENT", "development"):
        with patch.dict(os.environ, {"BILLSYNC_ENV": "production"}):
            with pytest.raises(EnvironmentSafetyError, match="BILLSYNC_ENV is set to 'production'"):
                check_environment_safety()

    # 3. Block by production host signature in database URI
    with patch.object(settings, "ENVIRONMENT", "development"):
        with patch.object(settings, "DATABASE_URL", "postgresql://user:pass@prod-db.internal/billsync"):
            with pytest.raises(EnvironmentSafetyError, match="appears to target production host"):
                check_environment_safety()


def test_resolve_password_validation():
    """Validates secure password resolution without fallback to hardcoded passwords."""
    meta = DEMO_ACCOUNTS_METADATA[0]

    # Fails when no credentials provided
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(MissingCredentialError, match="Password for demo account"):
            _resolve_password_for_account(meta, passwords_override={}, interactive_prompt=False)

    # Resolves from overrides dictionary
    pwd_override = _resolve_password_for_account(
        meta,
        passwords_override={meta["email"]: "CustomOverride@987"},
        interactive_prompt=False
    )
    assert pwd_override == "CustomOverride@987"

    # Resolves from environment variable
    with patch.dict(os.environ, {meta["env_var"]: "EnvPass@54321"}):
        pwd_env = _resolve_password_for_account(meta, passwords_override={}, interactive_prompt=False)
        assert pwd_env == "EnvPass@54321"


def test_provision_isolated_accounts_idempotency_and_integrity(db_session: Session):
    """
    Verifies that provisioning is safe, idempotent, creates linked customer profiles,
    and never overwrites existing credentials on subsequent runs using dedicated test metadata.
    """
    isolated_metadata = [
        {
            "role": UserRole.ADMIN,
            "email": "test_prov_admin@example.com",
            "name": "Test Prov Admin",
            "env_var": "TEST_PROV_ADMIN_PASSWORD",
            "cli_arg": "admin_pass",
        },
        {
            "role": UserRole.STAFF,
            "email": "test_prov_staff@example.com",
            "name": "Test Prov Staff",
            "env_var": "TEST_PROV_STAFF_PASSWORD",
            "cli_arg": "staff_pass",
        },
        {
            "role": UserRole.CUSTOMER,
            "email": "test_prov_cust@example.com",
            "name": "Test Prov Customer",
            "env_var": "TEST_PROV_CUSTOMER_PASSWORD",
            "cli_arg": "customer_pass",
            "phone": "+1-555-019-9000",
            "billing_address": "123 Test Avenue, Test City",
        },
    ]

    test_passwords = {
        "test_prov_admin@example.com": "TestAdminPass@123",
        "test_prov_staff@example.com": "TestStaffPass@123",
        "test_prov_cust@example.com": "TestCustPass@123",
    }

    try:
        # Pre-cleanup in case of aborted previous runs
        for item in isolated_metadata:
            c = db_session.scalar(select(Customer).where(Customer.email == item["email"]))
            if c:
                db_session.delete(c)
            u = db_session.scalar(select(User).where(User.email == item["email"]))
            if u:
                db_session.delete(u)
        db_session.commit()

        # Count existing financial records
        initial_inv_count = db_session.scalar(select(func.count(Invoice.id)))
        initial_sub_count = db_session.scalar(select(func.count(Subscription.id)))
        initial_quo_count = db_session.scalar(select(func.count(Quotation.id)))
        initial_pay_count = db_session.scalar(select(func.count(Payment.id)))

        # 1. Run dry-run first
        dry_result = provision_demo_accounts(
            db=db_session,
            passwords_override=test_passwords,
            dry_run=True,
            interactive_prompt=False,
            accounts_metadata=isolated_metadata
        )
        assert dry_result["dry_run"] is True
        assert dry_result["created"] == 0

        # Verify no users were created during dry run
        for item in isolated_metadata:
            assert db_session.scalar(select(User).where(User.email == item["email"])) is None

        # 2. First live provisioning run
        result1 = provision_demo_accounts(
            db=db_session,
            passwords_override=test_passwords,
            dry_run=False,
            interactive_prompt=False,
            accounts_metadata=isolated_metadata
        )
        assert result1["created"] == 3
        assert result1["existing"] == 0

        # 3. Verify accounts exist with correct roles and password hashing
        admin_user = db_session.scalar(select(User).where(User.email == "test_prov_admin@example.com"))
        assert admin_user is not None
        assert admin_user.role == UserRole.ADMIN
        assert verify_password("TestAdminPass@123", admin_user.password_hash)

        staff_user = db_session.scalar(select(User).where(User.email == "test_prov_staff@example.com"))
        assert staff_user is not None
        assert staff_user.role == UserRole.STAFF
        assert verify_password("TestStaffPass@123", staff_user.password_hash)

        cust_user = db_session.scalar(select(User).where(User.email == "test_prov_cust@example.com"))
        assert cust_user is not None
        assert cust_user.role == UserRole.CUSTOMER
        assert verify_password("TestCustPass@123", cust_user.password_hash)

        # 4. Verify linked Customer record
        customer_rec = db_session.scalar(select(Customer).where(Customer.user_id == cust_user.id))
        assert customer_rec is not None
        assert customer_rec.email == "test_prov_cust@example.com"
        assert customer_rec.user_id == cust_user.id

        # 5. Verify status using verify_demo_accounts helper
        verification = verify_demo_accounts(db_session, accounts_metadata=isolated_metadata)
        assert verification["all_ready"] is True
        for acc in verification["accounts"]:
            assert acc["status"] == "VALID"
            assert acc["ready"] is True

        # 6. Second run with DIFFERENT passwords - must leave existing credentials and roles unchanged!
        changed_passwords = {
            "test_prov_admin@example.com": "ShouldNotBeOverwritten@999",
            "test_prov_staff@example.com": "ShouldNotBeOverwritten@999",
            "test_prov_cust@example.com": "ShouldNotBeOverwritten@999",
        }
        result2 = provision_demo_accounts(
            db=db_session,
            passwords_override=changed_passwords,
            dry_run=False,
            interactive_prompt=False,
            accounts_metadata=isolated_metadata
        )
        assert result2["created"] == 0
        assert result2["existing"] == 3

        # Confirm passwords were not overwritten
        db_session.refresh(admin_user)
        db_session.refresh(staff_user)
        db_session.refresh(cust_user)
        assert verify_password("TestAdminPass@123", admin_user.password_hash)
        assert not verify_password("ShouldNotBeOverwritten@999", admin_user.password_hash)

        # 7. Confirm unrelated financial records remained untouched
        assert db_session.scalar(select(func.count(Invoice.id))) == initial_inv_count
        assert db_session.scalar(select(func.count(Subscription.id))) == initial_sub_count
        assert db_session.scalar(select(func.count(Quotation.id))) == initial_quo_count
        assert db_session.scalar(select(func.count(Payment.id))) == initial_pay_count

    finally:
        # Cleanup isolated test records
        for item in isolated_metadata:
            c = db_session.scalar(select(Customer).where(Customer.email == item["email"]))
            if c:
                db_session.delete(c)
            u = db_session.scalar(select(User).where(User.email == item["email"]))
            if u:
                db_session.delete(u)
        db_session.commit()
