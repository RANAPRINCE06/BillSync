import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Repeat, XCircle } from 'lucide-react';
import { quotationService } from '../../services';
import { getErrorMessage } from '../../services/api';
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
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load quotation details'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotation();
  }, [id]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm' || action === 'accept') {
        await (quotationService.confirm ? quotationService.confirm(id) : quotationService.update(id, { status: 'ACCEPTED' }));
        addToast('Quotation accepted', 'success');
      } else if (action === 'cancel' || action === 'reject') {
        await (quotationService.cancel ? quotationService.cancel(id) : quotationService.update(id, { status: 'REJECTED' }));
        addToast('Quotation cancelled', 'info');
      } else if (action === 'convert') {
        await quotationService.convertToSubscription(id);
        addToast('Quotation successfully converted to active subscription!', 'success');
        navigate('/subscriptions');
        return;
      }
      fetchQuotation();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to execute ${action}`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!quotation) return <p className="text-sm text-slate-500 py-8 text-center">Quotation not found.</p>;

  const status = (quotation.status || '').toUpperCase();
  const lines = quotation.items || quotation.lines || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/quotations')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Quotation {quotation.quotation_number || quotation.reference || `#${id}`}
          </h1>
          <p className="text-sm text-slate-500">
            Created on {formatDate(quotation.created_at || quotation.date)} • Valid until {formatDate(quotation.valid_until)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={quotation.status} />

          {status === 'DRAFT' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'cancel', label: 'Reject Quotation' })}
                loading={actionLoading === 'cancel'}
              >
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'accept', label: 'Accept Quotation' })}
                loading={actionLoading === 'accept'}
              >
                <CheckCircle className="w-4 h-4" /> Accept
              </Button>
            </>
          )}

          {(status === 'ACCEPTED' || status === 'CONFIRMED' || status === 'SENT') && (
            <Button
              variant="success"
              size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'convert', label: 'Convert to Subscription' })}
              loading={actionLoading === 'convert'}
            >
              <Repeat className="w-4 h-4" /> Convert to Subscription
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer & Terms</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Customer', quotation.customer_name || quotation.customer?.name || '—'],
              ['Contact Email', quotation.customer_email || quotation.customer?.email || '—'],
              ['Status', <StatusBadge key="s" status={quotation.status} />],
              ['Valid Until', formatDate(quotation.valid_until)],
              ['Notes', quotation.notes || '—'],
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
            <CardTitle>Quotation Items</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Item Description</Th>
              <Th>Quantity</Th>
              <Th>Unit Price</Th>
              <Th>Tax Rate</Th>
              <Th className="text-right">Line Total</Th>
            </TableHead>
            {lines.length === 0 ? (
              <TableEmpty message="No line items listed on this quotation" cols={5} />
            ) : (
              <TableBody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <Td className="font-medium text-slate-900">{l.product_name || l.product?.name || l.name || 'Product Item'}</Td>
                    <Td>{l.quantity}</Td>
                    <Td>{formatCurrency(l.unit_price)}</Td>
                    <Td>{l.tax_rate ?? 0}%</Td>
                    <Td className="text-right font-semibold text-slate-900">
                      {formatCurrency(l.line_total ?? l.quantity * l.unit_price)}
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>

          <div className="px-6 py-4 border-t border-slate-100 space-y-1.5 bg-slate-50/50">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-800">{formatCurrency(quotation.subtotal)}</span>
            </div>
            {quotation.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-{formatCurrency(quotation.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tax</span>
              <span className="text-slate-800">+{formatCurrency(quotation.tax_amount ?? quotation.tax)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
              <span className="text-slate-900">Total</span>
              <span className="text-blue-700">{formatCurrency(quotation.total)}</span>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={`Are you sure you want to execute '${confirmModal.label}' on this quotation?`}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'cancel' ? 'danger' : 'success'}
        loading={!!actionLoading}
      />
    </div>
  );
}
