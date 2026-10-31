import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Filter } from 'lucide-react';
import { subscriptionService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/quotationCalculations';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CLOSED', label: 'Closed' },
];

const INTERVAL_FILTERS = [
  { value: 'ALL', label: 'All Frequencies' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export default function SubscriptionsPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const { isCustomer } = useAuth();

  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [intervalFilter, setIntervalFilter] = useState('ALL');

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (intervalFilter !== 'ALL') params.interval = intervalFilter;

      const res = await subscriptionService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setSubscriptions(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load subscriptions'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, intervalFilter]);

  useEffect(() => {
    const t = setTimeout(fetchSubscriptions, 250);
    return () => clearTimeout(t);
  }, [fetchSubscriptions]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscriptions"
        subtitle={`${subscriptions.length} recurring subscription agreement(s)`}
        action={
          !isCustomer && (
            <Button onClick={() => navigate('/subscriptions/new')}>
              <Plus className="w-4 h-4" /> New Subscription
            </Button>
          )
        }
      />

      <Card>
        {/* Search & Filters Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by subscription #, customer, company, or plan..."
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={intervalFilter}
              onChange={(e) => setIntervalFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {INTERVAL_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subscriptions Table */}
        <Table>
          <TableHead>
            <Th>Subscription #</Th>
            <Th>Customer & Company</Th>
            <Th>Subscription Plan</Th>
            <Th>Start Date</Th>
            <Th>End / Expiry</Th>
            <Th>Billing Frequency</Th>
            <Th>Total Amount</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={9} rows={6} />
          ) : subscriptions.length === 0 ? (
            <TableEmpty message="No subscriptions found matching your filter criteria." cols={9} />
          ) : (
            <TableBody>
              {subscriptions.map((s) => {
                const total = s.total_amount ?? s.total ?? (s.items || []).reduce((acc, it) => acc + (it.line_total || it.quantity * it.unit_price || 0), 0);
                const frequency = s.billing_interval || s.plan?.billing_interval || s.billing_cycle || 'MONTHLY';

                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={() => navigate(`/subscriptions/${s.id}`)}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {s.subscription_number || `#${s.id}`}
                      </button>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{s.customer_name || s.customer?.name || '—'}</div>
                      {s.company && <div className="text-xs text-slate-400">{s.company}</div>}
                    </Td>
                    <Td className="font-medium text-slate-800">{s.plan_name || s.plan?.name || 'Standard Tier'}</Td>
                    <Td>{formatDate(s.start_date)}</Td>
                    <Td>{formatDate(s.end_date || s.expiry_date)}</Td>
                    <Td>
                      <StatusBadge status={frequency} />
                    </Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(total)}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <IconButton
                          icon={Eye}
                          label="View subscription details"
                          onClick={() => navigate(`/subscriptions/${s.id}`)}
                          className="text-slate-500 hover:text-blue-600"
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>
    </div>
  );
}