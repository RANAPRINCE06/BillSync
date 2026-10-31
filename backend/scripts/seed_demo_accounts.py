#!/usr/bin/env python3
"""
BillSync Safe Demo Account Provisioning Script
Prince, Backend & Finance Lead

Safely and idempotently provisions local/demo accounts required for hackathon presentations.
Strictly safeguards against execution in production environments.
Never hardcodes, logs, or prints plaintext credentials, password hashes, or secrets.
"""

import argparse
import getpass
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add backend directory to sys.path so modules resolve correctly
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.user import User

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("billsync.seed_demo")

# Metadata definition for demo accounts (strictly without hardcoded plaintext passwords)
DEMO_ACCOUNTS_METADATA = [
    {
        "role": UserRole.ADMIN,
        "email": "admin@billsync.com",
        "name": "Rudra Chauhan (Admin)",
        "env_var": "DEMO_ADMIN_PASSWORD",
        "cli_arg": "admin_pass",
    },
    {
        "role": UserRole.STAFF,
        "email": "staff@billsync.com",
        "name": "Staff Operator",
        "env_var": "DEMO_STAFF_PASSWORD",
        "cli_arg": "staff_pass",
    },
    {
        "role": UserRole.CUSTOMER,
        "email": "customer@billsync.com",
        "name": "Acme Corp (Customer)",
        "env_var": "DEMO_CUSTOMER_PASSWORD",
        "cli_arg": "customer_pass",
        "phone": "+1-800-555-0199",
        "billing_address": "500 Market Street, Suite 1200, San Francisco, CA 94105",
    },
]


class EnvironmentSafetyError(RuntimeError):
    """Raised when script is invoked in an unsafe or production environment."""
    pass


class MissingCredentialError(ValueError):
    """Raised when required credentials are not supplied via env, CLI, or input."""
    pass


def check_environment_safety() -> None:
    """
    Refuses execution if configured for production environments or production database hosts.
    Guarantees that demo provisioning never runs against live production infrastructure.
    """
    # Check application configuration environment
    app_env = (settings.ENVIRONMENT or "").strip().lower()
    if app_env in ("production", "prod", "live"):
        raise EnvironmentSafetyError(
            f"SAFETY ABORT: Refusing to run demo provisioning in '{app_env}' environment."
        )

    # Check process environment variable overrides
    system_env = os.getenv("BILLSYNC_ENV", "").strip().lower()
    if system_env in ("production", "prod", "live"):
        raise EnvironmentSafetyError(
            f"SAFETY ABORT: BILLSYNC_ENV is set to '{system_env}'. Execution blocked."
        )

    # Check database URI for production signatures
    db_uri = settings.SQLALCHEMY_DATABASE_URI.lower()
    forbidden_indicators = ["prod-db", "rds.amazonaws.com", "cloudsql", "cockroachlabs.cloud"]
    for indicator in forbidden_indicators:
        if indicator in db_uri and "test" not in db_uri and "mock" not in db_uri:
            raise EnvironmentSafetyError(
                f"SAFETY ABORT: Database URI appears to target production host '{indicator}'. Execution blocked."
            )


def _resolve_password_for_account(
    account_meta: Dict[str, Any],
    passwords_override: Optional[Dict[str, str]] = None,
    interactive_prompt: bool = True
) -> str:
    """
    Resolves password securely from overrides, environment variables, or interactive prompt.
    Never stores or returns hardcoded default passwords.
    """
    email = account_meta["email"]
    env_var = account_meta["env_var"]
    cli_arg = account_meta["cli_arg"]

    # 1. Check direct override dictionary
    if passwords_override and email in passwords_override and passwords_override[email]:
        return passwords_override[email]

    # 2. Check dedicated environment variable
    env_val = os.getenv(env_var)
    if env_val and env_val.strip():
        return env_val.strip()

    # 3. Check interactive terminal prompt if attached to a TTY
    if interactive_prompt and sys.stdin.isatty():
        prompt_val = getpass.getpass(f"Enter password for {email} ({account_meta['role'].value}): ")
        if prompt_val and prompt_val.strip():
            return prompt_val.strip()

    raise MissingCredentialError(
        f"Password for demo account '{email}' was not provided. "
        f"Supply it via the '{env_var}' environment variable or '--{cli_arg.replace('_', '-')}' argument."
    )


def verify_demo_accounts(
    db: Session,
    accounts_metadata: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Verifies the existence, role assignment, and integrity of all demo accounts
    without revealing passwords, hashes, or tokens.
    """
    metadata = accounts_metadata or DEMO_ACCOUNTS_METADATA
    results: List[Dict[str, Any]] = []
    all_ready = True

    for item in metadata:
        email = item["email"]
        expected_role = item["role"]

        user = db.scalar(select(User).where(User.email == email))
        if not user:
            results.append({
                "email": email,
                "expected_role": expected_role.value,
                "actual_role": None,
                "is_active": False,
                "customer_linked": False,
                "status": "MISSING",
                "ready": False
            })
            all_ready = False
            continue

        role_match = (user.role == expected_role)
        customer_linked = False

        if expected_role == UserRole.CUSTOMER:
            cust = db.scalar(select(Customer).where(Customer.user_id == user.id))
            customer_linked = (cust is not None)
            account_ready = (role_match and user.is_active and customer_linked)
        else:
            account_ready = (role_match and user.is_active)

        if not account_ready:
            all_ready = False

        results.append({
            "email": email,
            "expected_role": expected_role.value,
            "actual_role": user.role.value,
            "is_active": user.is_active,
            "customer_linked": customer_linked,
            "status": "VALID" if account_ready else "INVALID",
            "ready": account_ready
        })

    return {
        "all_ready": all_ready,
        "accounts": results,
    }


def provision_demo_accounts(
    db: Session,
    passwords_override: Optional[Dict[str, str]] = None,
    dry_run: bool = False,
    interactive_prompt: bool = False,
    accounts_metadata: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Idempotently provisions local demo accounts without modifying unrelated database records.
    Never overwrites existing users' passwords or roles.
    Guarantees linked Customer records for Customer accounts.
    """
    check_environment_safety()
    passwords_override = passwords_override or {}
    metadata = accounts_metadata or DEMO_ACCOUNTS_METADATA

    created_count = 0
    existing_count = 0
    details: List[Dict[str, Any]] = []

    for item in metadata:
        email = item["email"]
        role = item["role"]
        name = item["name"]

        # Check for existing user account
        user = db.scalar(select(User).where(User.email == email))

        if user:
            existing_count += 1
            logger.info(
                "[EXISTING] Demo user '%s' already exists (role=%s, active=%s). Preserving existing credentials.",
                email,
                user.role.value,
                user.is_active
            )

            # Ensure customer profile is properly linked for customer users
            cust_linked = False
            if user.role == UserRole.CUSTOMER:
                cust = db.scalar(select(Customer).where(Customer.user_id == user.id))
                if not cust:
                    # Check if an unlinked customer profile with the same email exists
                    cust = db.scalar(select(Customer).where(Customer.email == email))
                    if cust:
                        if not dry_run:
                            cust.user_id = user.id
                            db.commit()
                        logger.info("Linked existing unassigned Customer record to user '%s'.", email)
                        cust_linked = True
                    else:
                        if not dry_run:
                            new_cust = Customer(
                                user_id=user.id,
                                name=name,
                                email=email,
                                phone=item.get("phone", "+1-800-555-0199"),
                                billing_address=item.get("billing_address", "Default Demo Billing Address")
                            )
                            db.add(new_cust)
                            db.commit()
                        logger.info("Created missing Customer record for existing customer user '%s'.", email)
                        cust_linked = True
                else:
                    cust_linked = True

            details.append({
                "email": email,
                "role": user.role.value,
                "status": "EXISTING",
                "customer_linked": cust_linked if role == UserRole.CUSTOMER else None,
                "active": user.is_active
            })
            continue

        # Account does not exist: Resolve password securely
        if dry_run:
            logger.info("[DRY-RUN] Would create demo user '%s' with role '%s'.", email, role.value)
            details.append({
                "email": email,
                "role": role.value,
                "status": "WOULD_CREATE",
                "customer_linked": True if role == UserRole.CUSTOMER else None,
                "active": True
            })
            continue

        raw_password = _resolve_password_for_account(
            account_meta=item,
            passwords_override=passwords_override,
            interactive_prompt=interactive_prompt
        )

        pwd_hash = get_password_hash(raw_password)

        new_user = User(
            name=name,
            email=email,
            password_hash=pwd_hash,
            role=role,
            is_active=True
        )
        db.add(new_user)
        db.flush()

        # Provision linked Customer record for Customer role
        if role == UserRole.CUSTOMER:
            cust = db.scalar(select(Customer).where(Customer.email == email))
            if cust:
                cust.user_id = new_user.id
            else:
                new_cust = Customer(
                    user_id=new_user.id,
                    name=name,
                    email=email,
                    phone=item.get("phone", "+1-800-555-0199"),
                    billing_address=item.get("billing_address", "Default Demo Billing Address")
                )
                db.add(new_cust)

        db.commit()
        db.refresh(new_user)
        created_count += 1
        logger.info("[CREATED] Successfully provisioned '%s' with role '%s'.", email, role.value)
        details.append({
            "email": email,
            "role": role.value,
            "status": "CREATED",
            "customer_linked": True if role == UserRole.CUSTOMER else None,
            "active": True
        })

    return {
        "created": created_count,
        "existing": existing_count,
        "total": len(DEMO_ACCOUNTS_METADATA),
        "details": details,
        "dry_run": dry_run
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safely and idempotently provision local demo accounts for BillSync hackathon."
    )
    parser.add_argument("--admin-pass", dest="admin_pass", help="Password for admin@billsync.com")
    parser.add_argument("--staff-pass", dest="staff_pass", help="Password for staff@billsync.com")
    parser.add_argument("--customer-pass", dest="customer_pass", help="Password for customer@billsync.com")
    parser.add_argument("--dry-run", action="store_true", help="Inspect and report planned actions without modifying DB")
    parser.add_argument("--verify-only", action="store_true", help="Verify existing demo accounts without provisioning")

    args = parser.parse_args()

    # Pre-execution safety check
    try:
        check_environment_safety()
    except EnvironmentSafetyError as err:
        logger.error(str(err))
        sys.exit(1)

    overrides: Dict[str, str] = {}
    if args.admin_pass:
        overrides["admin@billsync.com"] = args.admin_pass
    if args.staff_pass:
        overrides["staff@billsync.com"] = args.staff_pass
    if args.customer_pass:
        overrides["customer@billsync.com"] = args.customer_pass

    with SessionLocal() as db:
        if args.verify_only:
            logger.info("Running demo account verification check...")
            verification = verify_demo_accounts(db)
            for acc in verification["accounts"]:
                logger.info(
                    "Account: %s | Role: %s | Active: %s | Linked Customer: %s | Status: %s",
                    acc["email"],
                    acc["actual_role"],
                    acc["is_active"],
                    acc["customer_linked"],
                    acc["status"]
                )
            if verification["all_ready"]:
                logger.info("All demo accounts are verified and ready for demonstration.")
                sys.exit(0)
            else:
                logger.warning("One or more demo accounts are missing or misconfigured.")
                sys.exit(2)

        try:
            result = provision_demo_accounts(
                db=db,
                passwords_override=overrides,
                dry_run=args.dry_run,
                interactive_prompt=True
            )
        except MissingCredentialError as err:
            logger.error("Provisioning halted: %s", err)
            sys.exit(1)
        except Exception as exc:
            logger.exception("Unexpected error during demo account provisioning: %s", exc)
            sys.exit(1)

        logger.info(
            "Demo Account Provisioning Summary: %d created, %d existing, %d total (dry_run=%s).",
            result["created"],
            result["existing"],
            result["total"],
            result["dry_run"]
        )


if __name__ == "__main__":
    main()
