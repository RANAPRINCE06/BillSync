# BillSync Backend & Demo Preflight Guide

Prince, Backend & Finance Lead

This directory contains the FastAPI backend services, PostgreSQL database schema, SQLAlchemy models, migration files, and preflight tooling for **BillSync**.

---

## Architecture & Technology Stack

- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15+ with SQLAlchemy 2.0 ORM
- **Migrations**: Alembic
- **Authentication**: JWT (JSON Web Tokens) with HS256 & bcrypt password hashing
- **Testing**: pytest & FastAPI TestClient

---

## Safe Demo Account Provisioning

BillSync provides an idempotent, non-destructive provisioning script designed specifically for local hackathon demonstrations.

### Safety Guarantees
1. **Refuses Production Environments**: Automatically aborts if `ENVIRONMENT` or `BILLSYNC_ENV` is set to `production`, `prod`, or `live`, or if the database URL points to production hosts.
2. **Never Overwrites Existing Credentials**: If an account already exists in the database, its password, role, and details are preserved completely unchanged.
3. **No Hardcoded Plaintext Secrets**: Passwords are supplied strictly at runtime via environment variables, CLI arguments, or interactive prompt (`getpass`). Plaintext passwords are never stored in source code, committed files, or logs.
4. **Tenant Isolation Guarantee**: Customer accounts are automatically linked to a dedicated `Customer` profile record in the database.
5. **Non-Destructive**: Leaves existing financial records (quotations, subscriptions, invoices, payments) completely untouched.

### Provisioning Commands

#### 1. Dry Run / Inspection Mode
Inspect planned actions without modifying the database:
```bash
python backend/scripts/seed_demo_accounts.py --dry-run
```

#### 2. Verification Mode
Check whether existing demo accounts are present and healthy:
```bash
python backend/scripts/seed_demo_accounts.py --verify-only
```

#### 3. Live Demo Provisioning via Environment Variables
```bash
# PowerShell
$env:DEMO_ADMIN_PASSWORD="<ADMIN_PASSWORD>"
$env:DEMO_STAFF_PASSWORD="<STAFF_PASSWORD>"
$env:DEMO_CUSTOMER_PASSWORD="<CUSTOMER_PASSWORD>"
python backend/scripts/seed_demo_accounts.py
Remove-Item env:DEMO_ADMIN_PASSWORD, env:DEMO_STAFF_PASSWORD, env:DEMO_CUSTOMER_PASSWORD

# Bash / Linux / macOS
DEMO_ADMIN_PASSWORD="<ADMIN_PASSWORD>" \
DEMO_STAFF_PASSWORD="<STAFF_PASSWORD>" \
DEMO_CUSTOMER_PASSWORD="<CUSTOMER_PASSWORD>" \
python backend/scripts/seed_demo_accounts.py
```

#### 4. Live Demo Provisioning via CLI Arguments
```bash
python backend/scripts/seed_demo_accounts.py \
  --admin-pass "<ADMIN_PASSWORD>" \
  --staff-pass "<STAFF_PASSWORD>" \
  --customer-pass "<CUSTOMER_PASSWORD>"
```

---

## Backend Preflight & Testing

Run the full automated test suite (including health checks, auth flows, role restrictions, tenant isolation, and PDF generation):

```bash
pytest backend/tests
```

Run only the demo provisioning and preflight verification test suites:
```bash
pytest backend/tests/test_demo_account_provisioning.py
pytest backend/tests/test_demo_backend_preflight.py
```

---

## Environment & Security Recommendations

- **Development**: Ensure `.env` is listed in `.gitignore` and never committed to source control.
- **Production**:
  - Rotate `SECRET_KEY` with a cryptographically strong 64-character secret.
  - Set `ENVIRONMENT=production` and `DEBUG=False`.
  - Disallow CORS wildcards; specify strictly allowed production domains.
  - Restrict access to database ports and use SSL-enforced database connections (`sslmode=require`).
