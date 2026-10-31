import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

// Dashboard
import DashboardPage from './pages/dashboard/DashboardPage';

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

// Settings
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

            {/* Protected routes — dashboard layout */}
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              {/* Admin + Staff */}
              <Route path="/" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <DashboardPage />
                </ProtectedRoute>
              } />

              <Route path="/customers" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <CustomersPage />
                </ProtectedRoute>
              } />
              <Route path="/customers/:id" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <CustomerDetailPage />
                </ProtectedRoute>
              } />

              <Route path="/products" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <ProductsPage />
                </ProtectedRoute>
              } />

              <Route path="/plans" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <PlansPage />
                </ProtectedRoute>
              } />

              <Route path="/quotations" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <QuotationsPage />
                </ProtectedRoute>
              } />
              <Route path="/quotations/new" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <QuotationFormPage />
                </ProtectedRoute>
              } />
              <Route path="/quotations/:id" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <QuotationDetailPage />
                </ProtectedRoute>
              } />

              <Route path="/subscriptions" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'customer']}>
                  <SubscriptionsPage />
                </ProtectedRoute>
              } />
              <Route path="/subscriptions/new" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <SubscriptionFormPage />
                </ProtectedRoute>
              } />
              <Route path="/subscriptions/:id" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'customer']}>
                  <SubscriptionDetailPage />
                </ProtectedRoute>
              } />

              <Route path="/invoices" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'customer']}>
                  <InvoicesPage />
                </ProtectedRoute>
              } />
              <Route path="/invoices/:id" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'customer']}>
                  <InvoiceDetailPage />
                </ProtectedRoute>
              } />

              <Route path="/payments" element={
                <ProtectedRoute allowedRoles={['admin', 'staff', 'customer']}>
                  <PaymentsPage />
                </ProtectedRoute>
              } />

              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={['admin']}>
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
