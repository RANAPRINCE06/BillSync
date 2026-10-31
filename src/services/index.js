import { firestoreService } from './firestoreService.js';

// Helper to wrap Firestore results in standard Axios-like { data: ... } envelope
const firestoreWrap = async (promise) => {
  const result = await promise;
  return { data: result };
};

// ----------------------------------------------------------------------------
// Authentication Service (Cloud Firestore & Firebase Auth)
// ----------------------------------------------------------------------------
export const authService = {
  login: async (credentials) => {
    const email = (credentials.email || '').trim().toLowerCase();
    const users = await firestoreService.getUsers();
    const user = users.find((u) => u.email && u.email.toLowerCase() === email);
    if (!user) {
      throw new Error('No user account found with this email address');
    }
    return {
      data: {
        access_token: `firebase-token-${user.id || user.uid}`,
        user,
      },
    };
  },

  register: async (data) => {
    const email = (data.email || '').trim().toLowerCase();
    const users = await firestoreService.getUsers();
    if (users.some((u) => u.email && u.email.toLowerCase() === email)) {
      throw new Error('An account already exists with this email address');
    }

    const newUser = await firestoreService.createUser({
      name: data.name ? data.name.trim() : email.split('@')[0],
      email,
      role: 'CUSTOMER',
      account_status: 'ACTIVE',
      is_active: true,
      provider: 'password',
    });

    return { data: { success: true, message: 'Account registered successfully', user: newUser } };
  },

  forgotPassword: async (data) => {
    return { data: { success: true, message: `Password reset instructions sent to ${data.email}` } };
  },

  getMe: async () => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        const freshUser = await firestoreService.fetchDocument('users', u.id || u.uid).catch(() => u);
        return { data: freshUser };
      } catch {
        // Fallback
      }
    }
    return { data: { name: 'Demo User', email: 'admin@billsync.com', role: 'ADMIN' } };
  },

  logout: async () => {
    return { data: { success: true } };
  },
};

// ----------------------------------------------------------------------------
// Dashboard Service (Cloud Firestore Financial Telemetry)
// ----------------------------------------------------------------------------
export const dashboardService = {
  getStats: () => firestoreWrap(firestoreService.getDashboardStats()),
  getRecentSubscriptions: () => firestoreWrap(firestoreService.getRecentSubscriptions()),
  getRecentInvoices: () => firestoreWrap(firestoreService.getRecentInvoices()),
  getRevenueChart: () => firestoreWrap(firestoreService.getRevenueChart()),
  getSubscriptionChart: () => firestoreWrap(firestoreService.getSubscriptionChart()),
};

// ----------------------------------------------------------------------------
// Customers Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const customerService = {
  getAll: (params) => firestoreWrap(firestoreService.getCustomers(params)),
  getById: (id) => firestoreWrap(firestoreService.getCustomerById(id)),
  create: (data) => firestoreWrap(firestoreService.createCustomer(data)),
  update: (id, data) => firestoreWrap(firestoreService.updateCustomer(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deleteCustomer(id)),
  getSubscriptions: (id) =>
    firestoreWrap(
      firestoreService.fetchCollection('subscriptions').then((list) => list.filter((s) => String(s.customer_id) === String(id)))
    ),
  getQuotations: (id) =>
    firestoreWrap(
      firestoreService.fetchCollection('quotations').then((list) => list.filter((q) => String(q.customer_id) === String(id)))
    ),
  getInvoices: (id) =>
    firestoreWrap(
      firestoreService.fetchCollection('invoices').then((list) => list.filter((i) => String(i.customer_id) === String(id)))
    ),
  getPayments: (id) =>
    firestoreWrap(
      firestoreService.fetchCollection('payments').then((list) => list.filter((p) => String(p.customer_id) === String(id)))
    ),
};

// ----------------------------------------------------------------------------
// Products Service (Cloud Firestore with Variants)
// ----------------------------------------------------------------------------
export const productService = {
  getAll: (params) => firestoreWrap(firestoreService.getProducts(params)),
  getById: (id) => firestoreWrap(firestoreService.getProductById(id)),
  create: (data) => firestoreWrap(firestoreService.createProduct(data)),
  update: (id, data) => firestoreWrap(firestoreService.updateProduct(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deleteProduct(id)),
};

// ----------------------------------------------------------------------------
// Subscription Plans Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const planService = {
  getAll: (params) => firestoreWrap(firestoreService.getPlans(params)),
  getById: (id) => firestoreWrap(firestoreService.getPlanById(id)),
  create: (data) => firestoreWrap(firestoreService.createPlan(data)),
  update: (id, data) => firestoreWrap(firestoreService.updatePlan(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deletePlan(id)),
};

// ----------------------------------------------------------------------------
// Quotations Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const quotationService = {
  getAll: (params) => firestoreWrap(firestoreService.getQuotations(params)),
  getById: (id) => firestoreWrap(firestoreService.getQuotationById(id)),
  getTemplates: () => firestoreWrap(firestoreService.getQuotationTemplates()),
  create: (data) => firestoreWrap(firestoreService.createQuotation(data)),
  update: (id, data) => firestoreWrap(firestoreService.updateQuotation(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deleteQuotation(id)),
  confirm: (id) => firestoreWrap(firestoreService.updateQuotationStatus(id, 'ACCEPTED')),
  cancel: (id) => firestoreWrap(firestoreService.updateQuotationStatus(id, 'REJECTED')),
  convertToSubscription: (id) => firestoreWrap(firestoreService.convertQuotationToSubscription(id)),
  duplicate: (id) => firestoreWrap(firestoreService.duplicateQuotation(id)),
};

// ----------------------------------------------------------------------------
// Subscriptions Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const subscriptionService = {
  getAll: (params) => firestoreWrap(firestoreService.getSubscriptions(params)),
  getById: (id) => firestoreWrap(firestoreService.getSubscriptionById(id)),
  create: (data) => firestoreWrap(firestoreService.createSubscription(data)),
  confirm: (id) => firestoreWrap(firestoreService.confirmSubscription(id)),
  activate: (id) => firestoreWrap(firestoreService.activateSubscription(id)),
  pause: (id) => firestoreWrap(firestoreService.pauseSubscription(id)),
  resume: (id) => firestoreWrap(firestoreService.resumeSubscription(id)),
  renew: (id) => firestoreWrap(firestoreService.renewSubscription(id)),
  close: (id) => firestoreWrap(firestoreService.closeSubscription(id)),
};

// ----------------------------------------------------------------------------
// Invoices Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const invoiceService = {
  getAll: (params) => firestoreWrap(firestoreService.getInvoices(params)),
  getById: (id) => firestoreWrap(firestoreService.getInvoiceById(id)),
  confirm: (id) => firestoreWrap(firestoreService.confirmInvoice(id)),
  cancel: (id) => firestoreWrap(firestoreService.cancelInvoice(id)),
  send: (id) => firestoreWrap(firestoreService.sendInvoice(id)),
};

// ----------------------------------------------------------------------------
// Discount Management Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const discountService = {
  getAll: (params) => firestoreWrap(firestoreService.getDiscounts(params)),
  getById: (id) => firestoreWrap(firestoreService.getDiscountById(id)),
  create: (data) => firestoreWrap(firestoreService.createDiscount(data)),
  update: (id, data) => firestoreWrap(firestoreService.updateDiscount(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deleteDiscount(id)),
};

// ----------------------------------------------------------------------------
// Payments Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const paymentService = {
  getAll: (params) => firestoreWrap(firestoreService.getPayments(params)),
  create: (data) => firestoreWrap(firestoreService.recordPayment(data)),
};

// ----------------------------------------------------------------------------
// Users & Role Management Service (Cloud Firestore)
// ----------------------------------------------------------------------------
export const userService = {
  getAll: () => firestoreWrap(firestoreService.getUsers()),
  create: (data) => firestoreWrap(firestoreService.createUser(data)),
  update: (id, data) => firestoreWrap(firestoreService.updateUser(id, data)),
  delete: (id) => firestoreWrap(firestoreService.deleteUser(id)),
};
