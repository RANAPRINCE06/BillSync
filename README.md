# BillSync – Subscription Management System

<p align="center">
  <img src="public/logo.png" alt="BillSync Logo" width="100" height="100" />
</p>

BillSync is a modern web application designed to help businesses manage their customers, products, subscription plans, quotations, recurring invoices, and payments from one place.

Instead of managing these activities separately, BillSync brings the complete subscription and billing process into one unified system.

---

## Why BillSync?

Businesses that offer subscriptions need to keep track of customers, billing dates, invoices, payments, and renewals.

Managing all this manually can become difficult, especially when the number of customers and subscriptions increases.

BillSync makes this process seamless by keeping everything organized and providing a clear, real-time view of subscription and payment status.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Shows business activity, revenue trends, active subscriptions, and pending payments. |
| **Customers** | Stores and manages complete customer profiles and contact information. |
| **Products** | Manages products, variants, base prices, variant extra pricing, and product types. |
| **Subscription Plans** | Creates plans with configurable pricing, billing periods, and lifecycle rules. |
| **Quotations** | Prepares professional quotations for customers before confirming subscriptions. |
| **Subscriptions** | Manages active, paused, renewed, and closed subscriptions with automated scheduling. |
| **Invoices** | Creates, tracks, confirms, downloads, and prints customer invoices with tax calculation. |
| **Discounts** | Manages fixed and percentage-based promotional and recurring discounts. |
| **Payments** | Records payments and tracks outstanding balances and overdue invoices. |
| **User Management** | Admin-facing screens to manage staff accounts, roles, and access permissions. |
| **Customer Portal** | Dedicated self-service portal for customers to check subscriptions, invoices, and payment history. |

---

## How BillSync Works

The system follows a complete end-to-end lifecycle from customer onboarding to recurring revenue collection.

```text
        Add Customer
             |
             v
       Add Products
             |
             v
    Create Subscription Plan
             |
             v
      Prepare Quotation
             |
             v
     Confirm Quotation
             |
             v
    Create Subscription
             |
             v
    Activate Subscription
             |
             v
     Generate Invoice
             |
             v
      Record Payment
             |
             v
    Update Payment Status
             |
             v
      View Dashboard
```

### Step-by-Step Workflow

1. **Add Customers**  
   Add customer details such as name, email, phone number, address, and notes. Customer records can be viewed, searched, and updated whenever needed.

2. **Add Products**  
   Create products with their names, types, sales prices, cost prices, and available variants with dynamic price adjustments.

3. **Create Subscription Plans**  
   Set up subscription plans by defining price, billing frequency, minimum quantity, availability dates, and lifecycle policies (Pause, Early Close, Renewal, Auto-Close).  
   *Available billing frequencies:* **Daily**, **Weekly**, **Monthly**, **Yearly**.

4. **Prepare Quotations**  
   Select a customer and add the required products or subscription plans. Set quantities, prices, taxes, and validity dates before saving drafts or confirming quotations.

5. **Create Subscriptions**  
   Once a quotation is confirmed, create a subscription using the selected plan and line items. Subscriptions can be activated, paused, resumed, renewed, or closed according to plan settings.

6. **Generate Invoices**  
   Invoices are generated according to the subscription billing schedule. Each invoice contains customer details, product information, quantities, unit prices, taxes, and the total amount.

7. **Record Payments**  
   Record payments against invoices and update their status. The system tracks paid amounts, remaining balances, and overdue invoices.

8. **Track Business Activity**  
   The dashboard provides an overview of:
   - Total customers
   - Active subscriptions
   - Total revenue
   - Payments received
   - Outstanding payments
   - Overdue invoices
   - Subscription growth and renewal trends

---

## Subscription Management

BillSync supports the following subscription lifecycle actions:

| Action | Description |
|---|---|
| **Activate** | Starts a confirmed subscription and initiates the billing cycle. |
| **Pause** | Temporarily stops a subscription (if permitted by the plan). |
| **Resume** | Restarts a paused subscription. |
| **Renew** | Extends a subscription for another billing cycle. |
| **Close** | Ends a subscription cleanly. |

*Available actions depend on the subscription's status and plan settings.*

---

## Invoice and Payment Tracking

Each invoice maintains a clear status so users can track billing progress effortlessly:

- **Draft**: Newly created or pending confirmation.
- **Confirmed**: Issued and awaiting payment.
- **Paid**: Payment fully recorded and settled.

Users can view detailed breakdowns, confirm or cancel invoices, record full or partial payments, and print or download invoices as formatted documents.

---

## User Roles & Permissions

BillSync provides role-based navigation and access levels:

- **Admin**
  - Full application access.
  - Manages customers, products, plans, quotations, subscriptions, invoices, and payments.
  - Manages staff accounts, roles, and permissions in User Management.
  - Views comprehensive financial metrics and reports.

- **Staff**
  - Handles daily operational tasks (customers, quotations, subscriptions, invoices, and payments).
  - Restricted from admin-only staff management settings.

- **Customer**
  - Access to dedicated Customer Portal (`/portal`).
  - Views personal profile, active subscriptions, invoice details, payment receipts, and outstanding balance.
  - Strict data isolation ensuring customers cannot see other customers' records.

---

## Example: How a Business Uses BillSync

Suppose a business offers a monthly software subscription for its customers:

1. The business adds a new customer.
2. It creates a product called **Software Plan**.
3. It creates a monthly subscription plan for **₹999**.
4. It prepares a quotation for the customer.
5. The customer accepts the quotation.
6. The business activates the subscription.
7. At the next billing date, an invoice is generated.
8. The customer makes a payment of **₹999**.
9. The payment is recorded and the invoice status is updated to **Paid**.
10. The business monitors the transaction and subscription health from the dashboard.

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide React
- **Routing**: React Router DOM (v7)
- **Analytics & Cloud**: Firebase SDK & Google Analytics (`billsync-fa57a`)
- **Backend & Database**: FastAPI, PostgreSQL

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/RANAPRINCE06/BillSync.git
cd BillSync

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

---

## Team Members

| Member | Responsibility |
|---|---|
| **Rudra Chauhan** | Frontend development and user interface |
| **Prince** | Database management and application logic |

---

## Project Goal

Our goal is to build a practical subscription management system that helps businesses handle their daily subscription and billing activities without having to manage customers, invoices, and payments separately.

**BillSync – Subscription Management System**
