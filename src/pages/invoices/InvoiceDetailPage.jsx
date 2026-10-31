import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Send, Printer } from 'lucide-react';
import { invoiceService } from '../../services';
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
    } catch {
      addToast('Failed to load invoice', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoice(); }, [id]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm') await invoiceService.confirm(id);
      else if (action === 'cancel') await invoiceService.cancel(id);
      else if (action === 'send') await invoiceService.send(id);
      addToast(`Invoice ${action}ed`, 'success');
      fetchInvoice();
    } catch (err) {
      const msg = err.response?.data?.detail || `Failed to ${action} invoice`;
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!invoice) return <p className="text-sm text-slate-500">Invoice not found.</p>;

  const status = invoice.status?.toLowerCase();
  const lines = invoice.lines || invoice.line_items || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Invoice {invoice.invoice_number || invoice.number || `#${id}`}
          </h1>
          <p className="text-sm text-slate-500">{invoice.customer_name || invoice.customer?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print
          </Button>
          {status === 'draft' && (
            <>
              <Button variant="primary" size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'confirm', label: 'Confirm Invoice' })}
                loading={actionLoading === 'confirm'}>
                <CheckCircle className="w-4 h-4" /> Confirm
              </Button>
              <Button variant="danger" size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'cancel', label: 'Cancel Invoice' })}
                loading={actionLoading === 'cancel'}>
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </>
          )}
          {status === 'confirmed' && (
            <Button variant="secondary" size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'send', label: 'Send Invoice' })}
              loading={actionLoading === 'send'}>
              <Send className="w-4 h-4" /> Send
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Invoice Info</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Invoice #', invoice.invoice_number || invoice.number],
              ['Customer', invoice.customer_name || invoice.customer?.name],
              ['Date', formatDate(invoice.date || invoice.invoice_date)],
              ['Due Date', formatDate(invoice.due_date)],
              ['Status', <StatusBadge key="s" status={invoice.status} />],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <div className="text-sm text-slate-700 mt-0.5">{val || '—'}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <Table>
            <TableHead>
              <Th>Description</Th>
              <Th>Qty</Th>
              <Th>Unit Price</Th>
              <Th>Discount</Th>
              <Th>Tax</Th>
              <Th>Total</Th>
            </TableHead>
            {lines.length === 0 ? (
              <TableEmpty message="No line items" cols={6} />
            ) : (
              <TableBody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <Td>{l.description || l.product_name || l.name || '—'}</Td>
                    <Td>{l.quantity}</Td>
                    <Td>{formatCurrency(l.unit_price)}</Td>
                    <Td>{formatCurrency(l.discount)}</Td>
                    <Td>{formatCurrency(l.tax)}</Td>
                    <Td className="font-medium">{formatCurrency(l.total || l.subtotal)}</Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
          <div className="px-6 py-4 border-t border-slate-100 space-y-1.5">
            {[
              ['Subtotal', invoice.subtotal],
              ['Discount', invoice.discount ? -invoice.discount : null],
              ['Tax', invoice.tax],
            ].filter(([, v]) => v !== null && v !== undefined).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span>{formatCurrency(val)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.amount_paid !== undefined && (
              <>
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-red-600">
                  <span>Outstanding</span>
                  <span>{formatCurrency((invoice.total || 0) - (invoice.amount_paid || 0))}</span>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={`Are you sure you want to ${confirmModal.action} this invoice?`}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'cancel' ? 'danger' : 'primary'}
        loading={!!actionLoading}
      />
    </div>
  );
}

