import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, Repeat, Receipt, CheckCircle, Clock,
  Printer, ArrowUpRight, ShieldCheck, Download
} from 'lucide-react';
import { subscriptionService, invoiceService, paymentService } from '../../services';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Feedback';

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerPortalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPortalData = async () => {
      setLoading(true);
      try {
        const [subsRes, invRes, payRes] = await Promise.all([
          subscriptionService.getAll(),
          invoiceService.getAll(),
          paymentService.getAll(),
        ]);
        setSubscriptions(Array.isArray(subsRes.data) ? subsRes.data : subsRes.data?.items || []);
        setInvoices(Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || []);
        setPayments(Array.isArray(payRes.data) ? payRes.data : payRes.data?.items || []);
      } catch {
        addToast('Failed to load customer portal details', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchPortalData();
  }, []);

  if (loading) return <PageSpinner />;

  const activeSub = subscriptions.find((s) => s.status === 'ACTIVE') || subscriptions[0];
  const outstandingInvoices = invoices.filter((i) => i.balance_due > 0 && i.status !== 'CANCELLED');
  const totalDue = outstandingInvoices.reduce((sum, i) => sum + Number(i.balance_due || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-xs mb-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Customer Self-Service Portal
          </span>
          <h1 className="text-2xl font-bold">Welcome, {user?.name || 'Valued Client'}</h1>
          <p className="text-blue-100 text-sm mt-0.5">Manage your active plans, invoices, and service subscriptions.</p>
        </div>
        <div className="bg-white/10 rounded-xl p-4 border border-white/20 backdrop-blur-xs text-right min-w-[200px]">
          <p className="text-xs text-blue-200 uppercase font-semibold">Total Balance Due</p>
          <p className="text-2xl font-bold mt-0.5">{formatCurrency(totalDue)}</p>
          {totalDue > 0 && (
            <Button
              size="sm"
              className="mt-2 w-full bg-white text-blue-800 hover:bg-blue-50 border-white text-xs font-semibold"
              onClick={() => navigate('/payments')}
            >
              Pay Now
            </Button>
          )}
        </div>
      </div>

      {/* Active Subscription Overview Card */}
      {activeSub && (
        <Card className="border-blue-100 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Repeat className="w-5 h-5 text-blue-600" />
              <CardTitle>Current Active Subscription Agreement</CardTitle>
            </div>
            <StatusBadge status={activeSub.status} />
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 mb-4">
              <div>
                <p className="text-xs text-slate-500 font-medium">Subscription #</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{activeSub.subscription_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Plan Tier</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">{activeSub.plan_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Billing Interval</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 capitalize">{activeSub.billing_interval?.toLowerCase()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Next Renewal</p>
                <p className="text-sm font-semibold text-blue-700 mt-0.5">{formatDate(activeSub.next_billing_date)}</p>
              </div>
            </div>

            {activeSub.items && activeSub.items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Included Products & Services</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeSub.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded-lg border border-slate-200 bg-white">
                      <span className="font-medium text-slate-800">{item.product_name}</span>
                      <span className="text-slate-500 font-semibold">{formatCurrency(item.unit_price)} x {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Invoices & Receipts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-slate-600" />
              <CardTitle>Invoices & Billing History</CardTitle>
            </div>
            <button
              onClick={() => navigate('/invoices')}
              className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
            >
              All Invoices <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Invoice #</Th>
              <Th>Due Date</Th>
              <Th>Total</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
            </TableHead>
            {invoices.length === 0 ? (
              <TableEmpty message="No invoices issued yet." cols={5} />
            ) : (
              <TableBody>
                {invoices.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">{inv.invoice_number}</Td>
                    <Td>{formatDate(inv.due_date)}</Td>
                    <Td className="font-medium">{formatCurrency(inv.total)}</Td>
                    <Td className={inv.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                      {formatCurrency(inv.balance_due)}
                    </Td>
                    <Td><StatusBadge status={inv.status} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>

        {/* Payments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <CardTitle>Confirmed Payment Receipts</CardTitle>
            </div>
            <button
              onClick={() => navigate('/payments')}
              className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
            >
              All Receipts <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
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
                {payments.slice(0, 5).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">{p.payment_reference}</Td>
                    <Td className="font-mono text-xs">{p.invoice_number}</Td>
                    <Td>{formatDate(p.payment_date)}</Td>
                    <Td className="capitalize font-medium text-slate-600">{p.payment_method?.replace(/_/g, ' ')}</Td>
                    <Td className="font-semibold text-emerald-700">{formatCurrency(p.amount)}</Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>
    </div>
  );
}

