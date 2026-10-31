import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PauseCircle, RefreshCw, XCircle } from 'lucide-react';
import { subscriptionService } from '../../services';
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
    } catch {
      addToast('Failed to load subscription', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubscription(); }, [id]);

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'pause') await subscriptionService.pause(id);
      else if (action === 'renew') await subscriptionService.renew(id);
      else if (action === 'close') await subscriptionService.close(id);
      addToast(`Subscription ${action}d`, 'success');
      fetchSubscription();
    } catch (err) {
      const msg = err.response?.data?.detail || `Failed to ${action} subscription`;
      addToast(msg, 'error');
    } finally {
      setActionLoading('');
      setConfirmModal({ open: false, action: '', label: '' });
    }
  };

  if (loading) return <PageSpinner />;
  if (!subscription) return <p className="text-sm text-slate-500">Subscription not found.</p>;

  const status = subscription.status?.toLowerCase();
  const products = subscription.products || subscription.line_items || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Subscription #{id}
          </h1>
          <p className="text-sm text-slate-500">{subscription.customer_name || subscription.customer?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={subscription.status} />
          {status === 'active' && (
            <>
              <Button variant="warning" size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'pause', label: 'Pause Subscription' })}
                loading={actionLoading === 'pause'}>
                <PauseCircle className="w-4 h-4" /> Pause
              </Button>
              <Button variant="danger" size="sm"
                onClick={() => setConfirmModal({ open: true, action: 'close', label: 'Close Subscription' })}
                loading={actionLoading === 'close'}>
                <XCircle className="w-4 h-4" /> Close
              </Button>
            </>
          )}
          {(status === 'paused' || status === 'expired') && (
            <Button variant="success" size="sm"
              onClick={() => setConfirmModal({ open: true, action: 'renew', label: 'Renew Subscription' })}
              loading={actionLoading === 'renew'}>
              <RefreshCw className="w-4 h-4" /> Renew
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Customer', subscription.customer_name || subscription.customer?.name],
              ['Plan', subscription.plan_name || subscription.plan?.name],
              ['Billing Cycle', subscription.billing_cycle || subscription.plan?.billing_cycle],
              ['Start Date', formatDate(subscription.start_date)],
              ['Expiry Date', formatDate(subscription.expiry_date || subscription.end_date)],
              ['Next Billing', formatDate(subscription.next_billing_date)],
              ['Status', <StatusBadge key="s" status={subscription.status} />],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <div className="text-sm text-slate-700 mt-0.5 capitalize">{val || '—'}</div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Products</CardTitle></CardHeader>
          <Table>
            <TableHead>
              <Th>Product</Th>
              <Th>Quantity</Th>
              <Th>Unit Price</Th>
              <Th>Total</Th>
            </TableHead>
            {products.length === 0 ? (
              <TableEmpty message="No products" cols={4} />
            ) : (
              <TableBody>
                {products.map((p, i) => (
                  <tr key={i}>
                    <Td>{p.product_name || p.name || '—'}</Td>
                    <Td>{p.quantity}</Td>
                    <Td>{formatCurrency(p.unit_price || p.price)}</Td>
                    <Td className="font-medium">{formatCurrency((p.quantity || 1) * (p.unit_price || p.price || 0))}</Td>
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
        variant={confirmModal.action === 'close' ? 'danger' : confirmModal.action === 'renew' ? 'success' : 'warning'}
        loading={!!actionLoading}
      />
    </div>
  );
}

