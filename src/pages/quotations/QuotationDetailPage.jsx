import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, Repeat, XCircle, Send,
  Pencil, Trash2, Calendar, Building, Mail, FileText, CheckCircle2,
  Printer, Download, Copy
} from 'lucide-react';
import { quotationService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Feedback';
import { formatCurrency } from '../../utils/quotationCalculations';

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
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '', message: '' });

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
      if (action === 'send') {
        await quotationService.update(id, { status: 'SENT' });
        addToast('Quotation marked as sent to customer', 'success');
      } else if (action === 'confirm' || action === 'accept') {
        await (quotationService.confirm ? quotationService.confirm(id) : quotationService.update(id, { status: 'ACCEPTED' }));
        addToast('Quotation successfully accepted by customer', 'success');
      } else if (action === 'cancel' || action === 'reject') {
        await (quotationService.cancel ? quotationService.cancel(id) : quotationService.update(id, { status: 'REJECTED' }));
        addToast('Quotation marked as rejected / cancelled', 'info');
      } else if (action === 'convert') {
        await quotationService.convertToSubscription(id);
        addToast('Quotation converted into active recurring subscription & initial invoice generated!', 'success');
        navigate('/subscriptions');
        return;
      } else if (action === 'delete') {
        await quotationService.delete(id);
        addToast('Quotation deleted successfully', 'info');
        navigate('/quotations');
        return;
      } else if (action === 'duplicate') {
        const res = await quotationService.duplicate(id);
        const dupId = res.data?.id || res.id;
        addToast('Quotation duplicated into a new draft!', 'success');
        navigate(`/quotations/${dupId}`);
        return;
      }
      fetchQuotation();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to execute ${action}`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '', message: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!quotation) return <p className="text-sm text-slate-500 py-8 text-center">Quotation not found.</p>;

  const status = (quotation.status || '').toUpperCase();
  const lines = quotation.items || quotation.lines || [];
  const canEdit = status === 'DRAFT' || status === 'SENT';
  const canDelete = status === 'DRAFT';

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/quotations')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                Quotation {quotation.quotation_number || `QT-${quotation.id}`}
              </h1>
              <StatusBadge status={quotation.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Issued: {formatDate(quotation.created_at || quotation.date)} • Valid Until: {formatDate(quotation.valid_until)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Print Quotation */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>

          {/* Download Quotation */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const exportDoc = {
                quotation_number: quotation.quotation_number,
                customer: quotation.customer_name,
                valid_until: quotation.valid_until,
                items: quotation.items,
                subtotal: quotation.subtotal,
                tax_amount: quotation.tax_amount,
                discount_amount: quotation.discount_amount,
                total: quotation.total,
              };
              const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${quotation.quotation_number || 'Quotation'}.json`;
              a.click();
              URL.revokeObjectURL(a);
              addToast('Quotation document downloaded', 'success');
            }}
          >
            <Download className="w-3.5 h-3.5" /> Download
          </Button>

          {/* Duplicate Quotation */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAction('duplicate')}
            loading={actionLoading === 'duplicate'}
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </Button>

          {canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/quotations/${id}/edit`)}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Quotation
            </Button>
          )}

          {status === 'DRAFT' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'send',
                    label: 'Mark as Sent',
                    message: 'Mark this quotation as delivered to the customer for review?',
                  })
                }
                loading={actionLoading === 'send'}
              >
                <Send className="w-3.5 h-3.5" /> Mark as Sent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'delete',
                    label: 'Delete Quotation',
                    message: `Are you sure you want to permanently delete quotation ${quotation.quotation_number || quotation.id}?`,
                  })
                }
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Draft
              </Button>
            </>
          )}

          {(status === 'DRAFT' || status === 'SENT') && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'cancel',
                    label: 'Reject Quotation',
                    message: 'Mark this quotation proposal as rejected?',
                  })
                }
                loading={actionLoading === 'cancel'}
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: 'accept',
                    label: 'Accept Quotation',
                    message: 'Confirm acceptance of this quotation and approve the proposed pricing?',
                  })
                }
                loading={actionLoading === 'accept'}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Accept Quotation
              </Button>
            </>
          )}

          {(status === 'ACCEPTED' || status === 'CONFIRMED') && (
            <Button
              variant="success"
              size="sm"
              onClick={() =>
                setConfirmModal({
                  open: true,
                  action: 'convert',
                  label: 'Convert to Subscription',
                  message: 'Convert this accepted quotation into an active recurring subscription and generate the opening invoice?',
                })
              }
              loading={actionLoading === 'convert'}
            >
              <Repeat className="w-3.5 h-3.5" /> Convert to Subscription
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recipient & Terms Details */}
        <Card>
          <CardHeader>
            <CardTitle>Customer & Quotation Parameters</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Customer</span>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {quotation.customer_name || quotation.customer?.name || '—'}
              </div>
              {quotation.company && (
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <Building className="w-3 h-3 text-slate-400" /> {quotation.company}
                </div>
              )}
              {quotation.customer_email && (
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <Mail className="w-3 h-3 text-slate-400" /> {quotation.customer_email}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Quotation Date</span>
                <span className="font-medium text-slate-800">{formatDate(quotation.created_at || quotation.date)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Valid Until</span>
                <span className="font-medium text-slate-800">{formatDate(quotation.valid_until)}</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Quotation Status</span>
              <div className="mt-1">
                <StatusBadge status={quotation.status} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Proposal Terms & Notes</span>
              <p className="text-xs text-slate-700 mt-1 whitespace-pre-line leading-relaxed">
                {quotation.notes || <span className="text-slate-400 italic">No notes provided for this quotation.</span>}
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Line Items Table & Financial Breakdown */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quotation Line Items</CardTitle>
            </CardHeader>
            <Table>
              <TableHead>
                <Th>Line Offering</Th>
                <Th className="text-center">Qty</Th>
                <Th className="text-right">Unit Price</Th>
                <Th className="text-center">Tax (%)</Th>
                <Th className="text-right">Line Total</Th>
              </TableHead>
              <TableBody>
                {lines.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">
                      {item.product_name || item.name || 'Catalog Item'}
                      {item.plan_id && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">
                          Subscription Plan
                        </span>
                      )}
                    </Td>
                    <Td className="text-center">{item.quantity}</Td>
                    <Td className="text-right">{formatCurrency(item.unit_price)}</Td>
                    <Td className="text-center">{item.tax_rate ?? 18}%</Td>
                    <Td className="text-right font-semibold text-slate-900">
                      {formatCurrency(item.line_total || item.quantity * item.unit_price)}
                    </Td>
                  </tr>
                ))}
              </TableBody>
            </Table>

            {/* Calculations Breakdown */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Gross Subtotal:</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(quotation.subtotal)}</span>
                </div>
                {Number(quotation.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Discount Applied:</span>
                    <span>-{formatCurrency(quotation.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Taxes (GST):</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(quotation.tax_amount)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                  <span>Grand Total:</span>
                  <span className="text-emerald-700">{formatCurrency(quotation.total)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '', message: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={confirmModal.message}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'delete' || confirmModal.action === 'cancel' ? 'danger' : 'primary'}
        loading={Boolean(actionLoading)}
      />
    </div>
  );
}