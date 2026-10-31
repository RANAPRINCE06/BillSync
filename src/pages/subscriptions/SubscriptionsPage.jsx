import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { subscriptionService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SubscriptionsPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const { isCustomer } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await subscriptionService.getAll();
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setSubscriptions(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load subscriptions'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle={`${subscriptions.length} active / tracked subscription(s)`}
        action={
          !isCustomer && (
            <Button onClick={() => navigate('/subscriptions/new')}>
              <Plus className="w-4 h-4" /> New Subscription
            </Button>
          )
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Subscription #</Th>
            <Th>Customer</Th>
            <Th>Plan</Th>
            <Th>Billing Interval</Th>
            <Th>Start Date</Th>
            <Th>Next Billing</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={8} rows={6} />
          ) : subscriptions.length === 0 ? (
            <TableEmpty message="No subscriptions found. Create one from a plan or accepted quotation." cols={8} />
          ) : (
            <TableBody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <Td className="font-mono text-xs font-semibold text-slate-900">
                    {s.subscription_number || `#${s.id}`}
                  </Td>
                  <Td className="font-medium text-slate-900">{s.customer_name || s.customer?.name || '—'}</Td>
                  <Td>{s.plan_name || s.plan?.name || '—'}</Td>
                  <Td>
                    <StatusBadge status={s.billing_interval || s.plan?.billing_interval || s.billing_cycle} />
                  </Td>
                  <Td>{formatDate(s.start_date)}</Td>
                  <Td>{formatDate(s.next_billing_date)}</Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Eye} label="View subscription" onClick={() => navigate(`/subscriptions/${s.id}`)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>
    </div>
  );
}
