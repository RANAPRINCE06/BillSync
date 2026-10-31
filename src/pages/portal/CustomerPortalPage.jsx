import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Repeat, Receipt, CheckCircle, Clock,
  Printer, ArrowUpRight, ShieldCheck, Download,
  Building, Mail, Phone, MapPin, Eye, X
} from 'lucide-react';
import { subscriptionService, invoiceService, paymentService, customerService } from '../../services';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge, Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Feedback';
import { formatCurrency } from '../../utils/quotationCalculations';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [customerProfile, setCustomerProfile] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals for portal self-service inspection
  const [viewSub, setViewSub] = useState(null);
  const [viewInv, setViewInv] = useState(null);

  useEffect(() => {
    const fetchPortalData = async () => {
      setLoading(true);
      try {
        const [custRes, subsRes, invRes, payRes] = await Promise.all([
          customerService.getAll(),
          subscriptionService.getAll(),
          invoiceService.getAll(),
          paymentService.getAll(),
        ]);

        const allCustomers = Array.isArray(custRes.data) ? custRes.data : custRes.data?.items || [];
        const allSubs = Array.isArray(subsRes.data) ? subsRes.data : subsRes.data?.items || [];
        const allInvs = Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || [];
        const allPays = Array.isArray(payRes.data) ? payRes.data : payRes.data?.items || [];

        // Identify the matching customer profile strictly for this user
        const userEmail = (user?.email || '').toLowerCase();
        let myCustomer = allCustomers.find(
          (c) =>
            (c.email && c.email.toLowerCase() === userEmail) ||
            (userEmail === 'customer@billsync.com' && c.id === 'cust-001') ||
            (user?.name && c.name.toLowerCase().includes(user.name.toLowerCase()))
        );

        if (!myCustomer && allCustomers.length > 0) {
          myCustomer = allCustomers[0];
        }

        setCustomerProfile(myCustomer);

        if (myCustomer) {
          const custId = String(myCustomer.id);
          // Strictly isolate records to only this customer's account
          const mySubs = allSubs.filter((s) => String(s.customer_id) === custId);
          const myInvs = allInvs.filter((i) => String(i.customer_id) === custId);
          const myInvIds = new Set(myInvs.map((i) => String(i.id)));
          const myPays = allPays.filter(
            (p) => String(p.customer_id) === custId || (p.invoice_id && myInvIds.has(String(p.invoice_id)))
          );

          setSubscriptions(mySubs);
          setInvoices(myInvs);
          setPayments(myPays);
        }
      } catch {
        addToast('Failed to load customer portal details', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchPortalData();
  }, [user]);

  if (loading) return <PageSpinner />;

  const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');
  const outstandingInvoices = invoices.filter((i) => (i.balance_due || 0) > 0 && i.status !== 'CANCELLED');
  const totalBalanceDue = outstandingInvoices.reduce(
    (sum, i) => sum + Number(i.balance_due ?? (i.total || 0) - (i.amount_paid || 0)),
    0
  );
  const overdueBalance = invoices
    .filter((i) => i.status === 'OVERDUE' && (i.balance_due || 0) > 0)
    .reduce((sum, i) => sum + Number(i.balance_due || 0), 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-xs mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Customer Self-Service Portal
          </span>
          <h1 className="text-2xl font-bold">
            Welcome, {customerProfile?.name || user?.name || 'Valued Client'}
          </h1>
          <p className="text-blue-100 text-xs sm:text-sm mt-0.5">
            {customerProfile?.company ? `${customerProfile.company} • ` : ''}Client ID: {customerProfile?.id || 'CUST-001'}
          </p>
        </div>

        <div className="bg-white/10 rounded-xl p-4 border border-white/20 backdrop-blur-xs text-right min-w-[220px]">
          <p className="text-xs text-blue-200 uppercase font-semibold">Total Outstanding Balance</p>
          <p className="text-2xl font-bold mt-0.5">{formatCurrency(totalBalanceDue)}</p>
          {overdueBalance > 0 && (
            <p className="text-[11px] text-amber-200 font-medium mt-1">
              Includes {formatCurrency(overdueBalance)} overdue
            </p>
          )}
        </div>
      </div>

      {/* Customer Profile & Account Details Card */}
      {customerProfile && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <CardTitle>My Account Profile</CardTitle>
            </div>
            <Badge label="Registered Customer" variant="info" />
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block uppercase font-medium">Customer Name</span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">{customerProfile.name}</p>
            </div>

            <div>
              <span className="text-slate-400 block uppercase font-medium">Organization / Company</span>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {customerProfile.company || 'Individual Client'}
              </p>
            </div>

            <div>
              <span className="text-slate-400 block uppercase font-medium">Contact Email</span>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{customerProfile.email}</p>
            </div>

            <div>
              <span className="text-slate-400 block uppercase font-medium">Phone Number</span>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{customerProfile.phone || '—'}</p>
            </div>

            {customerProfile.address && (
              <div className="lg:col-span-4 border-t border-slate-100 pt-3">
                <span className="text-slate-400 block uppercase font-medium">Billing & Delivery Address</span>
                <p className="text-slate-700 mt-0.5 leading-relaxed">{customerProfile.address}</p>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* My Subscriptions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-blue-600" />
            <CardTitle>My Subscription Agreements ({subscriptions.length})</CardTitle>
          </div>
        </CardHeader>
        <Table>
          <TableHead>
            <Th>Subscription #</Th>
            <Th>Plan Tier</Th>
            <Th>Billing Interval</Th>
            <Th>Start Date</Th>
            <Th>Next Renewal</Th>
            <Th>Recurring Charge</Th>
            <Th>Status</Th>
            <Th className="text-right">Action</Th>
          </TableHead>
          {subscriptions.length === 0 ? (
            <TableEmpty message="You have no active or historical subscriptions on record." cols={8} />
          ) : (
            <TableBody>
              {subscriptions.map((sub) => {
                const total =
                  sub.total_amount ??
                  sub.total ??
                  (sub.items || []).reduce((acc, it) => acc + (it.line_total || it.quantity * it.unit_price || 0), 0);
                return (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      {sub.subscription_number || `#${sub.id}`}
                    </Td>
                    <Td className="font-semibold text-slate-800">{sub.plan_name || 'Service Plan'}</Td>
                    <Td>
                      <StatusBadge status={sub.billing_interval || 'MONTHLY'} />
                    </Td>
                    <Td>{formatDate(sub.start_date)}</Td>
                    <Td className="font-medium text-blue-700">{formatDate(sub.next_billing_date)}</Td>
                    <Td className="font-bold text-slate-900">{formatCurrency(total)}</Td>
                    <Td>
                      <StatusBadge status={sub.status} />
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => setViewSub(sub)}>
                          <Eye className="w-3.5 h-3.5" /> View Details
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>

      {/* Invoices & Payments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <CardTitle>My Invoices & Statements ({invoices.length})</CardTitle>
            </div>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Invoice #</Th>
              <Th>Due Date</Th>
              <Th>Total</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </TableHead>
            {invoices.length === 0 ? (
              <TableEmpty message="No invoices issued for your account." cols={6} />
            ) : (
              <TableBody>
                {invoices.map((inv) => {
                  const bal = inv.balance_due !== undefined
                    ? inv.balance_due
                    : Math.max(0, (inv.total || 0) - (inv.amount_paid || 0));
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <Td className="font-mono text-xs font-semibold text-slate-900">
                        {inv.invoice_number || `INV-${inv.id}`}
                      </Td>
                      <Td>{formatDate(inv.due_date)}</Td>
                      <Td className="font-medium text-slate-900">{formatCurrency(inv.total)}</Td>
                      <Td className={bal > 0 ? 'text-red-600 font-bold' : 'text-slate-500'}>
                        {formatCurrency(bal)}
                      </Td>
                      <Td>
                        <StatusBadge status={inv.status} />
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          <IconButton
                            icon={Eye}
                            label="Inspect invoice"
                            onClick={() => setViewInv(inv)}
                            className="text-slate-500 hover:text-blue-600"
                          />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </TableBody>
            )}
          </Table>
        </Card>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <CardTitle>Payment History & Receipts ({payments.length})</CardTitle>
            </div>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Receipt Ref #</Th>
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Method</Th>
              <Th>Amount</Th>
            </TableHead>
            {payments.length === 0 ? (
              <TableEmpty message="No payment transactions logged." cols={5} />
            ) : (
              <TableBody>
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      {p.payment_reference || `#${p.id}`}
                    </Td>
                    <Td className="font-mono text-xs text-blue-700">{p.invoice_number || '—'}</Td>
                    <Td>{formatDate(p.payment_date || p.created_at)}</Td>
                    <Td>
                      <StatusBadge status={p.payment_method} />
                    </Td>
                    <Td className="font-bold text-emerald-700">{formatCurrency(p.amount)}</Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      {/* Subscription Details Modal */}
      <Modal
        isOpen={Boolean(viewSub)}
        onClose={() => setViewSub(null)}
        title={`Subscription Agreement ${viewSub?.subscription_number || ''}`}
        size="md"
      >
        {viewSub && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block uppercase font-medium">Plan Tier</span>
                <p className="font-bold text-slate-900 mt-0.5">{viewSub.plan_name}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Agreement Status</span>
                <div className="mt-0.5">
                  <StatusBadge status={viewSub.status} />
                </div>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Start Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDate(viewSub.start_date)}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Next Renewal</span>
                <p className="font-bold text-blue-700 mt-0.5">{formatDate(viewSub.next_billing_date)}</p>
              </div>
            </div>

            {viewSub.items && viewSub.items.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-800 block uppercase">Provisioned Product Line Items</span>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                  {viewSub.items.map((it, idx) => (
                    <div key={idx} className="p-2.5 flex justify-between items-center bg-white">
                      <div>
                        <span className="font-semibold text-slate-900 block">{it.product_name || it.name}</span>
                        <span className="text-[11px] text-slate-400">
                          {formatCurrency(it.unit_price)} × {it.quantity} unit(s)
                        </span>
                      </div>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(it.line_total || it.quantity * it.unit_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setViewSub(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invoice Details Modal */}
      <Modal
        isOpen={Boolean(viewInv)}
        onClose={() => setViewInv(null)}
        title={`Invoice Statement ${viewInv?.invoice_number || ''}`}
        size="md"
      >
        {viewInv && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block uppercase font-medium">Invoice Number</span>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{viewInv.invoice_number}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Payment Status</span>
                <div className="mt-0.5">
                  <StatusBadge status={viewInv.status} />
                </div>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Issue Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDate(viewInv.issue_date || viewInv.created_at)}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Payment Due Date</span>
                <p className="font-bold text-red-600 mt-0.5">{formatDate(viewInv.due_date)}</p>
              </div>
            </div>

            {/* Financial Totals Breakdown */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(viewInv.subtotal)}</span>
              </div>
              {Number(viewInv.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-{formatCurrency(viewInv.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Taxes:</span>
                <span className="font-semibold text-slate-800">{formatCurrency(viewInv.tax_amount)}</span>
              </div>
              <div className="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-slate-900 text-sm">
                <span>Total Amount:</span>
                <span>{formatCurrency(viewInv.total)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Amount Paid:</span>
                <span>{formatCurrency(viewInv.amount_paid || 0)}</span>
              </div>
              <div className="border-t border-slate-100 pt-1.5 flex justify-between font-bold text-red-600 text-sm">
                <span>Outstanding Balance:</span>
                <span>
                  {formatCurrency(
                    viewInv.balance_due !== undefined
                      ? viewInv.balance_due
                      : Math.max(0, (viewInv.total || 0) - (viewInv.amount_paid || 0))
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const exportDoc = {
                    invoice_number: viewInv.invoice_number,
                    customer: customerProfile?.name,
                    due_date: viewInv.due_date,
                    total: viewInv.total,
                    amount_paid: viewInv.amount_paid,
                    balance_due: viewInv.balance_due,
                  };
                  const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${viewInv.invoice_number}.json`;
                  a.click();
                  URL.revokeObjectURL(a);
                  addToast('Invoice statement downloaded', 'success');
                }}
              >
                <Download className="w-3.5 h-3.5" /> Download Invoice
              </Button>
              <Button variant="secondary" onClick={() => setViewInv(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}