import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

// Dashboard & Customer Portal
import DashboardPage from './pages/dashboard/DashboardPage';
import CustomerPortalPage from './pages/portal/CustomerPortalPage';

// Customers
import CustomersPage from './pages/customers/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';

// Products
import ProductsPage from './pages/products/ProductsPage';

// Plans
import PlansPage from './pages/plans/PlansPage';

// Quotations
import QuotationsPage from './pages/quotations/QuotationsPage';
import QuotationFormPage from './pages/quotations/QuotationFormPage';
import QuotationDetailPage from './pages/quotations/QuotationDetailPage';

// Subscriptions
import SubscriptionsPage from './pages/subscriptions/SubscriptionsPage';
import SubscriptionFormPage from './pages/subscriptions/SubscriptionFormPage';
import SubscriptionDetailPage from './pages/subscriptions/SubscriptionDetailPage';

// Invoices
import InvoicesPage from './pages/invoices/InvoicesPage';
import InvoiceDetailPage from './pages/invoices/InvoiceDetailPage';

// Payments
import PaymentsPage from './pages/payments/PaymentsPage';

// Users & Settings
import UsersPage from './pages/users/UsersPage';
import SettingsPage from './pages/settings/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Guest-only routes */}
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />

            {/* Protected routes wrapped in common Dashboard layout */}
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              {/* Dashboard (Admin & Staff) */}
              <Route path="/" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <DashboardPage />
                </ProtectedRoute>
              } />

              {/* Customer Portal (Customer & Admin) */}
              <Route path="/portal" element={
                <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN']}>
                  <CustomerPortalPage />
                </ProtectedRoute>
              } />

              {/* Customers Module */}
              <Route path="/customers" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <CustomersPage />
                </ProtectedRoute>
              } />
              <Route path="/customers/:id" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              } />

              {/* Products & Variants */}
              <Route path="/products" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <ProductsPage />
                </ProtectedRoute>
              } />

              {/* Subscription Plans */}
              <Route path="/plans" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <PlansPage />
                </ProtectedRoute>
              } />

              {/* Quotations Module */}
              <Route path="/quotations" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <QuotationsPage />
                </ProtectedRoute>
              } />
              <Route path="/quotations/new" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <QuotationFormPage />
                </ProtectedRoute>
              } />
              <Route path="/quotations/:id" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <QuotationDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/quotations/:id/edit" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <QuotationFormPage />
                </ProtectedRoute>
              } />

              {/* Subscriptions Module */}
              <Route path="/subscriptions" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF', 'CUSTOMER']}>
                  <SubscriptionsPage />
                </ProtectedRoute>
              } />
              <Route path="/subscriptions/new" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF']}>
                  <SubscriptionFormPage />
                </ProtectedRoute>
              } />
              <Route path="/subscriptions/:id" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF', 'CUSTOMER']}>
                  <SubscriptionDetailPage />
                </ProtectedRoute>
              } />

              {/* Invoices Module */}
              <Route path="/invoices" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF', 'CUSTOMER']}>
                  <InvoicesPage />
                </ProtectedRoute>
              } />
              <Route path="/invoices/:id" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF', 'CUSTOMER']}>
                  <InvoiceDetailPage />
                </ProtectedRoute>
              } />

              {/* Payments Module */}
              <Route path="/payments" element={
                <ProtectedRoute allowedRoles={['ADMIN', 'STAFF', 'CUSTOMER']}>
                  <PaymentsPage />
                </ProtectedRoute>
              } />

              {/* User & Role Management (Admin only) */}
              <Route path="/users" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <UsersPage />
                </ProtectedRoute>
              } />

              {/* Settings (Admin only) */}
              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
