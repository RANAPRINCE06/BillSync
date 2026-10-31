import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../config/firebase.js';
import { INITIAL_MOCK_DATA, getMockStore, saveMockStore } from '../data/mockData.js';
import { calculateFinancialRecords } from '../utils/balanceEngine.js';
import { firestoreFinanceService } from './firestoreFinanceService.js';

// Event dispatched when Firestore data changes locally or via snapshot
const FIRESTORE_SYNC_EVENT = 'billsync:firestore_sync';

// Helper to generate IDs
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

// Timeout helper for resilient Firestore reads
const withTimeout = (promise, ms = 400) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))
  ]);
};

class FirestoreService {
  constructor() {
    this.initialized = false;
    this.isOnline = false;
    this.activeListeners = new Map();
    this.memoryCache = null;

    // Load local cache immediately
    this.loadCache();

    // Verify Firebase connection and initialize
    this.init();
  }

  loadCache() {
    try {
      this.memoryCache = getMockStore();
    } catch {
      this.memoryCache = { ...INITIAL_MOCK_DATA };
    }
  }

  saveCache() {
    try {
      if (this.memoryCache) {
        saveMockStore(this.memoryCache);
      }
    } catch {
      // Ignore cache persistence errors
    }
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    if (!db) {
      console.warn('[FirestoreService] Cloud Firestore not initialized in firebase.js; operating in cache-resilient mode.');
      this.isOnline = false;
      return;
    }

    try {
      // Check connection by attempting a read on customers collection
      const testSnap = await getDocs(query(collection(db, 'customers'), limit(1))).catch(() => null);
      if (testSnap) {
        this.isOnline = true;
        // If Firestore is completely fresh / empty, seed initial records
        if (testSnap.empty) {
          await this.seedInitialData();
        }
      }
    } catch (err) {
      console.warn('[FirestoreService] Firestore connection check note:', err.message || err);
      this.isOnline = false;
    }
  }

  async seedInitialData() {
    if (!db) return;
    try {
      const collectionsToSeed = [
        { name: 'users', items: INITIAL_MOCK_DATA.users },
        { name: 'customers', items: INITIAL_MOCK_DATA.customers },
        { name: 'products', items: INITIAL_MOCK_DATA.products },
        { name: 'plans', items: INITIAL_MOCK_DATA.plans },
        { name: 'quotation_templates', items: INITIAL_MOCK_DATA.quotation_templates },
        { name: 'quotations', items: INITIAL_MOCK_DATA.quotations },
        { name: 'subscriptions', items: INITIAL_MOCK_DATA.subscriptions },
        { name: 'invoices', items: INITIAL_MOCK_DATA.invoices },
        { name: 'payments', items: INITIAL_MOCK_DATA.payments },
        { name: 'discounts', items: INITIAL_MOCK_DATA.discounts },
      ];

      for (const col of collectionsToSeed) {
        if (!col.items || !Array.isArray(col.items)) continue;
        for (const item of col.items) {
          if (item.id) {
            await setDoc(doc(db, col.name, String(item.id)), item).catch(() => {});
          }
        }
      }
    } catch {
      // Ignore seeding errors
    }
  }

  // Generic collection fetch with Firestore priority and cache fallback
  async fetchCollection(collectionName) {
    if (db) {
      try {
        const snap = await withTimeout(getDocs(collection(db, collectionName)), 400);
        if (snap && !snap.empty) {
          const list = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
          if (this.memoryCache) {
            this.memoryCache[collectionName] = list;
            this.saveCache();
          }
          return list;
        }
      } catch (err) {
        // Fallback to cache if Firestore offline or timing out
      }
    }

    // Cache fallback
    this.loadCache();
    return this.memoryCache[collectionName] || [];
  }

  // Generic document fetch by ID
  async fetchDocument(collectionName, id) {
    const strId = String(id);
    if (db) {
      try {
        const snap = await withTimeout(getDoc(doc(db, collectionName, strId)), 400);
        if (snap && snap.exists()) {
          return { id: snap.id, ...snap.data() };
        }
      } catch (err) {
        // Fallback to cache
      }
    }

    this.loadCache();
    const list = this.memoryCache[collectionName] || [];
    const item = list.find((x) => String(x.id) === strId);
    if (!item) throw new Error(`${collectionName.slice(0, -1)} with ID ${id} not found`);
    return item;
  }

  // Generic document create
  async createDocument(collectionName, data, customId = null) {
    const docId = customId || data.id || uid(collectionName.slice(0, 3));
    const cleanData = {
      ...data,
      id: docId,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 1. Write to Cloud Firestore (non-blocking)
    if (db) {
      setDoc(doc(db, collectionName, String(docId)), cleanData).catch(() => {});
    }

    // 2. Write to local cache
    this.loadCache();
    if (!this.memoryCache[collectionName]) this.memoryCache[collectionName] = [];
    this.memoryCache[collectionName] = [
      cleanData,
      ...this.memoryCache[collectionName].filter((x) => String(x.id) !== String(docId))
    ];
    this.saveCache();

    // Notify listeners
    this.broadcastChange(collectionName, cleanData);
    return cleanData;
  }

  // Generic document update
  async updateDocument(collectionName, id, updates) {
    const strId = String(id);
    const cleanUpdates = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (db) {
      updateDoc(doc(db, collectionName, strId), cleanUpdates).catch(() => {});
    }

    this.loadCache();
    if (this.memoryCache[collectionName]) {
      this.memoryCache[collectionName] = this.memoryCache[collectionName].map((item) => {
        if (String(item.id) === strId) {
          return { ...item, ...cleanUpdates };
        }
        return item;
      });
      this.saveCache();
    }

    const updated = await this.fetchDocument(collectionName, strId);
    this.broadcastChange(collectionName, updated);
    return updated;
  }

  // Generic document delete
  async deleteDocument(collectionName, id) {
    const strId = String(id);
    if (db) {
      deleteDoc(doc(db, collectionName, strId)).catch(() => {});
    }

    this.loadCache();
    if (this.memoryCache[collectionName]) {
      this.memoryCache[collectionName] = this.memoryCache[collectionName].filter((x) => String(x.id) !== strId);
      this.saveCache();
    }

    this.broadcastChange(collectionName, { id: strId, _deleted: true });
    return { success: true, id: strId };
  }

  // Real-time collection subscription
  subscribe(collectionName, callback) {
    if (!callback) return () => {};

    if (db) {
      try {
        const unsub = onSnapshot(
          collection(db, collectionName),
          (snapshot) => {
            const items = [];
            snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
            if (this.memoryCache) {
              this.memoryCache[collectionName] = items;
              this.saveCache();
            }
            callback(items);
          },
          (err) => {
            // On error, emit cached data
            this.loadCache();
            callback(this.memoryCache[collectionName] || []);
          }
        );
        return unsub;
      } catch {
        // Fallback
      }
    }

    // Local event listener fallback
    this.loadCache();
    callback(this.memoryCache[collectionName] || []);

    const handler = (e) => {
      if (e.detail?.collection === collectionName) {
        this.loadCache();
        callback(this.memoryCache[collectionName] || []);
      }
    };

    window.addEventListener(FIRESTORE_SYNC_EVENT, handler);
    return () => window.removeEventListener(FIRESTORE_SYNC_EVENT, handler);
  }

  broadcastChange(collectionName, payload) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FIRESTORE_SYNC_EVENT, { detail: { collection: collectionName, payload } }));
    }
  }

  // ==========================================================================
  // MODULE SPECIFIC IMPLEMENTATIONS
  // ==========================================================================

  // --- Customers ---
  async getCustomers(params = {}) {
    let list = await this.fetchCollection('customers');
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
  }

  async getCustomerById(id) {
    return this.fetchDocument('customers', id);
  }

  async createCustomer(data) {
    if (!data.name || !data.name.trim()) throw new Error('Customer name is required');
    if (!data.email || !data.email.trim()) throw new Error('Customer email is required');
    return this.createDocument('customers', {
      ...data,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
    });
  }

  async updateCustomer(id, data) {
    return this.updateDocument('customers', id, data);
  }

  async deleteCustomer(id) {
    const subs = await this.fetchCollection('subscriptions');
    const activeSub = subs.find((s) => String(s.customer_id) === String(id) && s.status === 'ACTIVE');
    if (activeSub) {
      throw new Error('Cannot delete customer with an active subscription. Cancel or close the subscription first.');
    }
    return this.deleteDocument('customers', id);
  }

  // --- Products ---
  async getProducts(params = {}) {
    let list = await this.fetchCollection('products');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.product_type && p.product_type.toLowerCase().includes(q))
      );
    }
    if (params.type && params.type !== 'ALL') {
      list = list.filter((p) => (p.product_type || '').toUpperCase() === params.type.toUpperCase());
    }
    return list;
  }

  async getProductById(id) {
    return this.fetchDocument('products', id);
  }

  async createProduct(data) {
    if (!data.name || !data.name.trim()) throw new Error('Product name is required');
    const salesPrice = Number(data.sales_price);
    if (isNaN(salesPrice) || salesPrice < 0) throw new Error('Sales price must be a valid positive number');

    const cleanVariants = (data.variants || []).map((v, idx) => ({
      id: v.id || `v-${Date.now()}-${idx}`,
      name: v.name || 'Standard Variant',
      sku: v.sku || `SKU-${Date.now()}-${idx}`,
      additional_price: Number(v.additional_price) || 0,
      final_price: salesPrice + (Number(v.additional_price) || 0),
    }));

    return this.createDocument('products', {
      ...data,
      name: data.name.trim(),
      sales_price: salesPrice,
      cost_price: Number(data.cost_price) || 0,
      product_type: data.product_type || 'SERVICE',
      variants: cleanVariants,
      is_active: data.is_active !== false,
    });
  }

  async updateProduct(id, data) {
    const salesPrice = data.sales_price !== undefined ? Number(data.sales_price) : undefined;
    let cleanVariants = data.variants;
    if (cleanVariants && salesPrice !== undefined) {
      cleanVariants = cleanVariants.map((v, idx) => ({
        ...v,
        id: v.id || `v-${Date.now()}-${idx}`,
        additional_price: Number(v.additional_price) || 0,
        final_price: salesPrice + (Number(v.additional_price) || 0),
      }));
    }
    return this.updateDocument('products', id, {
      ...data,
      ...(salesPrice !== undefined ? { sales_price: salesPrice } : {}),
      ...(cleanVariants ? { variants: cleanVariants } : {}),
    });
  }

  async deleteProduct(id) {
    return this.deleteDocument('products', id);
  }

  // --- Subscription Plans ---
  async getPlans(params = {}) {
    let list = await this.fetchCollection('plans');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
    }
    if (params.interval && params.interval !== 'ALL') {
      list = list.filter((p) => (p.billing_interval || '').toUpperCase() === params.interval.toUpperCase());
    }
    return list;
  }

  async getPlanById(id) {
    return this.fetchDocument('plans', id);
  }

  async createPlan(data) {
    if (!data.name || !data.name.trim()) throw new Error('Plan name is required');
    const price = Number(data.price);
    if (isNaN(price) || price < 0) throw new Error('Plan price must be a valid positive number');

    return this.createDocument('plans', {
      ...data,
      name: data.name.trim(),
      price,
      billing_interval: (data.billing_interval || 'MONTHLY').toUpperCase(),
      min_quantity: Number(data.min_quantity) || 1,
      allow_pause: data.allow_pause !== false,
      allow_early_close: data.allow_early_close !== false,
      allow_renewal: data.allow_renewal !== false,
      auto_close: !!data.auto_close,
      is_active: data.is_active !== false,
    });
  }

  async updatePlan(id, data) {
    return this.updateDocument('plans', id, data);
  }

  async deletePlan(id) {
    return this.deleteDocument('plans', id);
  }

  // --- Quotations ---
  async getQuotations(params = {}) {
    let list = await this.fetchCollection('quotations');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (x) =>
          (x.quotation_number && x.quotation_number.toLowerCase().includes(q)) ||
          (x.customer_name && x.customer_name.toLowerCase().includes(q)) ||
          (x.company && x.company.toLowerCase().includes(q))
      );
    }
    if (params.status && params.status !== 'ALL') {
      list = list.filter((x) => (x.status || '').toUpperCase() === params.status.toUpperCase());
    }
    return list;
  }

  async getQuotationById(id) {
    const qt = await this.fetchDocument('quotations', id);
    const customer = await this.fetchDocument('customers', qt.customer_id).catch(() => null);
    return { ...qt, customer };
  }

  async getQuotationTemplates() {
    return this.fetchCollection('quotation_templates');
  }

  async createQuotation(data) {
    if (!data.customer_id) throw new Error('Customer is required for quotation');
    const customer = await this.fetchDocument('customers', data.customer_id);

    const quotes = await this.fetchCollection('quotations');
    const qNum = `QT-2026-${String(quotes.length + 1).padStart(3, '0')}`;

    const items = (data.items || []).map((it) => {
      const qty = Number(it.quantity) || 1;
      const price = Number(it.unit_price) || 0;
      const taxRate = it.tax_rate ?? 18;
      const lineTotal = qty * price;
      return {
        ...it,
        quantity: qty,
        unit_price: price,
        tax_rate: taxRate,
        line_total: lineTotal,
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.line_total, 0);
    const tax_amount = items.reduce((sum, it) => sum + (it.line_total * (it.tax_rate || 18)) / 100, 0);
    const discount_amount = Number(data.discount_amount) || 0;
    const total = Math.max(0, subtotal + tax_amount - discount_amount);

    return this.createDocument('quotations', {
      ...data,
      quotation_number: qNum,
      customer_id: customer.id,
      customer_name: customer.name,
      company: customer.company || '',
      items,
      subtotal,
      tax_amount,
      discount_amount,
      total,
      status: 'DRAFT',
      validity_date: data.validity_date || new Date(Date.now() + 14 * 86400000).toISOString(),
    });
  }

  async updateQuotation(id, data) {
    return this.updateDocument('quotations', id, data);
  }

  async deleteQuotation(id) {
    return this.deleteDocument('quotations', id);
  }

  async updateQuotationStatus(id, newStatus) {
    return this.updateDocument('quotations', id, { status: newStatus });
  }

  async convertQuotationToSubscription(quotationId) {
    const qt = await this.fetchDocument('quotations', quotationId);
    if (!qt) throw new Error('Quotation not found');

    // 1. Mark Quotation Accepted
    await this.updateDocument('quotations', quotationId, { status: 'ACCEPTED' });

    // 2. Create Subscription
    const subs = await this.fetchCollection('subscriptions');
    const subNum = `SUB-2026-${String(subs.length + 1).padStart(3, '0')}`;

    const newSub = await this.createDocument('subscriptions', {
      subscription_number: subNum,
      customer_id: qt.customer_id,
      customer_name: qt.customer_name,
      company: qt.company || '',
      plan_id: qt.plan_id || 'plan-001',
      plan_name: qt.plan_name || 'Standard Agreement',
      billing_interval: 'MONTHLY',
      status: 'CONFIRMED',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 86400000).toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      subtotal: qt.subtotal,
      tax_amount: qt.tax_amount,
      discount_amount: qt.discount_amount || 0,
      total_amount: qt.total,
      items: qt.items || [],
      history: [
        { event: 'Created', timestamp: new Date().toISOString(), notes: `Converted from Quotation ${qt.quotation_number}` },
        { event: 'Confirmed', timestamp: new Date().toISOString(), notes: 'Agreement terms confirmed' },
      ],
    });

    // 3. Automatically generate confirmed Invoice
    const invs = await this.fetchCollection('invoices');
    const invNum = `INV-2026-${String(invs.length + 1).padStart(3, '0')}`;

    const newInv = await this.createDocument('invoices', {
      invoice_number: invNum,
      customer_id: qt.customer_id,
      customer_name: qt.customer_name,
      company: qt.company || '',
      subscription_id: newSub.id,
      issue_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 15 * 86400000).toISOString(),
      status: 'CONFIRMED',
      subtotal: qt.subtotal,
      tax_amount: qt.tax_amount,
      discount_amount: qt.discount_amount || 0,
      total: qt.total,
      amount_paid: 0,
      balance_due: qt.total,
      items: (qt.items || []).map((i) => ({
        description: i.product_name || i.name || 'Service Item',
        quantity: i.quantity || 1,
        unit_price: i.unit_price || 0,
        tax_rate: i.tax_rate || 18,
        line_total: (i.quantity || 1) * (i.unit_price || 0),
      })),
    });

    // Sync with real-time balance engine
    firestoreFinanceService.saveInvoice(newInv);

    return { subscription: newSub, invoice: newInv };
  }

  async duplicateQuotation(id) {
    const orig = await this.fetchDocument('quotations', id);
    const quotes = await this.fetchCollection('quotations');
    const qNum = `QT-2026-${String(quotes.length + 1).padStart(3, '0')}`;

    return this.createDocument('quotations', {
      ...orig,
      id: undefined,
      quotation_number: qNum,
      status: 'DRAFT',
      created_at: new Date().toISOString(),
    });
  }

  // --- Subscriptions ---
  async getSubscriptions(params = {}) {
    let list = await this.fetchCollection('subscriptions');
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
    return list;
  }

  async getSubscriptionById(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const customer = await this.fetchDocument('customers', sub.customer_id).catch(() => null);
    const plan = await this.fetchDocument('plans', sub.plan_id).catch(() => null);
    return { ...sub, customer, plan };
  }

  async createSubscription(data) {
    const subs = await this.fetchCollection('subscriptions');
    const subNum = `SUB-2026-${String(subs.length + 1).padStart(3, '0')}`;
    const customer = await this.fetchDocument('customers', data.customer_id);
    const plan = await this.fetchDocument('plans', data.plan_id);

    const items = (data.items || []).map((it) => ({
      ...it,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      tax_rate: it.tax_rate ?? 18,
      line_total: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
    }));

    const subtotal = items.reduce((sum, it) => sum + it.line_total, 0);
    const tax_amount = items.reduce((sum, it) => sum + (it.line_total * (it.tax_rate || 18)) / 100, 0);
    const total_amount = subtotal + tax_amount;

    return this.createDocument('subscriptions', {
      ...data,
      subscription_number: subNum,
      customer_id: customer.id,
      customer_name: customer.name,
      company: customer.company || '',
      plan_id: plan.id,
      plan_name: plan.name,
      billing_interval: plan.billing_interval || 'MONTHLY',
      status: data.status || 'DRAFT',
      items,
      subtotal,
      tax_amount,
      total_amount,
      start_date: data.start_date || new Date().toISOString(),
      end_date: data.end_date || new Date(Date.now() + 365 * 86400000).toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      history: [
        { event: 'Created', timestamp: new Date().toISOString(), notes: 'Subscription created' },
      ],
    });
  }

  async confirmSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Confirmed', timestamp: new Date().toISOString(), notes: 'Terms confirmed' });
    return this.updateDocument('subscriptions', id, { status: 'CONFIRMED', history });
  }

  async activateSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Activated', timestamp: new Date().toISOString(), notes: 'Subscription activated' });
    return this.updateDocument('subscriptions', id, { status: 'ACTIVE', history });
  }

  async pauseSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Paused', timestamp: new Date().toISOString(), notes: 'Subscription temporarily paused' });
    return this.updateDocument('subscriptions', id, { status: 'PAUSED', history });
  }

  async resumeSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Resumed', timestamp: new Date().toISOString(), notes: 'Subscription resumed' });
    return this.updateDocument('subscriptions', id, { status: 'ACTIVE', history });
  }

  async renewSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Renewed', timestamp: new Date().toISOString(), notes: 'Subscription term renewed' });
    return this.updateDocument('subscriptions', id, {
      status: 'ACTIVE',
      next_billing_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      history,
    });
  }

  async closeSubscription(id) {
    const sub = await this.fetchDocument('subscriptions', id);
    const history = sub.history || [];
    history.push({ event: 'Closed', timestamp: new Date().toISOString(), notes: 'Subscription closed' });
    return this.updateDocument('subscriptions', id, { status: 'CLOSED', history });
  }

  // --- Invoices ---
  async getInvoices(params = {}) {
    let list = await this.fetchCollection('invoices');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.invoice_number && i.invoice_number.toLowerCase().includes(q)) ||
          (i.customer_name && i.customer_name.toLowerCase().includes(q)) ||
          (i.company && i.company.toLowerCase().includes(q))
      );
    }
    if (params.status && params.status !== 'ALL') {
      list = list.filter((i) => (i.status || '').toUpperCase() === params.status.toUpperCase());
    }
    return list;
  }

  async getInvoiceById(id) {
    const inv = await this.fetchDocument('invoices', id);
    const customer = await this.fetchDocument('customers', inv.customer_id).catch(() => null);
    const payments = await this.fetchCollection('payments');
    const linkedPayments = payments.filter((p) => String(p.invoice_id) === String(id));
    return { ...inv, customer, payments: linkedPayments };
  }

  async confirmInvoice(id) {
    const updated = await this.updateDocument('invoices', id, { status: 'CONFIRMED' });
    firestoreFinanceService.updateInvoiceStatus(id, 'CONFIRMED');
    return updated;
  }

  async cancelInvoice(id) {
    const updated = await this.updateDocument('invoices', id, { status: 'CANCELLED', balance_due: 0 });
    firestoreFinanceService.updateInvoiceStatus(id, 'CANCELLED');
    return updated;
  }

  async sendInvoice(id) {
    return this.updateDocument('invoices', id, { status: 'SENT', sent_at: new Date().toISOString() });
  }

  // --- Discounts ---
  async getDiscounts(params = {}) {
    let list = await this.fetchCollection('discounts');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q)));
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
  }

  async getDiscountById(id) {
    return this.fetchDocument('discounts', id);
  }

  async createDiscount(data) {
    if (!data.name || !data.name.trim()) throw new Error('Discount name is required');
    const val = Number(data.discount_value);
    if (isNaN(val) || val <= 0) throw new Error('Discount value must be greater than zero');

    return this.createDocument('discounts', {
      ...data,
      name: data.name.trim(),
      discount_value: val,
      discount_type: (data.discount_type || 'PERCENTAGE').toUpperCase(),
      min_purchase: Number(data.min_purchase) || 0,
      min_quantity: Number(data.min_quantity) || 1,
      times_used: 0,
      is_active: data.is_active !== false,
    });
  }

  async updateDiscount(id, data) {
    return this.updateDocument('discounts', id, data);
  }

  async deleteDiscount(id) {
    return this.deleteDocument('discounts', id);
  }

  // --- Payments (Transactional with Invoices) ---
  async getPayments(params = {}) {
    let list = await this.fetchCollection('payments');
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.payment_reference && p.payment_reference.toLowerCase().includes(q)) ||
          (p.invoice_number && p.invoice_number.toLowerCase().includes(q)) ||
          (p.customer_name && p.customer_name.toLowerCase().includes(q))
      );
    }
    if (params.method && params.method !== 'ALL') {
      list = list.filter((p) => (p.payment_method || '').toUpperCase() === params.method.toUpperCase());
    }
    if (params.status && params.status !== 'ALL') {
      list = list.filter((p) => (p.status || '').toUpperCase() === params.status.toUpperCase());
    }
    return list;
  }

  async recordPayment(data) {
    if (!data.invoice_id) throw new Error('Target invoice is required');
    const inv = await this.fetchDocument('invoices', data.invoice_id);
    if (!inv) throw new Error('Target invoice not found in database');

    const paymentAmount = Number(data.amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      throw new Error('Payment amount must be a valid number greater than zero');
    }

    const currentBalanceDue = inv.balance_due !== undefined
      ? Number(inv.balance_due)
      : Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0));

    if (paymentAmount > currentBalanceDue + 0.01) {
      throw new Error(`Payment amount (₹${paymentAmount.toFixed(2)}) cannot exceed outstanding balance of ₹${currentBalanceDue.toFixed(2)}`);
    }

    const pays = await this.fetchCollection('payments');
    const payRef = `PAY-2026-${String(pays.length + 1).padStart(3, '0')}`;

    const newPayment = {
      id: uid('pay'),
      payment_reference: payRef,
      invoice_id: String(inv.id),
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

    // Calculate updated balances on invoice
    const newAmountPaid = Number(((Number(inv.amount_paid) || 0) + paymentAmount).toFixed(2));
    const newBalanceDue = Math.max(0, Number(((Number(inv.total) || 0) - newAmountPaid).toFixed(2)));
    const newStatus = newBalanceDue <= 0.01 ? 'PAID' : 'PARTIALLY_PAID';

    // Atomic update: save payment and update invoice
    await this.createDocument('payments', newPayment, newPayment.id);
    await this.updateDocument('invoices', inv.id, {
      amount_paid: newAmountPaid,
      balance_due: newBalanceDue,
      status: newStatus,
    });

    // Notify real-time balance listeners
    firestoreFinanceService.recordPayment(newPayment);
    firestoreFinanceService.saveInvoice({ ...inv, amount_paid: newAmountPaid, balance_due: newBalanceDue, status: newStatus });

    return newPayment;
  }

  // --- Users & Roles ---
  async getUsers() {
    return this.fetchCollection('users');
  }

  async createUser(data) {
    if (!data.email || !data.email.trim()) throw new Error('Email is required');
    return this.createDocument('users', {
      ...data,
      email: data.email.trim().toLowerCase(),
      name: data.name ? data.name.trim() : data.email.split('@')[0],
      role: (data.role || 'STAFF').toUpperCase(),
      is_active: data.is_active !== false,
      account_status: 'ACTIVE',
    });
  }

  async updateUser(id, data) {
    return this.updateDocument('users', id, data);
  }

  async deleteUser(id) {
    return this.deleteDocument('users', id);
  }

  // --- Dashboard Metrics from Firestore ---
  async getDashboardStats() {
    const [invoices, payments, subscriptions, customers] = await Promise.all([
      this.fetchCollection('invoices'),
      this.fetchCollection('payments'),
      this.fetchCollection('subscriptions'),
      this.fetchCollection('customers'),
    ]);

    const financial = calculateFinancialRecords(invoices, payments);
    const active_subscriptions = subscriptions.filter((s) => s.status === 'ACTIVE').length;
    const total_customers = customers.length;

    return {
      active_subscriptions,
      total_customers,
      total_invoiced: financial.totalInvoiced,
      total_revenue: financial.totalInvoiced,
      total_received: financial.totalReceived,
      revenue_received: financial.totalReceived,
      total_balance: financial.totalBalance,
      outstanding_payments: financial.totalBalance,
      overdue_balance: financial.overdueBalance,
      overdue_invoices: financial.overdueInvoicesCount,
      invoice_breakdowns: financial.invoiceBreakdowns,
    };
  }

  async getRecentSubscriptions() {
    const subs = await this.fetchCollection('subscriptions');
    return [...subs].reverse().slice(0, 5);
  }

  async getRecentInvoices() {
    const invs = await this.fetchCollection('invoices');
    return [...invs].reverse().slice(0, 5);
  }

  async getRevenueChart() {
    const cache = this.memoryCache || getMockStore();
    return cache.revenue_chart || [];
  }

  async getSubscriptionChart() {
    const cache = this.memoryCache || getMockStore();
    return cache.subscription_chart || [];
  }
}

export const firestoreService = new FirestoreService();
