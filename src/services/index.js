import api from './api';
import { mockService } from './mockService';

// Flag to control mock mode vs live API.
// Phase 3 requirement: Complete frontend with temporary mock data first before starting API integration.
const USE_MOCK = true;

// Helper to wrap mock results in standard Axios-like { data: ... } envelope
const mockWrap = async (promise) => {
  const result = await promise;
  return { data: result };
};

// ----------------------------------------------------------------------------
// Authentication Service
// ----------------------------------------------------------------------------
export const authService = {
  login: (data) =>
    USE_MOCK ? mockWrap(Promise.resolve({ access_token: `demo-token-${data.email}`, user: { name: 'Demo User', email: data.email, role: 'ADMIN' } })) : api.post('/auth/login', data),
  register: (data) =>
    USE_MOCK ? mockWrap(Promise.resolve({ success: true, message: 'Account registered' })) : api.post('/auth/register', data),
  forgotPassword: (data) =>
    USE_MOCK ? mockWrap(Promise.resolve({ success: true, message: 'Reset email sent' })) : api.post('/auth/forgot-password', data),
  getMe: () =>
    USE_MOCK ? mockWrap(Promise.resolve({ name: 'Rudra Chauhan', email: 'admin@billsync.com', role: 'ADMIN' })) : api.get('/auth/me'),
  logout: () =>
    USE_MOCK ? mockWrap(Promise.resolve({ success: true })) : api.post('/auth/logout'),
};

// ----------------------------------------------------------------------------
// Dashboard Service
// ----------------------------------------------------------------------------
export const dashboardService = {
  getStats: () =>
    USE_MOCK ? mockWrap(mockService.getDashboardStats()) : api.get('/dashboard/stats'),
  getRecentSubscriptions: () =>
    USE_MOCK ? mockWrap(mockService.getRecentSubscriptions()) : api.get('/dashboard/recent-subscriptions'),
  getRecentInvoices: () =>
    USE_MOCK ? mockWrap(mockService.getRecentInvoices()) : api.get('/dashboard/recent-invoices'),
  getRevenueChart: () =>
    USE_MOCK ? mockWrap(mockService.getRevenueChart()) : api.get('/dashboard/revenue-chart'),
};

// ----------------------------------------------------------------------------
// Customers Service
// ----------------------------------------------------------------------------
export const customerService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getCustomers(params)) : api.get('/customers', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getCustomerById(id)) : api.get(`/customers/${id}`),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createCustomer(data)) : api.post('/customers', data),
  update: (id, data) =>
    USE_MOCK ? mockWrap(mockService.updateCustomer(id, data)) : api.put(`/customers/${id}`, data),
  delete: (id) =>
    USE_MOCK ? mockWrap(mockService.deleteCustomer(id)) : api.delete(`/customers/${id}`),
  getSubscriptions: (id) =>
    USE_MOCK ? mockWrap(mockService.getCustomerSubscriptions(id)) : api.get(`/customers/${id}/subscriptions`),
  getQuotations: (id) =>
    USE_MOCK ? mockWrap(mockService.getCustomerQuotations(id)) : api.get(`/customers/${id}/quotations`),
  getInvoices: (id) =>
    USE_MOCK ? mockWrap(mockService.getCustomerInvoices(id)) : api.get(`/customers/${id}/invoices`),
  getPayments: (id) =>
    USE_MOCK ? mockWrap(mockService.getCustomerPayments(id)) : api.get(`/customers/${id}/payments`),
};

// ----------------------------------------------------------------------------
// Products Service (with Variant Support)
// ----------------------------------------------------------------------------
export const productService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getProducts(params)) : api.get('/products', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getProductById(id)) : api.get(`/products/${id}`),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createProduct(data)) : api.post('/products', data),
  update: (id, data) =>
    USE_MOCK ? mockWrap(mockService.updateProduct(id, data)) : api.put(`/products/${id}`, data),
  delete: (id) =>
    USE_MOCK ? mockWrap(mockService.deleteProduct(id)) : api.delete(`/products/${id}`),
};

// ----------------------------------------------------------------------------
// Subscription Plans Service
// ----------------------------------------------------------------------------
export const planService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getPlans()) : api.get('/plans', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getPlanById(id)) : api.get(`/plans/${id}`),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createPlan(data)) : api.post('/plans', data),
  update: (id, data) =>
    USE_MOCK ? mockWrap(mockService.updatePlan(id, data)) : api.put(`/plans/${id}`, data),
  delete: (id) =>
    USE_MOCK ? mockWrap(mockService.deletePlan(id)) : api.delete(`/plans/${id}`),
};

// ----------------------------------------------------------------------------
// Quotations Service
// ----------------------------------------------------------------------------
export const quotationService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getQuotations()) : api.get('/quotations', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getQuotationById(id)) : api.get(`/quotations/${id}`),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createQuotation(data)) : api.post('/quotations', data),
  confirm: (id) =>
    USE_MOCK ? mockWrap(mockService.updateQuotationStatus(id, 'ACCEPTED')) : api.post(`/quotations/${id}/confirm`),
  cancel: (id) =>
    USE_MOCK ? mockWrap(mockService.updateQuotationStatus(id, 'REJECTED')) : api.post(`/quotations/${id}/cancel`),
  convertToSubscription: (id) =>
    USE_MOCK ? mockWrap(mockService.convertQuotationToSubscription(id)) : api.post(`/quotations/${id}/convert`),
};

// ----------------------------------------------------------------------------
// Subscriptions Service
// ----------------------------------------------------------------------------
export const subscriptionService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getSubscriptions()) : api.get('/subscriptions', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getSubscriptionById(id)) : api.get(`/subscriptions/${id}`),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createSubscription(data)) : api.post('/subscriptions', data),
  pause: (id) =>
    USE_MOCK ? mockWrap(mockService.pauseSubscription(id)) : api.post(`/subscriptions/${id}/pause`),
  renew: (id) =>
    USE_MOCK ? mockWrap(mockService.renewSubscription(id)) : api.post(`/subscriptions/${id}/renew`),
  close: (id) =>
    USE_MOCK ? mockWrap(mockService.closeSubscription(id)) : api.post(`/subscriptions/${id}/close`),
};

// ----------------------------------------------------------------------------
// Invoices Service
// ----------------------------------------------------------------------------
export const invoiceService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getInvoices()) : api.get('/invoices', { params }),
  getById: (id) =>
    USE_MOCK ? mockWrap(mockService.getInvoiceById(id)) : api.get(`/invoices/${id}`),
  confirm: (id) =>
    USE_MOCK ? mockWrap(mockService.confirmInvoice(id)) : api.post(`/invoices/${id}/confirm`),
  cancel: (id) =>
    USE_MOCK ? mockWrap(mockService.cancelInvoice(id)) : api.post(`/invoices/${id}/cancel`),
  send: (id) =>
    USE_MOCK ? mockWrap(mockService.sendInvoice(id)) : api.post(`/invoices/${id}/send`),
};

// ----------------------------------------------------------------------------
// Payments Service
// ----------------------------------------------------------------------------
export const paymentService = {
  getAll: (params) =>
    USE_MOCK ? mockWrap(mockService.getPayments()) : api.get('/payments', { params }),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.recordPayment(data)) : api.post('/payments', data),
};

// ----------------------------------------------------------------------------
// Users & Role Management Service
// ----------------------------------------------------------------------------
export const userService = {
  getAll: () =>
    USE_MOCK ? mockWrap(mockService.getUsers()) : api.get('/users'),
  create: (data) =>
    USE_MOCK ? mockWrap(mockService.createUser(data)) : api.post('/users', data),
  update: (id, data) =>
    USE_MOCK ? mockWrap(mockService.updateUser(id, data)) : api.put(`/users/${id}`, data),
  delete: (id) =>
    USE_MOCK ? mockWrap(mockService.deleteUser(id)) : api.delete(`/users/${id}`),
};
