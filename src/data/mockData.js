// Initial state seed for BillSync Frontend
export const INITIAL_MOCK_DATA = {
  users: [
    {
      id: 'usr-001',
      name: 'Rudra Chauhan',
      email: 'admin@billsync.com',
      role: 'ADMIN',
      is_active: true,
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 'usr-002',
      name: 'Sarah Jenkins',
      email: 'staff@billsync.com',
      role: 'STAFF',
      is_active: true,
      created_at: '2026-10-05T12:00:00Z',
    },
    {
      id: 'usr-003',
      name: 'Acme Corp Client',
      email: 'customer@billsync.com',
      role: 'CUSTOMER',
      is_active: true,
      created_at: '2026-10-10T09:30:00Z',
    },
  ],

  customers: [
    {
      id: 'cust-001',
      name: 'Acme Technologies Pvt Ltd',
      email: 'billing@acme.com',
      phone: '+91 98765 43210',
      billing_address: 'Plot 42, Tech Park Phase 2, Whitefield, Bangalore, Karnataka 560066',
      created_at: '2026-09-15T08:00:00Z',
    },
    {
      id: 'cust-002',
      name: 'TechNova Cloud Solutions',
      email: 'accounts@technova.io',
      phone: '+91 98234 56789',
      billing_address: 'Tower B, 7th Floor, Cyber City, DLF Phase 2, Gurgaon, Haryana 122002',
      created_at: '2026-09-20T11:15:00Z',
    },
    {
      id: 'cust-003',
      name: 'Horizon Biotech Labs',
      email: 'finance@horizonbio.org',
      phone: '+91 97123 45678',
      billing_address: '14 Bio Science Hub, Nariman Point, Mumbai, Maharashtra 400021',
      created_at: '2026-10-01T14:45:00Z',
    },
    {
      id: 'cust-004',
      name: 'Apex Global Logistics',
      email: 'procurement@apexlogistics.com',
      phone: '+91 99012 34567',
      billing_address: 'Cargo Terminal 3, Viman Nagar, Pune, Maharashtra 411014',
      created_at: '2026-10-12T16:20:00Z',
    },
  ],

  products: [
    {
      id: 'prod-001',
      name: 'Cloud Virtual Server',
      product_type: 'SERVICE',
      sales_price: 3999,
      cost_price: 1800,
      description: 'High-performance cloud compute node with dedicated CPU and SSD storage.',
      is_active: true,
      variants: [
        { id: 'v-101', name: '2 vCPU / 4GB RAM', sku: 'CVS-2C-4G', price: 3999 },
        { id: 'v-102', name: '4 vCPU / 8GB RAM', sku: 'CVS-4C-8G', price: 6999 },
        { id: 'v-103', name: '8 vCPU / 16GB RAM', sku: 'CVS-8C-16G', price: 12999 },
      ],
      created_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 'prod-002',
      name: 'SaaS Platform License',
      product_type: 'SUBSCRIPTION',
      sales_price: 2499,
      cost_price: 450,
      description: 'Monthly seat license for BillSync workspace management and reporting suite.',
      is_active: true,
      variants: [
        { id: 'v-201', name: 'Starter (Up to 5 Users)', sku: 'SPL-START', price: 2499 },
        { id: 'v-202', name: 'Growth (Up to 25 Users)', sku: 'SPL-GROWTH', price: 7999 },
        { id: 'v-203', name: 'Enterprise (Unlimited)', sku: 'SPL-ENT', price: 19999 },
      ],
      created_at: '2026-09-05T11:00:00Z',
    },
    {
      id: 'prod-003',
      name: '24/7 Dedicated Support SLA',
      product_type: 'SERVICE',
      sales_price: 1500,
      cost_price: 300,
      description: 'Guaranteed 15-minute response time SLA with designated senior technical manager.',
      is_active: true,
      variants: [
        { id: 'v-301', name: 'Business Hours SLA', sku: 'SLA-BIZ', price: 1500 },
        { id: 'v-302', name: '24/7/365 Critical Care', sku: 'SLA-247', price: 4500 },
      ],
      created_at: '2026-09-10T14:00:00Z',
    },
    {
      id: 'prod-004',
      name: 'Secure Edge Gateway Router',
      product_type: 'PHYSICAL',
      sales_price: 14500,
      cost_price: 9500,
      description: 'Hardware cryptographic VPN appliance for encrypted edge-to-cloud telemetry.',
      is_active: true,
      variants: [
        { id: 'v-401', name: 'Edge-100 (1Gbps)', sku: 'RTR-1G', price: 14500 },
        { id: 'v-402', name: 'Edge-500 (10Gbps SFP+)', sku: 'RTR-10G', price: 28500 },
      ],
      created_at: '2026-09-15T09:00:00Z',
    },
  ],

  plans: [
    {
      id: 'plan-001',
      product_id: 'prod-002',
      name: 'Pro Monthly Tier',
      billing_interval: 'MONTHLY',
      price: 2499,
      minimum_quantity: 1,
      available_from: '2026-01-01T00:00:00Z',
      available_until: '2027-12-31T23:59:59Z',
      allow_pause: true,
      allow_renewal: true,
      allow_early_close: true,
      description: 'Standard monthly subscription billed on the 1st of each month.',
    },
    {
      id: 'plan-002',
      product_id: 'prod-002',
      name: 'Annual Business Tier',
      billing_interval: 'YEARLY',
      price: 24990,
      minimum_quantity: 1,
      available_from: '2026-01-01T00:00:00Z',
      available_until: '2027-12-31T23:59:59Z',
      allow_pause: true,
      allow_renewal: true,
      allow_early_close: false,
      description: 'Yearly upfront billing with 2 months free platform access included.',
    },
    {
      id: 'plan-003',
      product_id: 'prod-001',
      name: 'Dedicated Enterprise Cloud',
      billing_interval: 'MONTHLY',
      price: 12999,
      minimum_quantity: 2,
      available_from: '2026-03-01T00:00:00Z',
      available_until: '2028-12-31T23:59:59Z',
      allow_pause: false,
      allow_renewal: true,
      allow_early_close: true,
      description: 'Enterprise grade virtual cluster with continuous compliance checks.',
    },
    {
      id: 'plan-004',
      product_id: 'prod-001',
      name: 'Hourly On-Demand Burst',
      billing_interval: 'DAILY',
      price: 299,
      minimum_quantity: 1,
      available_from: '2026-01-01T00:00:00Z',
      available_until: '2027-12-31T23:59:59Z',
      allow_pause: true,
      allow_renewal: true,
      allow_early_close: true,
      description: 'Daily rate compute provisioning for transient ETL and workload spikes.',
    },
  ],

  quotations: [
    {
      id: 'qt-001',
      quotation_number: 'QT-2026-001',
      customer_id: 'cust-001',
      customer_name: 'Acme Technologies Pvt Ltd',
      customer_email: 'billing@acme.com',
      status: 'ACCEPTED',
      valid_until: '2026-11-20T23:59:59Z',
      subtotal: 29988,
      discount_amount: 1500,
      tax_amount: 5127.84,
      total: 33615.84,
      notes: 'Custom annual quote with SLA discount package applied.',
      items: [
        { product_id: 'prod-002', product_name: 'SaaS Platform License (Growth)', quantity: 2, unit_price: 7999, tax_rate: 18, line_total: 15998 },
        { product_id: 'prod-001', product_name: 'Cloud Virtual Server (4 vCPU)', quantity: 2, unit_price: 6995, tax_rate: 18, line_total: 13990 },
      ],
      created_at: '2026-10-15T11:00:00Z',
    },
    {
      id: 'qt-002',
      quotation_number: 'QT-2026-002',
      customer_id: 'cust-002',
      customer_name: 'TechNova Cloud Solutions',
      customer_email: 'accounts@technova.io',
      status: 'DRAFT',
      valid_until: '2026-11-25T23:59:59Z',
      subtotal: 14500,
      discount_amount: 0,
      tax_amount: 2610,
      total: 17110,
      notes: 'Evaluation quote for on-premise hardware telemetry.',
      items: [
        { product_id: 'prod-004', product_name: 'Secure Edge Gateway Router', quantity: 1, unit_price: 14500, tax_rate: 18, line_total: 14500 },
      ],
      created_at: '2026-10-22T14:30:00Z',
    },
    {
      id: 'qt-003',
      quotation_number: 'QT-2026-003',
      customer_id: 'cust-003',
      customer_name: 'Horizon Biotech Labs',
      customer_email: 'finance@horizonbio.org',
      status: 'SENT',
      valid_until: '2026-11-15T23:59:59Z',
      subtotal: 25998,
      discount_amount: 2000,
      tax_amount: 4319.64,
      total: 28317.64,
      notes: 'Multi-node research infrastructure proposal.',
      items: [
        { product_id: 'prod-001', product_name: 'Dedicated Enterprise Cloud', quantity: 2, unit_price: 12999, tax_rate: 18, line_total: 25998 },
      ],
      created_at: '2026-10-26T16:00:00Z',
    },
  ],

  subscriptions: [
    {
      id: 'sub-001',
      subscription_number: 'SUB-2026-001',
      customer_id: 'cust-001',
      customer_name: 'Acme Technologies Pvt Ltd',
      plan_id: 'plan-002',
      plan_name: 'Annual Business Tier',
      billing_interval: 'YEARLY',
      status: 'ACTIVE',
      start_date: '2026-10-01T00:00:00Z',
      end_date: '2027-10-01T23:59:59Z',
      next_billing_date: '2027-10-01T00:00:00Z',
      payment_terms: 'Net 30',
      items: [
        { product_id: 'prod-002', product_name: 'SaaS Platform License', quantity: 1, unit_price: 24990 },
        { product_id: 'prod-003', product_name: '24/7 Dedicated Support SLA', quantity: 1, unit_price: 1500 },
      ],
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 'sub-002',
      subscription_number: 'SUB-2026-002',
      customer_id: 'cust-002',
      customer_name: 'TechNova Cloud Solutions',
      plan_id: 'plan-001',
      plan_name: 'Pro Monthly Tier',
      billing_interval: 'MONTHLY',
      status: 'ACTIVE',
      start_date: '2026-10-15T00:00:00Z',
      end_date: '2027-10-15T23:59:59Z',
      next_billing_date: '2026-11-15T00:00:00Z',
      payment_terms: 'Due upon receipt',
      items: [
        { product_id: 'prod-002', product_name: 'SaaS Platform License', quantity: 3, unit_price: 2499 },
      ],
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      id: 'sub-003',
      subscription_number: 'SUB-2026-003',
      customer_id: 'cust-003',
      customer_name: 'Horizon Biotech Labs',
      plan_id: 'plan-003',
      plan_name: 'Dedicated Enterprise Cloud',
      billing_interval: 'MONTHLY',
      status: 'PAUSED',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2027-09-01T23:59:59Z',
      next_billing_date: '2026-12-01T00:00:00Z',
      payment_terms: 'Net 15',
      items: [
        { product_id: 'prod-001', product_name: 'Cloud Virtual Server (8C/16G)', quantity: 2, unit_price: 12999 },
      ],
      created_at: '2026-09-01T15:00:00Z',
    },
  ],

  invoices: [
    {
      id: 'inv-001',
      invoice_number: 'INV-2026-001',
      customer_id: 'cust-001',
      customer_name: 'Acme Technologies Pvt Ltd',
      subscription_id: 'sub-001',
      issue_date: '2026-10-01T00:00:00Z',
      due_date: '2026-10-31T23:59:59Z',
      billing_period_start: '2026-10-01T00:00:00Z',
      billing_period_end: '2027-10-01T00:00:00Z',
      status: 'PAID',
      subtotal: 26490,
      tax_amount: 4768.20,
      discount_amount: 0,
      total: 31258.20,
      amount_paid: 31258.20,
      balance_due: 0,
      items: [
        { description: 'Annual Business Tier Platform License', quantity: 1, unit_price: 24990, tax_rate: 18, line_total: 24990 },
        { description: '24/7 Support Addon SLA', quantity: 1, unit_price: 1500, tax_rate: 18, line_total: 1500 },
      ],
      created_at: '2026-10-01T10:30:00Z',
    },
    {
      id: 'inv-002',
      invoice_number: 'INV-2026-002',
      customer_id: 'cust-002',
      customer_name: 'TechNova Cloud Solutions',
      subscription_id: 'sub-002',
      issue_date: '2026-10-15T00:00:00Z',
      due_date: '2026-11-05T23:59:59Z',
      billing_period_start: '2026-10-15T00:00:00Z',
      billing_period_end: '2026-11-15T00:00:00Z',
      status: 'PARTIALLY_PAID',
      subtotal: 7497,
      tax_amount: 1349.46,
      discount_amount: 500,
      total: 8346.46,
      amount_paid: 3000.00,
      balance_due: 5346.46,
      items: [
        { description: 'Pro Monthly Tier (3 Seats)', quantity: 3, unit_price: 2499, tax_rate: 18, line_total: 7497 },
      ],
      created_at: '2026-10-15T12:30:00Z',
    },
    {
      id: 'inv-003',
      invoice_number: 'INV-2026-003',
      customer_id: 'cust-003',
      customer_name: 'Horizon Biotech Labs',
      subscription_id: 'sub-003',
      issue_date: '2026-09-01T00:00:00Z',
      due_date: '2026-09-16T23:59:59Z',
      billing_period_start: '2026-09-01T00:00:00Z',
      billing_period_end: '2026-10-01T00:00:00Z',
      status: 'OVERDUE',
      subtotal: 25998,
      tax_amount: 4679.64,
      discount_amount: 0,
      total: 30677.64,
      amount_paid: 0,
      balance_due: 30677.64,
      items: [
        { description: 'Dedicated Enterprise Cloud Nodes', quantity: 2, unit_price: 12999, tax_rate: 18, line_total: 25998 },
      ],
      created_at: '2026-09-01T15:30:00Z',
    },
    {
      id: 'inv-004',
      invoice_number: 'INV-2026-004',
      customer_id: 'cust-004',
      customer_name: 'Apex Global Logistics',
      subscription_id: null,
      issue_date: '2026-10-25T00:00:00Z',
      due_date: '2026-11-10T23:59:59Z',
      billing_period_start: '2026-10-25T00:00:00Z',
      billing_period_end: '2026-11-25T00:00:00Z',
      status: 'CONFIRMED',
      subtotal: 14500,
      tax_amount: 2610,
      discount_amount: 0,
      total: 17110,
      amount_paid: 0,
      balance_due: 17110,
      items: [
        { description: 'Secure Edge Gateway Router - Standard 1G', quantity: 1, unit_price: 14500, tax_rate: 18, line_total: 14500 },
      ],
      created_at: '2026-10-25T10:00:00Z',
    },
  ],

  payments: [
    {
      id: 'pay-001',
      payment_reference: 'PAY-2026-001',
      invoice_id: 'inv-001',
      invoice_number: 'INV-2026-001',
      customer_name: 'Acme Technologies Pvt Ltd',
      amount: 31258.20,
      payment_method: 'BANK_TRANSFER',
      payment_date: '2026-10-02T11:00:00Z',
      status: 'SUCCESSFUL',
      notes: 'NEFT UTR: HDFC00019284920492',
    },
    {
      id: 'pay-002',
      payment_reference: 'PAY-2026-002',
      invoice_id: 'inv-002',
      invoice_number: 'INV-2026-002',
      customer_name: 'TechNova Cloud Solutions',
      amount: 3000.00,
      payment_method: 'UPI',
      payment_date: '2026-10-18T15:20:00Z',
      status: 'SUCCESSFUL',
      notes: 'UPI Ref: 429103948291@icici',
    },
  ],

  revenue_chart: [
    { month: 'May 2026', revenue: 14500 },
    { month: 'Jun 2026', revenue: 22800 },
    { month: 'Jul 2026', revenue: 31400 },
    { month: 'Aug 2026', revenue: 28900 },
    { month: 'Sep 2026', revenue: 42300 },
    { month: 'Oct 2026', revenue: 58600 },
  ],
};

const STORAGE_KEY = 'billsync_mock_store_v1';

// Load store from localStorage or initialize with seed
export function getMockStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DATA));
      return INITIAL_MOCK_DATA;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MOCK_DATA;
  }
}

// Save store
export function saveMockStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save mock store', err);
  }
}

// Reset store
export function resetMockStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_MOCK_DATA));
  return INITIAL_MOCK_DATA;
}
