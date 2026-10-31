# BillSync Phase 2: Frontend & Backend Integration Notes

**Developer:** Rudra (CHAUHANRUDRA24)  
**Backend Lead:** Prince (RANAPRINCE06)  
**Repository:** [https://github.com/RANAPRINCE06/BillSync](https://github.com/RANAPRINCE06/BillSync)

---

## 1. Feature Branches Pushed to GitHub

All work has been broken down and pushed to dedicated feature branches as requested:

- `rudra/layout` — Collapsible sidebar, topbar, role-based visibility, status badges mapped to `enums.py`.
- `rudra/auth` — Real-time password complexity validation (`validate_password_strength`), token interceptors, `APIResponse` envelope unwrap.
- `rudra/dashboard` — Dynamic revenue area chart (`recharts`), 5 KPI summary cards, recent invoices and subscriptions.
- `rudra/management-pages` — All CRUD views: Customers, Products, Subscription Plans, Quotations, Subscriptions, Invoices, Payments, and Settings.
- `main` — Merged with Prince's backend commit (`734ff70`) cleanly.

---

## 2. API Contract & Schema Alignment

- **Enums & Roles:** Fully synced with backend `enums.py` (`ADMIN`, `STAFF`, `CUSTOMER`; `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`; `CREDIT_CARD`, `BANK_TRANSFER`, `UPI`, `CASH`, `OTHER`; etc.).
- **Response Wrapper:** Frontend handles both unified `APIResponse[T]` (`{ success: true, data: ... }`) and direct payload structures automatically.
- **Error Formatting:** `getErrorMessage` extracts errors from backend `APIErrorResponse` (`{ success: false, error: { message, code } }`) and standard FastAPI `detail`.
- **Invoices:** Frontend matches Prince's `InvoiceDetailResponse` with `items`, `customer`, `balance_due`, `tax_amount`, and `discount_amount`.

---

## 3. Pending Backend Endpoints Needed from Prince

| Route | Method | Description |
|---|---|---|
| `/api/v1/auth/login` | `POST` | Issue JWT access token and user info |
| `/api/v1/auth/register` | `POST` | Register new user account |
| `/api/v1/auth/me` | `GET` | Current authenticated user profile |
| `/api/v1/dashboard/stats` | `GET` | Active subscriptions, customer count, revenue metrics |
| `/api/v1/dashboard/revenue-chart`| `GET` | Monthly revenue trend array `[{ month, revenue }]` |
| `/api/v1/customers` | `GET`, `POST` | List and create customers |
| `/api/v1/customers/{id}` | `GET`, `PUT` | Retrieve and update customer |
| `/api/v1/products` | `GET`, `POST`, `PUT` | Products catalog CRUD |
| `/api/v1/plans` | `GET`, `POST`, `PUT` | Subscription plans CRUD |
| `/api/v1/quotations` | `GET`, `POST` | List and create quotations |
| `/api/v1/quotations/{id}/convert`| `POST` | Convert accepted quotation into subscription |
| `/api/v1/subscriptions` | `GET`, `POST` | List and provision subscriptions |
| `/api/v1/subscriptions/{id}/pause`| `POST` | Pause active subscription |
| `/api/v1/subscriptions/{id}/renew`| `POST` | Renew/resume subscription |
| `/api/v1/subscriptions/{id}/close`| `POST` | Close subscription |
| `/api/v1/payments` | `GET`, `POST` | List and record payment against invoice |

*(Note: `/api/v1/invoices` and `/api/v1/invoices/{id}` are already live and tested!)*

