import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PauseCircle, PlayCircle, RefreshCw, XCircle } from 'lucide-react';
import { subscriptionService } from '../../services';
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

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '', label: '' });

  const fetchSubscription = async () => {
    setLoading(true);
    try {
      const res = await subscriptionService.getById(id);
      setSubscription(res.data);
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
      if (action === 'pause') await subscriptionService.pause(id);
      else if (action === 'renew') await subscriptionService.renew(id);
      else if (action === 'close') await subscriptionService.close(id);
      addToast(`Subscription successfully ${action}d`, 'success');
      fetchSubscription();
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to ${action} subscription`);
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!subscription) return <p className="text-sm text-slate-500 py-8 text-center">Subscription not found.</p>;

  const status = (subscription.status || '').toUpperCase();
  const items = subscription.items || subscription.products || subscription.line_items || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/subscriptions')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Subscription {subscription.subscription_number || `#${id}`}
          </h1>
          <p className="text-sm text-slate-500">
            Customer: {subscription.customer_name || subscription.customer?.name || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={subscription.status} />

          {status === 'ACTIVE' && (
            <>
              <Button
                variant="warning"
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'pause', label: 'Pause Subscription' })}
                loading={actionLoading === 'pause'}
              >
                <PauseCircle className="w-4 h-4" /> Pause
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'close', label: 'Close Subscription' })}
                loading={actionLoading === 'close'}
              >
                <XCircle className="w-4 h-4" /> Close
              </Button>
            </>
          )}

          {status === 'PAUSED' && (
            <Button
              variant="success"
              size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'renew', label: 'Resume Subscription' })}
              loading={actionLoading === 'renew'}
            >
              <PlayCircle className="w-4 h-4" /> Resume
            </Button>
          )}

          {status === 'EXPIRED' && (
            <Button
              variant="success"
              size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'renew', label: 'Renew Subscription' })}
              loading={actionLoading === 'renew'}
            >
              <RefreshCw className="w-4 h-4" /> Renew
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Agreement Information</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Customer', subscription.customer_name || subscription.customer?.name || '—'],
              ['Plan', subscription.plan_name || subscription.plan?.name || '—'],
              ['Billing Interval', subscription.billing_interval || subscription.plan?.billing_interval || subscription.billing_cycle || '—'],
              ['Start Date', formatDate(subscription.start_date)],
              ['End / Expiry Date', formatDate(subscription.end_date || subscription.expiry_date)],
              ['Next Billing Date', formatDate(subscription.next_billing_date)],
              ['Payment Terms', subscription.payment_terms || 'Due upon receipt'],
              ['Status', <StatusBadge key="s" status={subscription.status} />],
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
            <CardTitle>Included Subscription Items</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Product / Add-on</Th>
              <Th>Quantity</Th>
              <Th>Unit Price</Th>
              <Th className="text-right">Total</Th>
            </TableHead>
            {items.length === 0 ? (
              <TableEmpty message="Base plan features only — no extra line items" cols={4} />
            ) : (
              <TableBody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <Td className="font-medium text-slate-900">{item.product_name || item.product?.name || item.name || 'Product'}</Td>
                    <Td>{item.quantity}</Td>
                    <Td>{formatCurrency(item.unit_price)}</Td>
                    <Td className="text-right font-semibold text-slate-900">
                      {formatCurrency((item.quantity || 1) * (item.unit_price || 0))}
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '', label: '' })}
        onConfirm={() => handleAction(confirmModal.action)}
        title={confirmModal.label}
        message={`Are you sure you want to ${confirmModal.action} this subscription?`}
        confirmLabel={confirmModal.label}
        variant={confirmModal.action === 'close' ? 'danger' : 'primary'}
        loading={!!actionLoading}
      />
    </div>
  );
}
