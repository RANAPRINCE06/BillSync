import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Repeat, FileText, Receipt,
  CreditCard, Building, Mail, Phone, MapPin, StickyNote
} from 'lucide-react';
import { customerService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Feedback';
import { CustomerFormModal } from './CustomerFormModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [customer, setCustomer] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState('subscriptions');
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, subsRes, qtRes, invRes, payRes] = await Promise.all([
        customerService.getById(id),
        customerService.getSubscriptions(id).catch(() => ({ data: [] })),
        customerService.getQuotations ? customerService.getQuotations(id).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        customerService.getInvoices(id).catch(() => ({ data: [] })),
        customerService.getPayments ? customerService.getPayments(id).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setCustomer(custRes.data);
      setSubscriptions(Array.isArray(subsRes.data) ? subsRes.data : subsRes.data?.items || []);
      setQuotations(Array.isArray(qtRes.data) ? qtRes.data : qtRes.data?.items || []);
      setInvoices(Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || []);
      setPayments(Array.isArray(payRes.data) ? payRes.data : payRes.data?.items || []);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load customer details'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) return <PageSpinner />;
  if (!customer) return <p className="text-sm text-slate-500 py-8 text-center">Customer not found.</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/customers')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
          <p className="text-sm text-slate-500">
            {customer.company ? `${customer.company} • ` : ''}Customer ID: {customer.id}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4" /> Edit Customer
        </Button>
      </div>

      {/* Customer Information Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
          <span className="text-xs text-slate-400">Created: {formatDate(customer.created_at)}</span>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div className="flex items-start gap-2.5">
            <Building className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Company</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{customer.company || 'Individual Client'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Email</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{customer.email}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Phone</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{customer.phone || '—'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 lg:col-span-2">
            <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Address</p>
              <p className="text-sm text-slate-700 mt-0.5">{customer.address || customer.billing_address || '—'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 lg:col-span-3 border-t border-slate-100 pt-3">
            <StickyNote className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Notes</p>
              <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-line">{customer.notes || 'No customer notes recorded.'}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Navigation Tabs for Subscriptions, Quotations, Invoices, Payments */}
      <div className="border-b border-slate-200 mb-4 flex gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'subscriptions'
              ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Repeat className="w-4 h-4" />
          Subscriptions ({subscriptions.length})
        </button>

        <button
          onClick={() => setActiveTab('quotations')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'quotations'
              ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          Quotations ({quotations.length})
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'invoices'
              ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Invoices ({invoices.length})
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'payments'
              ? 'text-blue-600 font-semibold border-b-2 border-blue-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Payment History ({payments.length})
        </button>
      </div>

      {/* Tab 1: Subscriptions */}
      {activeTab === 'subscriptions' && (
        <Card>
          <Table>
            <TableHead>
              <Th>Subscription #</Th>
              <Th>Plan</Th>
              <Th>Start Date</Th>
              <Th>Next Billing</Th>
              <Th>Status</Th>
            </TableHead>
            {subscriptions.length === 0 ? (
              <TableEmpty message="No subscriptions active or past for this customer" cols={5} />
            ) : (
              <TableBody>
                {subscriptions.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/subscriptions/${s.id}`)}
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-900">{s.subscription_number || `#${s.id}`}</Td>
                    <Td className="font-medium text-slate-800">{s.plan_name || s.plan?.name || '—'}</Td>
                    <Td>{formatDate(s.start_date)}</Td>
                    <Td>{formatDate(s.next_billing_date)}</Td>
                    <Td><StatusBadge status={s.status} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      )}

      {/* Tab 2: Quotations */}
      {activeTab === 'quotations' && (
        <Card>
          <Table>
            <TableHead>
              <Th>Quotation #</Th>
              <Th>Date</Th>
              <Th>Valid Until</Th>
              <Th>Subtotal</Th>
              <Th>Total Estimate</Th>
              <Th>Status</Th>
            </TableHead>
            {quotations.length === 0 ? (
              <TableEmpty message="No quotations issued for this customer" cols={6} />
            ) : (
              <TableBody>
                {quotations.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/quotations/${q.id}`)}
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-900">{q.quotation_number || `QT-${q.id}`}</Td>
                    <Td>{formatDate(q.created_at || q.date)}</Td>
                    <Td>{formatDate(q.valid_until)}</Td>
                    <Td>{formatCurrency(q.subtotal)}</Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(q.total)}</Td>
                    <Td><StatusBadge status={q.status} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      )}

      {/* Tab 3: Invoices */}
      {activeTab === 'invoices' && (
        <Card>
          <Table>
            <TableHead>
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Due Date</Th>
              <Th>Total</Th>
              <Th>Balance Due</Th>
              <Th>Status</Th>
            </TableHead>
            {invoices.length === 0 ? (
              <TableEmpty message="No invoices generated for this customer" cols={6} />
            ) : (
              <TableBody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-900">{inv.invoice_number || inv.number}</Td>
                    <Td>{formatDate(inv.issue_date || inv.date || inv.invoice_date)}</Td>
                    <Td>{formatDate(inv.due_date)}</Td>
                    <Td className="font-medium">{formatCurrency(inv.total)}</Td>
                    <Td className={inv.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                      {formatCurrency(inv.balance_due ?? (inv.total - (inv.amount_paid || 0)))}
                    </Td>
                    <Td><StatusBadge status={inv.status} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      )}

      {/* Tab 4: Payments */}
      {activeTab === 'payments' && (
        <Card>
          <Table>
            <TableHead>
              <Th>Payment Ref #</Th>
              <Th>Invoice #</Th>
              <Th>Date</Th>
              <Th>Payment Method</Th>
              <Th>Amount Paid</Th>
              <Th>Status</Th>
            </TableHead>
            {payments.length === 0 ? (
              <TableEmpty message="No payment transactions logged for this customer" cols={6} />
            ) : (
              <TableBody>
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">{p.payment_reference || `PAY-${p.id}`}</Td>
                    <Td className="font-mono text-xs">{p.invoice_number}</Td>
                    <Td>{formatDate(p.payment_date || p.created_at)}</Td>
                    <Td className="capitalize font-medium text-slate-600">{(p.payment_method || '').replace(/_/g, ' ')}</Td>
                    <Td className="font-semibold text-emerald-700">{formatCurrency(p.amount)}</Td>
                    <Td><StatusBadge status={p.status || 'SUCCESSFUL'} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      )}

      <CustomerFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          fetchData();
          addToast('Customer profile updated', 'success');
        }}
        customer={customer}
      />
    </div>
  );
}
