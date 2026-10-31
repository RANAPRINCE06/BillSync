import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, Send, Printer,
  CreditCard, Building, Mail, Phone, Calendar, FileText
} from 'lucide-react';
import { invoiceService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Feedback';
import { formatCurrency } from '../../utils/quotationCalculations';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '', message: '' });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await invoiceService.getById(id);
      setInvoice(res.data);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load invoice details'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  // Auto trigger print if print=true in URL
  useEffect(() => {
    if (searchParams.get('print') === 'true' && invoice && !loading) {
      window.print();
    }
  }, [invoice, loading, searchParams]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm') await invoiceService.confirm(id);
      else if (action === 'cancel') await invoiceService.cancel(id);
      else if (action === 'send') await invoiceService.send(id);
      addToast(`Invoice successfully ${action}ed!`, 'success');
      fetchInvoice();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to ${action} invoice`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '', message: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!invoice) return <p className="text-sm text-slate-500 py-8 text-center">Invoice not found.</p>;

  const status = (invoice.status || '').toUpperCase();
  const lines = invoice.items || invoice.lines || invoice.line_items || [];
  const payments = invoice.payments || [];
  const customer = invoice.customer || {};
  const balanceDue = invoice.balance_due !== undefined
    ? invoice.balance_due
    : Math.max(0, (invoice.total || 0) - (invoice.amount_paid || 0));
  const canPay = balanceDue > 0 && status !== 'CANCELLED' && status !== 'DRAFT';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/invoices')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                Invoice {invoice.invoice_number || `INV-${invoice.id}`}
              </h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Issue Date: {formatDate(invoice.issue_date || invoice.created_at)} • Due Date: {formatDate(invoice.due_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print Invoice
          </Button>

          {canPay && (
            <Button
              variant="success"
              size="sm"
              onClick={() => setPaymentModalOpen(true)}
            >
              <CreditCard className="w-3.5 h-3.5" /> Record Payment
            </Button>
          )}

          {status === 'DRAFT' && (
            <>
              <Button
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'confirm',
                    label: 'Confirm Invoice',
                    message: 'Confirm this draft invoice and mark it as officially issued?',
                  })
                }
                loading={actionLoading === 'confirm'}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Confirm
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'cancel',
                    label: 'Cancel Invoice',
                    message: 'Are you sure you want to cancel this draft invoice?',
                  })
                }
                loading={actionLoading === 'cancel'}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            </>
          )}

          {(status === 'CONFIRMED' || status === 'SENT' || status === 'PARTIALLY_PAID') && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'send',
                    label: 'Send Invoice Email',
                    message: `Deliver invoice ${invoice.invoice_number} to ${invoice.customer_name || 'customer'}?`,
                  })
                }
                loading={actionLoading === 'send'}
              >
                <Send className="w-3.5 h-3.5" /> Send Invoice
              </Button>

              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'cancel',
                    label: 'Cancel Invoice',
                    message: 'Are you sure you want to cancel this issued invoice? Outstanding balance will be cleared.',
                  })
                }
                loading={actionLoading === 'cancel'}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Invoice Card (Print-optimized preview) */}
      <Card className="print:border-0 print:shadow-none p-2 sm:p-4">
        {/* Invoice Header Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Billed To</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {invoice.customer_name || customer.name || 'Client'}
            </h3>
            {(invoice.company || customer.company) && (
              <p className="text-xs text-slate-600 mt-0.5">{invoice.company || customer.company}</p>
            )}
            {(invoice.customer_email || customer.email) && (
              <p className="text-xs text-slate-500 mt-0.5">{invoice.customer_email || customer.email}</p>
            )}
            {customer.address && (
              <p className="text-xs text-slate-500 mt-1 max-w-sm whitespace-pre-line leading-relaxed">
                {customer.address}
              </p>
            )}
          </div>

          <div className="md:text-right space-y-1.5 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Invoice Number</span>
              <span className="text-sm font-bold font-mono text-slate-900">
                {invoice.invoice_number || `INV-${invoice.id}`}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Subscription Reference: </span>
              <span className="font-mono font-medium text-blue-700">
                {invoice.subscription_id ? `#${invoice.subscription_id}` : 'Direct Sale'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Issue Date: </span>
              <span className="font-medium text-slate-800">{formatDate(invoice.issue_date || invoice.created_at)}</span>
            </div>
            <div>
              <span className="text-slate-400">Payment Due Date: </span>
              <span className="font-bold text-red-600">{formatDate(invoice.due_date)}</span>
            </div>
          </div>
        </div>

        {/* Product Line Offerings */}
        <div className="py-6">
          <Table>
            <TableHead>
              <Th>Item Description</Th>
              <Th className="text-center">Quantity</Th>
              <Th className="text-right">Unit Price</Th>
              <Th className="text-center">Tax (%)</Th>
              <Th className="text-right">Line Total</Th>
            </TableHead>
            <TableBody>
              {lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{line.description || line.product_name || 'Billed Line Item'}</Td>
                  <Td className="text-center">{line.quantity}</Td>
                  <Td className="text-right">{formatCurrency(line.unit_price)}</Td>
                  <Td className="text-center">{line.tax_rate ?? 18}%</Td>
                  <Td className="text-right font-semibold text-slate-900">
                    {formatCurrency(line.line_total || line.quantity * line.unit_price)}
                  </Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Financial Summary Breakdown */}
        <div className="border-t border-slate-200 pt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Gross Subtotal:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount Applied:</span>
                <span>-{formatCurrency(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Taxes (GST 18%):</span>
              <span className="font-semibold text-slate-800">{formatCurrency(invoice.tax_amount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
              <span>Invoice Total:</span>
              <span>{formatCurrency(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-xs text-emerald-700 font-medium">
              <span>Amount Paid:</span>
              <span>{formatCurrency(invoice.amount_paid || 0)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-red-600">
              <span>Outstanding Balance:</span>
              <span>{formatCurrency(balanceDue)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Payment History Recorded on this Invoice */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Payment History for this Invoice</CardTitle>
        </CardHeader>
        {payments.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No payments have been recorded for this invoice yet.
          </div>
        ) : (
          <Table>
            <TableHead>
              <Th>Payment Ref</Th>
              <Th>Date</Th>
              <Th>Method</Th>
              <Th>Amount Paid</Th>
              <Th>Status</Th>
              <Th>Notes</Th>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs font-semibold text-slate-800">{p.payment_reference || `#${p.id}`}</Td>
                  <Td>{formatDate(p.payment_date)}</Td>
                  <Td>
                    <StatusBadge status={p.payment_method} />
                  </Td>
                  <Td className="font-bold text-emerald-700">{formatCurrency(p.amount)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td className="text-xs text-slate-500">{p.notes || '—'}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <RecordPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSaved={() => {
            setPaymentModalOpen(false);
            fetchInvoice();
            addToast('Payment recorded successfully!', 'success');
          }}
          preselectedInvoice={invoice}
          invoices={[invoice]}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '', message: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={confirmModal.message}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'cancel' ? 'danger' : 'primary'}
        loading={Boolean(actionLoading)}
      />
    </div>
  );
}