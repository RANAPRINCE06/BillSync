import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { subscriptionService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SubscriptionsPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await subscriptionService.getAll();
      setSubscriptions(res.data || []);
    } catch {
      addToast('Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        subtitle={`${subscriptions.length} subscription(s)`}
        action={
          <Button onClick={() => navigate('/subscriptions/new')}>
            <Plus className="w-4 h-4" /> New Subscription
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Customer</Th>
            <Th>Plan</Th>
            <Th>Billing Cycle</Th>
            <Th>Start Date</Th>
            <Th>Next Billing</Th>
            <Th>Expiry</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={8} rows={6} />
          ) : subscriptions.length === 0 ? (
            <TableEmpty message="No subscriptions found" cols={8} />
          ) : (
            <TableBody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{s.customer_name || s.customer?.name || '—'}</Td>
                  <Td>{s.plan_name || s.plan?.name || '—'}</Td>
                  <Td className="capitalize">{s.billing_cycle || s.plan?.billing_cycle || '—'}</Td>
                  <Td>{formatDate(s.start_date)}</Td>
                  <Td>{formatDate(s.next_billing_date)}</Td>
                  <Td>{formatDate(s.expiry_date || s.end_date)}</Td>
                  <Td><StatusBadge status={s.status} /></Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Eye} label="View" onClick={() => navigate(`/subscriptions/${s.id}`)} />
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

