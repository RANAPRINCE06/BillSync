import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { quotationService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Feedback';

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '' });

  const fetchQuotation = async () => {
    setLoading(true);
    try {
      const res = await quotationService.getById(id);
      setQuotation(res.data);
    } catch {
      addToast('Failed to load quotation', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuotation(); }, [id]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm') await quotationService.confirm(id);
      else if (action === 'cancel') await quotationService.cancel(id);
      else if (action === 'convert') await quotationService.convertToSubscription(id);
      addToast(
        action === 'convert' ? 'Quotation converted to subscription' :
        `Quotation ${action}ed`, 'success'
      );
      if (action === 'convert') navigate('/subscriptions');
      else fetchQuotation();
    } catch (err) {
      const msg = err.response?.data?.detail || `Failed to ${action} quotation`;
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!quotation) return <p className="text-sm text-slate-500">Quotation not found.</p>;

  const status = quotation.status?.toLowerCase();
  const lines = quotation.lines || quotation.line_items || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Quotation {quotation.reference || quotation.number || `#${id}`}
          </h1>
          <p className="text-sm text-slate-500">{formatDate(quotation.date || quotation.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={quotation.status} />
          {status === 'draft' && (
            <>
              <Button variant="secondary" size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'cancel', label: 'Cancel Quotation' })}
                loading={actionLoading === 'cancel'}>
                Cancel
              </Button>
              <Button size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'confirm', label: 'Confirm Quotation' })}
                loading={actionLoading === 'confirm'}>
                Confirm
              </Button>
            </>
          )}
          {status === 'confirmed' || status === 'accepted' ? (
            <Button variant="success" size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'convert', label: 'Convert to Subscription' })}
              loading={actionLoading === 'convert'}>
              Convert to Subscription
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Customer', quotation.customer_name || quotation.customer?.name],
              ['Date', formatDate(quotation.date || quotation.created_at)],
              ['Status', <StatusBadge key="s" status={quotation.status} />],
              ['Notes', quotation.notes || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <div className="text-sm text-slate-700 mt-0.5">{val}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <Table>
            <TableHead>
              <Th>Item</Th>
              <Th>Type</Th>
              <Th>Qty</Th>
              <Th>Unit Price</Th>
              <Th>Subtotal</Th>
            </TableHead>
            {lines.length === 0 ? (
              <TableEmpty message="No line items" cols={5} />
            ) : (
              <TableBody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <Td>{l.item_name || l.name || '—'}</Td>
                    <Td className="capitalize">{l.type || '—'}</Td>
                    <Td>{l.quantity}</Td>
                    <Td>{formatCurrency(l.unit_price)}</Td>
                    <Td className="font-medium">{formatCurrency(l.quantity * l.unit_price)}</Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
          <div className="px-6 py-4 border-t border-slate-100 space-y-1">
            {[
              ['Subtotal', quotation.subtotal],
              ['Discount', quotation.discount ? -quotation.discount : null],
              ['Tax', quotation.tax],
            ].filter(([, v]) => v !== null && v !== undefined).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span>{formatCurrency(val)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-100">
              <span>Total</span>
              <span>{formatCurrency(quotation.total)}</span>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={`Are you sure you want to ${confirmModal.action} this quotation?`}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'cancel' ? 'danger' : confirmModal.action === 'convert' ? 'success' : 'primary'}
        loading={!!actionLoading}
      />
    </div>
  );
}

