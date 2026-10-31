import api from './api';

// Auth
export const authService = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// Dashboard
export const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentSubscriptions: () => api.get('/dashboard/recent-subscriptions'),
  getRecentInvoices: () => api.get('/dashboard/recent-invoices'),
  getRevenueChart: () => api.get('/dashboard/revenue-chart'),
};

// Customers
export const customerService = {
  getAll: (params) => api.get('/customers', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  getSubscriptions: (id) => api.get(`/customers/${id}/subscriptions`),
  getInvoices: (id) => api.get(`/customers/${id}/invoices`),
};

// Products
export const productService = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

// Subscription Plans
export const planService = {
  getAll: (params) => api.get('/plans', { params }),
  getById: (id) => api.get(`/plans/${id}`),
  create: (data) => api.post('/plans', data),
  update: (id, data) => api.put(`/plans/${id}`, data),
  delete: (id) => api.delete(`/plans/${id}`),
};

// Quotations
export const quotationService = {
  getAll: (params) => api.get('/quotations', { params }),
  getById: (id) => api.get(`/quotations/${id}`),
  create: (data) => api.post('/quotations', data),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  delete: (id) => api.delete(`/quotations/${id}`),
  convertToSubscription: (id) => api.post(`/quotations/${id}/convert`),
  confirm: (id) => api.post(`/quotations/${id}/confirm`),
  cancel: (id) => api.post(`/quotations/${id}/cancel`),
};

// Subscriptions
export const subscriptionService = {
  getAll: (params) => api.get('/subscriptions', { params }),
  getById: (id) => api.get(`/subscriptions/${id}`),
  create: (data) => api.post('/subscriptions', data),
  update: (id, data) => api.put(`/subscriptions/${id}`, data),
  pause: (id) => api.post(`/subscriptions/${id}/pause`),
  renew: (id) => api.post(`/subscriptions/${id}/renew`),
  close: (id) => api.post(`/subscriptions/${id}/close`),
};

// Invoices
export const invoiceService = {
  getAll: (params) => api.get('/invoices', { params }),
  getById: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  confirm: (id) => api.post(`/invoices/${id}/confirm`),
  cancel: (id) => api.post(`/invoices/${id}/cancel`),
  send: (id) => api.post(`/invoices/${id}/send`),
};

// Payments
export const paymentService = {
  getAll: (params) => api.get('/payments', { params }),
  getById: (id) => api.get(`/payments/${id}`),
  create: (data) => api.post('/payments', data),
};

