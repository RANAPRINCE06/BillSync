import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Send, Printer } from 'lucide-react';
import { invoiceService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Feedback';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '' });

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

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm') await invoiceService.confirm(id);
      else if (action === 'cancel') await invoiceService.cancel(id);
      else if (action === 'send') await invoiceService.send(id);
      addToast(`Invoice successfully ${action}ed`, 'success');
      fetchInvoice();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to ${action} invoice`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!invoice) return <p className="text-sm text-slate-500 py-8 text-center">Invoice not found.</p>;

  const status = (invoice.status || '').toUpperCase();
  const lines = invoice.items || invoice.lines || invoice.line_items || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Invoice {invoice.invoice_number || invoice.number || `#${id}`}
          </h1>
          <p className="text-sm text-slate-500">
            Issued to {invoice.customer_name || invoice.customer?.name || 'Customer'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />

          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print
          </Button>

          {status === 'DRAFT' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'confirm', label: 'Confirm Invoice' })}
                loading={actionLoading === 'confirm'}
              >
                <CheckCircle className="w-4 h-4" /> Confirm
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'cancel', label: 'Cancel Invoice' })}
                loading={actionLoading === 'cancel'}
              >
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </>
          )}

          {(status === 'CONFIRMED' || status === 'SENT') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'send', label: 'Send Invoice to Customer' })}
              loading={actionLoading === 'send'}
            >
              <Send className="w-4 h-4" /> Send Email
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Invoice #', invoice.invoice_number || invoice.number],
              ['Customer', invoice.customer_name || invoice.customer?.name || '—'],
              ['Issue Date', formatDate(invoice.issue_date || invoice.date || invoice.created_at)],
              ['Due Date', formatDate(invoice.due_date)],
              ['Billing Period', invoice.billing_period_start ? `${formatDate(invoice.billing_period_start)} - ${formatDate(invoice.billing_period_end)}` : '—'],
              ['Status', <StatusBadge key="s" status={invoice.status} />],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-slate-400 font-medium">{label}</p>
                <div className="text-sm text-slate-700 mt-0.5">{val}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Billed Items</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Description</Th>
              <Th>Quantity</Th>
              <Th>Unit Price</Th>
              <Th>Tax</Th>
              <Th className="text-right">Total</Th>
            </TableHead>
            {lines.length === 0 ? (
              <TableEmpty message="No item lines recorded for this invoice" cols={5} />
            ) : (
              <TableBody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <Td className="font-medium text-slate-900">{l.description || l.product_name || l.product?.name || 'Charge Item'}</Td>
                    <Td>{l.quantity}</Td>
                    <Td>{formatCurrency(l.unit_price)}</Td>
                    <Td>{l.tax_rate ?? 0}%</Td>
                    <Td className="text-right font-semibold text-slate-900">
                      {formatCurrency(l.line_total ?? l.total ?? l.quantity * l.unit_price)}
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>

          <div className="px-6 py-4 border-t border-slate-100 space-y-1.5 bg-slate-50/50">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-800">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-{formatCurrency(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tax</span>
              <span className="text-slate-800">+{formatCurrency(invoice.tax_amount ?? invoice.tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
              <span className="text-slate-900">Total Billed</span>
              <span className="text-blue-700">{formatCurrency(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Amount Paid</span>
              <span className="font-semibold">{formatCurrency(invoice.amount_paid || 0)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-red-600">
              <span>Balance Due</span>
              <span>
                {formatCurrency(
                  invoice.balance_due !== undefined
                    ? invoice.balance_due
                    : (invoice.total || 0) - (invoice.amount_paid || 0)
                )}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={`Are you sure you want to perform '${confirmModal.label}' on this invoice?`}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'cancel' ? 'danger' : 'primary'}
        loading={!!actionLoading}
      />
    </div>
  );
}
