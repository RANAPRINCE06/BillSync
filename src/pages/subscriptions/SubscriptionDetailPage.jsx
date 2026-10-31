import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, PlayCircle, PauseCircle,
  RefreshCw, XCircle, Calendar, Building, Mail, Phone,
  Clock, ShieldCheck, FileText, CheckCircle2, AlertCircle,
  Printer, Receipt, CreditCard
} from 'lucide-react';
import { subscriptionService, invoiceService, paymentService } from '../../services';
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

function formatDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [subscription, setSubscription] = useState(null);
  const [relatedInvoices, setRelatedInvoices] = useState([]);
  const [relatedPayments, setRelatedPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '', message: '' });

  const fetchSubscription = async () => {
    setLoading(true);
    try {
      const [subRes, invRes, payRes] = await Promise.all([
        subscriptionService.getById(id),
        invoiceService.getAll().catch(() => ({ data: [] })),
        paymentService.getAll().catch(() => ({ data: [] })),
      ]);
      setSubscription(subRes.data);

      const allInvs = Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || [];
      const myInvs = allInvs.filter((i) => String(i.subscription_id) === String(id));
      setRelatedInvoices(myInvs);

      const myInvIds = new Set(myInvs.map((i) => String(i.id)));
      const allPays = Array.isArray(payRes.data) ? payRes.data : payRes.data?.items || [];
      const myPays = allPays.filter((p) => myInvIds.has(String(p.invoice_id)));
      setRelatedPayments(myPays);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load subscription details'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [id]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'confirm') await subscriptionService.confirm(id);
      else if (action === 'activate') await subscriptionService.activate(id);
      else if (action === 'pause') await subscriptionService.pause(id);
      else if (action === 'resume') await subscriptionService.resume(id);
      else if (action === 'renew') await subscriptionService.renew(id);
      else if (action === 'close') await subscriptionService.close(id);

      addToast(`Subscription successfully ${action}ed!`, 'success');
      fetchSubscription();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to execute ${action}`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '', message: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!subscription) return <p className="text-sm text-slate-500 py-8 text-center">Subscription not found.</p>;

  const status = (subscription.status || '').toUpperCase();
  const plan = subscription.plan || {};
  const customer = subscription.customer || {};
  const items = subscription.items || [];
  const history = subscription.history || [];

  // Determine allowed actions based on plan rules and current status
  const allowPause = plan.allow_pause !== false;
  const allowEarlyClose = plan.allow_early_close !== false;
  const allowRenewal = plan.allow_renewal !== false;

  return (
    <div className="space-y-6">
      {/* Header and Lifecycle Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/subscriptions')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                Subscription {subscription.subscription_number || `#${id}`}
              </h1>
              <StatusBadge status={subscription.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Plan: {subscription.plan_name || plan.name || 'Standard Tier'} • Frequency: {subscription.billing_interval || 'MONTHLY'}
            </p>
          </div>
        </div>

        {/* Action Buttons strictly obeying status transition & plan options */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Print Subscription Details */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5" /> Print Details
          </Button>

          {/* Draft or Quotation -> Confirm */}
          {(status === 'DRAFT' || status === 'QUOTATION') && (
            <Button
              size="sm"
              onClick={() => handleAction('confirm')}
              loading={actionLoading === 'confirm'}
            >
              <CheckCircle className="w-3.5 h-3.5" /> Confirm Agreement
            </Button>
          )}

          {/* Confirmed -> Activate */}
          {status === 'CONFIRMED' && (
            <Button
              variant="success"
              size="sm"
              onClick={() => handleAction('activate')}
              loading={actionLoading === 'activate'}
            >
              <PlayCircle className="w-3.5 h-3.5" /> Activate Subscription
            </Button>
          )}

          {/* Active -> Pause, Renew, Close */}
          {status === 'ACTIVE' && (
            <>
              {allowPause && (
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      action: 'pause',
                      label: 'Pause Subscription',
                      message: 'Are you sure you want to pause this subscription? Recurring charges and automated provisioning will be suspended.',
                    })
                  }
                  loading={actionLoading === 'pause'}
                >
                  <PauseCircle className="w-3.5 h-3.5" /> Pause
                </Button>
              )}

              {allowRenewal && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      action: 'renew',
                      label: 'Renew Subscription',
                      message: 'Extend this subscription term for the consecutive billing cycle?',
                    })
                  }
                  loading={actionLoading === 'renew'}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Renew
                </Button>
              )}

              {allowEarlyClose && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      action: 'close',
                      label: 'Close Subscription',
                      message: 'Are you sure you want to permanently close this subscription? Outstanding balances will remain due.',
                    })
                  }
                  loading={actionLoading === 'close'}
                >
                  <XCircle className="w-3.5 h-3.5" /> Close
                </Button>
              )}
            </>
          )}

          {/* Paused -> Resume, Close */}
          {status === 'PAUSED' && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={() => handleAction('resume')}
                loading={actionLoading === 'resume'}
              >
                <PlayCircle className="w-3.5 h-3.5" /> Resume Subscription
              </Button>

              {allowEarlyClose && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      action: 'close',
                      label: 'Close Subscription',
                      message: 'Terminate and close this paused subscription permanently?',
                    })
                  }
                  loading={actionLoading === 'close'}
                >
                  <XCircle className="w-3.5 h-3.5" /> Close
                </Button>
              )}
            </>
          )}

          {/* Closed -> Renew if plan allows */}
          {status === 'CLOSED' && allowRenewal && (
            <Button
              variant="success"
              size="sm"
              onClick={() =>
                setConfirmModal({
                  open: true,
                  action: 'renew',
                  label: 'Reactivate & Renew Subscription',
                  message: 'Reactivate this closed subscription agreement for a new billing cycle?',
                })
              }
              loading={actionLoading === 'renew'}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Renew & Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Grid: Agreement & Customer Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Customer Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block uppercase font-medium">Customer Name</span>
              <p className="text-sm font-semibold text-slate-900 mt-0.5">
                {subscription.customer_name || customer.name || '—'}
              </p>
            </div>
            {(subscription.company || customer.company) && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{subscription.company || customer.company}</span>
              </div>
            )}
            {(subscription.customer_email || customer.email) && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{subscription.customer_email || customer.email}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.address && (
              <div className="border-t border-slate-100 pt-2 text-slate-500">
                <span className="text-slate-400 block font-medium">Billing Address</span>
                <p className="mt-0.5 leading-relaxed">{customer.address}</p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Selected Plan Details & Lifecycle Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Selected Subscription Plan</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-slate-400 block uppercase font-medium">Plan Tier</span>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">
                  {subscription.plan_name || plan.name || 'Standard Tier'}
                </p>
              </div>
              <StatusBadge status={subscription.billing_interval || plan.billing_interval} />
            </div>

            <div className="border-t border-slate-100 pt-2">
              <span className="text-slate-400 block uppercase font-medium">Plan Rules & Permissions</span>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <span className={`px-2 py-1 rounded text-[11px] font-medium border ${allowPause ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  Pause: {allowPause ? 'Allowed' : 'Disabled'}
                </span>
                <span className={`px-2 py-1 rounded text-[11px] font-medium border ${allowEarlyClose ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  Early Close: {allowEarlyClose ? 'Allowed' : 'Disabled'}
                </span>
                <span className={`px-2 py-1 rounded text-[11px] font-medium border ${allowRenewal ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  Renewal: {allowRenewal ? 'Allowed' : 'Disabled'}
                </span>
                <span className={`px-2 py-1 rounded text-[11px] font-medium border ${plan.auto_close_at_end_date ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  Auto-Close: {plan.auto_close_at_end_date ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Billing Schedule & Terms */}
        <Card>
          <CardHeader>
            <CardTitle>Billing Dates & Terms</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-400 block uppercase font-medium">Start Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDate(subscription.start_date)}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Contract End</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDate(subscription.end_date || subscription.expiry_date)}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-400 block uppercase font-medium">Next Billing Date</span>
                <p className="font-semibold text-blue-700 mt-0.5">{formatDate(subscription.next_billing_date)}</p>
              </div>
              <div>
                <span className="text-slate-400 block uppercase font-medium">Payment Terms</span>
                <p className="font-semibold text-slate-800 mt-0.5">{subscription.payment_terms || 'Due upon receipt'}</p>
              </div>
            </div>

            {subscription.notes && (
              <div className="border-t border-slate-100 pt-2">
                <span className="text-slate-400 block uppercase font-medium">Notes & Terms</span>
                <p className="text-slate-700 mt-0.5 whitespace-pre-line">{subscription.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Product Lines Table & Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Provisioned Product Lines & Recurring Charges</CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <Th>Product / Offering</Th>
            <Th className="text-center">Quantity</Th>
            <Th className="text-right">Unit Price</Th>
            <Th className="text-center">Tax (%)</Th>
            <Th className="text-right">Line Total</Th>
          </TableHead>
          <TableBody>
            {items.map((it, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{it.product_name || it.name || 'Provisioned Offering'}</Td>
                <Td className="text-center">{it.quantity}</Td>
                <Td className="text-right">{formatCurrency(it.unit_price)}</Td>
                <Td className="text-center">{it.tax_rate ?? 18}%</Td>
                <Td className="text-right font-semibold text-slate-900">
                  {formatCurrency(it.line_total || it.quantity * it.unit_price)}
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>

        {/* Financial Breakdown */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Recurring Subtotal:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(subscription.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Estimated Taxes:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(subscription.tax_amount)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
              <span>Total Recurring Charge:</span>
              <span className="text-emerald-700">{formatCurrency(subscription.total_amount)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Subscription History / Lifecycle Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <CardTitle>Subscription Lifecycle History</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          {history.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No history records logged for this subscription.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h, idx) => (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="p-1 rounded-full bg-blue-100 text-blue-700 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{h.event}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{formatDateTime(h.timestamp)}</span>
                    </div>
                    {h.notes && <p className="text-xs text-slate-600 mt-0.5">{h.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Related Invoices & Payments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linked Invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <CardTitle>Related Invoices ({relatedInvoices.length})</CardTitle>
            </div>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Invoice #</Th>
              <Th>Total</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
            </TableHead>
            {relatedInvoices.length === 0 ? (
              <TableEmpty message="No invoices generated for this subscription agreement yet." cols={4} />
            ) : (
              <TableBody>
                {relatedInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{inv.invoice_number}</Td>
                    <Td className="font-medium text-slate-900">{formatCurrency(inv.total)}</Td>
                    <Td className={inv.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                      {formatCurrency(inv.balance_due ?? (inv.total - (inv.amount_paid || 0)))}
                    </Td>
                    <Td>
                      <StatusBadge status={inv.status} />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>

        {/* Linked Payments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <CardTitle>Related Payments ({relatedPayments.length})</CardTitle>
            </div>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Receipt Ref #</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Status</Th>
            </TableHead>
            {relatedPayments.length === 0 ? (
              <TableEmpty message="No payment transactions logged for linked invoices." cols={4} />
            ) : (
              <TableBody>
                {relatedPayments.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate('/payments')}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-900">{p.payment_reference || `#${p.id}`}</Td>
                    <Td className="font-bold text-emerald-700">{formatCurrency(p.amount)}</Td>
                    <Td>
                      <StatusBadge status={p.payment_method} />
                    </Td>
                    <Td>
                      <StatusBadge status={p.status || 'SUCCESSFUL'} />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '', message: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={confirmModal.message}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'close' ? 'danger' : 'primary'}
        loading={Boolean(actionLoading)}
      />
    </div>
  );
}