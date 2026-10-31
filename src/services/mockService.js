import { getMockStore, saveMockStore } from '../data/mockData';

// Simulated latency helper
const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to generate UUIDs / IDs
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

export const mockService = {
  // --------------------------------------------------------------------------
  // Dashboard Metrics
  // --------------------------------------------------------------------------
  async getDashboardStats() {
    await delay();
    const store = getMockStore();
    const active_subscriptions = store.subscriptions.filter((s) => s.status === 'ACTIVE').length;
    const total_customers = store.customers.length;
    const revenue_received = store.payments
      .filter((p) => p.status === 'SUCCESSFUL')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstanding_payments = store.invoices
      .filter((i) => i.status !== 'CANCELLED' && i.status !== 'PAID')
      .reduce((sum, i) => sum + Number(i.balance_due || 0), 0);
    const overdue_invoices = store.invoices.filter((i) => i.status === 'OVERDUE').length;

    return {
      active_subscriptions,
      total_customers,
      revenue_received,
      outstanding_payments,
      overdue_invoices,
    };
  },

  async getRecentSubscriptions() {
    await delay();
    const store = getMockStore();
    return [...store.subscriptions].reverse().slice(0, 5);
  },

  async getRecentInvoices() {
    await delay();
    const store = getMockStore();
    return [...store.invoices].reverse().slice(0, 5);
  },

  async getRevenueChart() {
    await delay();
    const store = getMockStore();
    return store.revenue_chart || [];
  },

  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------
  async getCustomers(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.customers];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.company && c.company.toLowerCase().includes(q))
      );
    }
    if (params.company) {
      list = list.filter((c) => c.company && c.company.toLowerCase() === params.company.toLowerCase());
    }
    return list;
  },

  async getCustomerById(id) {
    await delay();
    const store = getMockStore();
    const customer = store.customers.find((c) => String(c.id) === String(id));
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async createCustomer(data) {
    await delay();
    const store = getMockStore();
    const newCustomer = {
      id: uid('cust'),
      ...data,
      created_at: new Date().toISOString(),
    };
    store.customers.unshift(newCustomer);
    saveMockStore(store);
    return newCustomer;
  },

  async updateCustomer(id, data) {
    await delay();
    const store = getMockStore();
    const index = store.customers.findIndex((c) => String(c.id) === String(id));
    if (index === -1) throw new Error('Customer not found');
    store.customers[index] = { ...store.customers[index], ...data, updated_at: new Date().toISOString() };
    saveMockStore(store);
    return store.customers[index];
  },

  async deleteCustomer(id) {
    await delay();
    const store = getMockStore();
    const hasSubs = (store.subscriptions || []).some((s) => String(s.customer_id) === String(id));
    const hasInvoices = (store.invoices || []).some((i) => String(i.customer_id) === String(id));
    if (hasSubs || hasInvoices) {
      throw new Error('Cannot delete customer with linked active subscriptions or invoice records.');
    }
    store.customers = store.customers.filter((c) => String(c.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },

  async getCustomerSubscriptions(customerId) {
    await delay();
    const store = getMockStore();
    return store.subscriptions.filter((s) => String(s.customer_id) === String(customerId));
  },

  async getCustomerQuotations(customerId) {
    await delay();
    const store = getMockStore();
    return store.quotations.filter((q) => String(q.customer_id) === String(customerId));
  },

  async getCustomerInvoices(customerId) {
    await delay();
    const store = getMockStore();
    return store.invoices.filter((i) => String(i.customer_id) === String(customerId));
  },

  async getCustomerPayments(customerId) {
    await delay();
    const store = getMockStore();
    return store.payments.filter(
      (p) =>
        String(p.customer_id) === String(customerId) ||
        store.invoices.some((inv) => String(inv.id) === String(p.invoice_id) && String(inv.customer_id) === String(customerId))
    );
  },

  // --------------------------------------------------------------------------
  // Products & Variants
  // --------------------------------------------------------------------------
  async getProducts(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.products];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      );
    }
    if (params.type && params.type !== 'ALL') {
      list = list.filter((p) => (p.product_type || p.type || '').toUpperCase() === params.type.toUpperCase());
    }
    return list;
  },

  async getProductById(id) {
    await delay();
    const store = getMockStore();
    const prod = store.products.find((p) => String(p.id) === String(id));
    if (!prod) throw new Error('Product not found');
    return prod;
  },

  async createProduct(data) {
    await delay();
    const store = getMockStore();
    const newProduct = {
      id: uid('prod'),
      variants: data.variants || [],
      ...data,
      created_at: new Date().toISOString(),
    };
    store.products.unshift(newProduct);
    saveMockStore(store);
    return newProduct;
  },

  async updateProduct(id, data) {
    await delay();
    const store = getMockStore();
    const index = store.products.findIndex((p) => String(p.id) === String(id));
    if (index === -1) throw new Error('Product not found');
    store.products[index] = { ...store.products[index], ...data, updated_at: new Date().toISOString() };
    saveMockStore(store);
    return store.products[index];
  },

  async deleteProduct(id) {
    await delay();
    const store = getMockStore();
    store.products = store.products.filter((p) => String(p.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },

  // --------------------------------------------------------------------------
  // Subscription Plans
  // --------------------------------------------------------------------------
  async getPlans(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.plans];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }
    if (params.interval && params.interval !== 'ALL') {
      list = list.filter(
        (p) => (p.billing_interval || p.billing_cycle || '').toUpperCase() === params.interval.toUpperCase()
      );
    }
    return list;
  },

  async getPlanById(id) {
    await delay();
    const store = getMockStore();
    const plan = store.plans.find((p) => String(p.id) === String(id));
    if (!plan) throw new Error('Plan not found');
    return plan;
  },

  async createPlan(data) {
    await delay();
    const store = getMockStore();
    const newPlan = {
      id: uid('plan'),
      auto_close_at_end_date: data.auto_close_at_end_date ?? true,
      allow_pause: data.allow_pause ?? true,
      allow_renewal: data.allow_renewal ?? true,
      allow_early_close: data.allow_early_close ?? true,
      ...data,
      created_at: new Date().toISOString(),
    };
    store.plans.unshift(newPlan);
    saveMockStore(store);
    return newPlan;
  },

  async updatePlan(id, data) {
    await delay();
    const store = getMockStore();
    const index = store.plans.findIndex((p) => String(p.id) === String(id));
    if (index === -1) throw new Error('Plan not found');
    store.plans[index] = { ...store.plans[index], ...data, updated_at: new Date().toISOString() };
    saveMockStore(store);
    return store.plans[index];
  },

  async deletePlan(id) {
    await delay();
    const store = getMockStore();
    store.plans = store.plans.filter((p) => String(p.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },

  // --------------------------------------------------------------------------
  // Quotations
  // --------------------------------------------------------------------------
  async getQuotations(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.quotations];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (item) =>
          (item.quotation_number && item.quotation_number.toLowerCase().includes(q)) ||
          (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
          (item.company && item.company.toLowerCase().includes(q)) ||
          (item.notes && item.notes.toLowerCase().includes(q))
      );
    }
    if (params.status && params.status !== 'ALL') {
      list = list.filter((item) => (item.status || '').toUpperCase() === params.status.toUpperCase());
    }
    return list;
  },

  async getQuotationById(id) {
    await delay();
    const store = getMockStore();
    const q = store.quotations.find((item) => String(item.id) === String(id));
    if (!q) throw new Error('Quotation not found');
    return q;
  },

  async getQuotationTemplates() {
    await delay();
    const store = getMockStore();
    return store.quotation_templates || [];
  },

  async createQuotation(data) {
    await delay();
    const store = getMockStore();
    const customer = store.customers.find((c) => String(c.id) === String(data.customer_id));
    const newQt = {
      id: uid('qt'),
      quotation_number: data.quotation_number || `QT-2026-${String(store.quotations.length + 1).padStart(3, '0')}`,
      customer_id: data.customer_id,
      customer_name: customer ? customer.name : 'Client',
      customer_email: customer ? customer.email : '',
      company: customer ? customer.company : '',
      status: data.status || 'DRAFT',
      valid_until: data.valid_until || new Date(Date.now() + 14 * 86400000).toISOString(),
      subtotal: data.subtotal,
      discount_amount: data.discount_amount || 0,
      tax_amount: data.tax_amount || 0,
      total: data.total,
      notes: data.notes || '',
      items: data.items || [],
      created_at: new Date().toISOString(),
    };
    store.quotations.unshift(newQt);
    saveMockStore(store);
    return newQt;
  },

  async updateQuotation(id, data) {
    await delay();
    const store = getMockStore();
    const index = store.quotations.findIndex((q) => String(q.id) === String(id));
    if (index === -1) throw new Error('Quotation not found');
    const existing = store.quotations[index];

    let customerName = existing.customer_name;
    let customerEmail = existing.customer_email;
    let customerCompany = existing.company;
    if (data.customer_id && data.customer_id !== existing.customer_id) {
      const cust = store.customers.find((c) => String(c.id) === String(data.customer_id));
      if (cust) {
        customerName = cust.name;
        customerEmail = cust.email;
        customerCompany = cust.company;
      }
    }

    store.quotations[index] = {
      ...existing,
      ...data,
      customer_name: customerName,
      customer_email: customerEmail,
      company: customerCompany,
      updated_at: new Date().toISOString(),
    };
    saveMockStore(store);
    return store.quotations[index];
  },

  async deleteQuotation(id) {
    await delay();
    const store = getMockStore();
    store.quotations = store.quotations.filter((q) => String(q.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },

  async updateQuotationStatus(id, newStatus) {
    await delay();
    const store = getMockStore();
    const index = store.quotations.findIndex((q) => String(q.id) === String(id));
    if (index === -1) throw new Error('Quotation not found');
    store.quotations[index].status = newStatus;
    saveMockStore(store);
    return store.quotations[index];
  },

  async convertQuotationToSubscription(id) {
    await delay();
    const store = getMockStore();
    const qt = store.quotations.find((q) => String(q.id) === String(id));
    if (!qt) throw new Error('Quotation not found');

    // Mark quotation accepted
    qt.status = 'ACCEPTED';

    // Automatically provision new active subscription
    const defaultPlan = store.plans[0] || { id: 'plan-001', name: 'Standard Provisioned Plan' };
    const newSub = {
      id: uid('sub'),
      subscription_number: `SUB-2026-${String(store.subscriptions.length + 1).padStart(3, '0')}`,
      customer_id: qt.customer_id,
      customer_name: qt.customer_name,
      plan_id: defaultPlan.id,
      plan_name: defaultPlan.name,
      billing_interval: defaultPlan.billing_interval || 'MONTHLY',
      status: 'ACTIVE',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 86400000).toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      payment_terms: 'Due upon receipt',
      items: qt.items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      created_at: new Date().toISOString(),
    };
    store.subscriptions.unshift(newSub);

    // Automatically generate invoice for the subscription
    const newInv = {
      id: uid('inv'),
      invoice_number: `INV-2026-${String(store.invoices.length + 1).padStart(3, '0')}`,
      customer_id: qt.customer_id,
      customer_name: qt.customer_name,
      subscription_id: newSub.id,
      issue_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 15 * 86400000).toISOString(),
      billing_period_start: newSub.start_date,
      billing_period_end: newSub.next_billing_date,
      status: 'CONFIRMED',
      subtotal: qt.subtotal,
      tax_amount: qt.tax_amount,
      discount_amount: qt.discount_amount,
      total: qt.total,
      amount_paid: 0,
      balance_due: qt.total,
      items: qt.items.map((i) => ({
        description: i.product_name || 'Billed Service Line Item',
        quantity: i.quantity,
        unit_price: i.unit_price,
        tax_rate: i.tax_rate || 18,
        line_total: i.line_total || i.quantity * i.unit_price,
      })),
      created_at: new Date().toISOString(),
    };
    store.invoices.unshift(newInv);

    saveMockStore(store);
    return { subscription: newSub, invoice: newInv };
  },

  async duplicateQuotation(id) {
    await delay();
    const store = getMockStore();
    const qt = store.quotations.find((q) => String(q.id) === String(id));
    if (!qt) throw new Error('Quotation not found');
    const newQt = {
      ...qt,
      id: uid('qt'),
      quotation_number: `QT-2026-${String(store.quotations.length + 1).padStart(3, '0')}`,
      status: 'DRAFT',
      created_at: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    };
    store.quotations.unshift(newQt);
    saveMockStore(store);
    return newQt;
  },

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------
  async getSubscriptions(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.subscriptions];

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.subscription_number && s.subscription_number.toLowerCase().includes(q)) ||
          (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
          (s.company && s.company.toLowerCase().includes(q)) ||
          (s.plan_name && s.plan_name.toLowerCase().includes(q))
      );
    }

    if (params.status && params.status !== 'ALL') {
      list = list.filter((s) => (s.status || '').toUpperCase() === params.status.toUpperCase());
    }

    if (params.interval && params.interval !== 'ALL') {
      list = list.filter((s) => (s.billing_interval || s.billing_cycle || '').toUpperCase() === params.interval.toUpperCase());
    }

    return list;
  },

  async getSubscriptionById(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');

    // Attach linked customer and plan details if not present
    const customer = store.customers.find((c) => String(c.id) === String(sub.customer_id));
    const plan = store.plans.find((p) => String(p.id) === String(sub.plan_id));

    // Ensure line items have tax and totals computed
    const items = (sub.items || []).map((it) => {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unit_price) || 0;
      const taxRate = it.tax_rate ?? 18;
      const lineTotal = it.line_total || qty * price;
      return {
        ...it,
        quantity: qty,
        unit_price: price,
        tax_rate: taxRate,
        line_total: lineTotal,
      };
    });

    const subtotal = sub.subtotal || items.reduce((sum, it) => sum + (it.line_total || 0), 0);
    const tax_amount = sub.tax_amount || items.reduce((sum, it) => sum + ((it.line_total || 0) * (it.tax_rate || 0)) / 100, 0);
    const total_amount = sub.total_amount || (subtotal + tax_amount);

    return {
      ...sub,
      customer,
      plan,
      items,
      subtotal,
      tax_amount,
      total_amount,
      history: sub.history || [
        { event: 'Created', timestamp: sub.created_at || new Date().toISOString(), notes: 'Subscription agreement created' }
      ],
    };
  },

  async createSubscription(data) {
    await delay();
    const store = getMockStore();
    const customer = store.customers.find((c) => String(c.id) === String(data.customer_id));
    const plan = store.plans.find((p) => String(p.id) === String(data.plan_id));

    const items = (data.items || []).map((it) => {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unit_price) || 0;
      const taxRate = it.tax_rate ?? 18;
      return {
        ...it,
        quantity: qty,
        unit_price: price,
        tax_rate: taxRate,
        line_total: qty * price,
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.line_total, 0);
    const tax_amount = items.reduce((sum, it) => sum + (it.line_total * (it.tax_rate || 0)) / 100, 0);
    const total_amount = subtotal + tax_amount;

    const initialStatus = (data.status || 'DRAFT').toUpperCase();
    const newSub = {
      id: uid('sub'),
      subscription_number: `SUB-2026-${String(store.subscriptions.length + 1).padStart(3, '0')}`,
      customer_id: data.customer_id,
      customer_name: customer ? customer.name : 'Client',
      company: customer ? customer.company : '',
      customer_email: customer ? customer.email : '',
      plan_id: data.plan_id,
      plan_name: plan ? plan.name : 'Custom Plan',
      billing_interval: plan ? (plan.billing_interval || 'MONTHLY') : 'MONTHLY',
      status: initialStatus,
      start_date: data.start_date || new Date().toISOString(),
      end_date: data.end_date || null,
      next_billing_date: data.start_date || new Date().toISOString(),
      payment_terms: data.payment_terms || 'Due upon receipt',
      subtotal,
      tax_amount,
      total_amount,
      items,
      notes: data.notes || '',
      history: [
        {
          event: initialStatus === 'ACTIVE' ? 'Activated' : 'Created',
          timestamp: new Date().toISOString(),
          notes: initialStatus === 'ACTIVE' ? 'Directly created in active status' : 'Initial draft subscription created',
        },
      ],
      created_at: new Date().toISOString(),
    };
    store.subscriptions.unshift(newSub);
    saveMockStore(store);
    return newSub;
  },

  async confirmSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'CONFIRMED';
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Confirmed',
      timestamp: new Date().toISOString(),
      notes: 'Customer agreement terms confirmed',
    });
    saveMockStore(store);
    return sub;
  },

  async activateSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'ACTIVE';
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Activated',
      timestamp: new Date().toISOString(),
      notes: 'Subscription activated and recurring provisioning initiated',
    });
    saveMockStore(store);
    return sub;
  },

  async pauseSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'PAUSED';
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Paused',
      timestamp: new Date().toISOString(),
      notes: 'Recurring billing temporarily suspended',
    });
    saveMockStore(store);
    return sub;
  },

  async resumeSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'ACTIVE';
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Resumed',
      timestamp: new Date().toISOString(),
      notes: 'Resumed active recurring subscription',
    });
    saveMockStore(store);
    return sub;
  },

  async renewSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'ACTIVE';
    sub.next_billing_date = new Date(Date.now() + 30 * 86400000).toISOString();
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Renewed',
      timestamp: new Date().toISOString(),
      notes: 'Subscription term renewed for next cycle',
    });
    saveMockStore(store);
    return sub;
  },

  async closeSubscription(id) {
    await delay();
    const store = getMockStore();
    const sub = store.subscriptions.find((s) => String(s.id) === String(id));
    if (!sub) throw new Error('Subscription not found');
    sub.status = 'CLOSED';
    if (!sub.history) sub.history = [];
    sub.history.push({
      event: 'Closed',
      timestamp: new Date().toISOString(),
      notes: 'Subscription terminated and closed',
    });
    saveMockStore(store);
    return sub;
  },

  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------
  async getInvoices(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.invoices];

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.invoice_number && i.invoice_number.toLowerCase().includes(q)) ||
          (i.customer_name && i.customer_name.toLowerCase().includes(q)) ||
          (i.company && i.company.toLowerCase().includes(q)) ||
          (i.subscription_id && i.subscription_id.toLowerCase().includes(q))
      );
    }

    if (params.status && params.status !== 'ALL') {
      list = list.filter((i) => (i.status || '').toUpperCase() === params.status.toUpperCase());
    }

    return list;
  },

  async getInvoiceById(id) {
    await delay();
    const store = getMockStore();
    const inv = store.invoices.find((i) => String(i.id) === String(id));
    if (!inv) throw new Error('Invoice not found');

    const customer = store.customers.find((c) => String(c.id) === String(inv.customer_id));
    const subscription = store.subscriptions.find((s) => String(s.id) === String(inv.subscription_id));
    const payments = store.payments.filter((p) => String(p.invoice_id) === String(inv.id));

    return {
      ...inv,
      customer,
      subscription,
      payments,
    };
  },

  async confirmInvoice(id) {
    await delay();
    const store = getMockStore();
    const inv = store.invoices.find((i) => String(i.id) === String(id));
    if (!inv) throw new Error('Invoice not found');
    inv.status = 'CONFIRMED';
    saveMockStore(store);
    return inv;
  },

  async cancelInvoice(id) {
    await delay();
    const store = getMockStore();
    const inv = store.invoices.find((i) => String(i.id) === String(id));
    if (!inv) throw new Error('Invoice not found');
    inv.status = 'CANCELLED';
    inv.balance_due = 0;
    saveMockStore(store);
    return inv;
  },

  async sendInvoice(id) {
    await delay();
    const store = getMockStore();
    const inv = store.invoices.find((i) => String(i.id) === String(id));
    if (!inv) throw new Error('Invoice not found');
    inv.status = 'SENT';
    saveMockStore(store);
    return inv;
  },

  // --------------------------------------------------------------------------
  // Discount Management
  // --------------------------------------------------------------------------
  async getDiscounts(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...(store.discounts || [])];

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q))
      );
    }

    if (params.status && params.status !== 'ALL') {
      const now = new Date();
      list = list.filter((d) => {
        const isExpired = d.end_date && new Date(d.end_date) < now;
        const isExhausted = d.usage_limit && (d.times_used || 0) >= d.usage_limit;
        let computed = 'ACTIVE';
        if (isExpired) computed = 'EXPIRED';
        else if (isExhausted) computed = 'EXHAUSTED';
        else if (d.is_active === false) computed = 'INACTIVE';

        return computed === params.status.toUpperCase();
      });
    }

    return list;
  },

  async getDiscountById(id) {
    await delay();
    const store = getMockStore();
    const d = (store.discounts || []).find((x) => String(x.id) === String(id));
    if (!d) throw new Error('Discount not found');
    return d;
  },

  async createDiscount(data) {
    await delay();
    const store = getMockStore();
    if (!store.discounts) store.discounts = [];
    const newDisc = {
      id: uid('disc'),
      name: data.name.trim(),
      discount_type: (data.discount_type || 'PERCENTAGE').toUpperCase(),
      discount_value: Number(data.discount_value) || 0,
      min_purchase: Number(data.min_purchase) || 0,
      min_quantity: Number(data.min_quantity) || 1,
      start_date: data.start_date || new Date().toISOString(),
      end_date: data.end_date || null,
      usage_limit: data.usage_limit ? Number(data.usage_limit) : null,
      times_used: 0,
      applicable_to: data.applicable_to || 'ALL',
      description: data.description ? data.description.trim() : '',
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    store.discounts.unshift(newDisc);
    saveMockStore(store);
    return newDisc;
  },

  async updateDiscount(id, data) {
    await delay();
    const store = getMockStore();
    if (!store.discounts) store.discounts = [];
    const idx = store.discounts.findIndex((x) => String(x.id) === String(id));
    if (idx === -1) throw new Error('Discount not found');
    store.discounts[idx] = {
      ...store.discounts[idx],
      ...data,
      discount_value: data.discount_value !== undefined ? Number(data.discount_value) : store.discounts[idx].discount_value,
      min_purchase: data.min_purchase !== undefined ? Number(data.min_purchase) : store.discounts[idx].min_purchase,
      min_quantity: data.min_quantity !== undefined ? Number(data.min_quantity) : store.discounts[idx].min_quantity,
      usage_limit: data.usage_limit !== undefined ? (data.usage_limit ? Number(data.usage_limit) : null) : store.discounts[idx].usage_limit,
      updated_at: new Date().toISOString(),
    };
    saveMockStore(store);
    return store.discounts[idx];
  },

  async deleteDiscount(id) {
    await delay();
    const store = getMockStore();
    if (!store.discounts) store.discounts = [];
    store.discounts = store.discounts.filter((x) => String(x.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },

  // --------------------------------------------------------------------------
  // Payments
  // --------------------------------------------------------------------------
  async getPayments(params = {}) {
    await delay();
    const store = getMockStore();
    let list = [...store.payments];

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.payment_reference && p.payment_reference.toLowerCase().includes(q)) ||
          (p.invoice_number && p.invoice_number.toLowerCase().includes(q)) ||
          (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      );
    }

    if (params.method && params.method !== 'ALL') {
      list = list.filter((p) => (p.payment_method || '').toUpperCase() === params.method.toUpperCase());
    }

    if (params.status && params.status !== 'ALL') {
      list = list.filter((p) => (p.status || '').toUpperCase() === params.status.toUpperCase());
    }

    return list;
  },

  async recordPayment(data) {
    await delay();
    const store = getMockStore();
    const inv = store.invoices.find((i) => String(i.id) === String(data.invoice_id));
    if (!inv) throw new Error('Target invoice not found');

    const paymentAmount = Number(data.amount);
    const outstanding = inv.balance_due ?? Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0));
    if (paymentAmount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }
    if (paymentAmount > outstanding + 0.01) {
      throw new Error(`Payment cannot exceed outstanding balance of ₹${outstanding}`);
    }

    const newPayment = {
      id: uid('pay'),
      payment_reference: `PAY-2026-${String(store.payments.length + 1).padStart(3, '0')}`,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_id: inv.customer_id,
      customer_name: inv.customer_name,
      amount: paymentAmount,
      payment_method: data.payment_method || 'CREDIT_CARD',
      payment_date: data.payment_date || new Date().toISOString(),
      status: 'SUCCESSFUL',
      notes: data.notes ? data.notes.trim() : '',
      created_at: new Date().toISOString(),
    };

    // Update target invoice balances
    inv.amount_paid = Number(((Number(inv.amount_paid) || 0) + paymentAmount).toFixed(2));
    inv.balance_due = Math.max(0, Number(((Number(inv.total) || 0) - inv.amount_paid).toFixed(2)));

    if (inv.balance_due <= 0.01) {
      inv.balance_due = 0;
      inv.status = 'PAID';
    } else {
      inv.status = 'PARTIALLY_PAID';
    }

    store.payments.unshift(newPayment);
    saveMockStore(store);
    return newPayment;
  },

  // --------------------------------------------------------------------------
  // Users & Role Management
  // --------------------------------------------------------------------------
  async getUsers() {
    await delay();
    const store = getMockStore();
    return [...store.users];
  },

  async createUser(data) {
    await delay();
    const store = getMockStore();
    const newUser = {
      id: uid('usr'),
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      role: (data.role || 'STAFF').toUpperCase(),
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
    };
    store.users.unshift(newUser);
    saveMockStore(store);
    return newUser;
  },

  async updateUser(id, data) {
    await delay();
    const store = getMockStore();
    const index = store.users.findIndex((u) => String(u.id) === String(id));
    if (index === -1) throw new Error('User not found');
    store.users[index] = {
      ...store.users[index],
      ...data,
      role: data.role ? data.role.toUpperCase() : store.users[index].role,
      updated_at: new Date().toISOString(),
    };
    saveMockStore(store);
    return store.users[index];
  },

  async deleteUser(id) {
    await delay();
    const store = getMockStore();
    store.users = store.users.filter((u) => String(u.id) !== String(id));
    saveMockStore(store);
    return { success: true };
  },
};

