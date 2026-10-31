import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Repeat, DollarSign, AlertCircle, FileText
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { dashboardService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { StatCard, PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Feedback';

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DashboardPage() {
  const addToast = useToast();
  const [stats, setStats] = useState(null);
  const [recentSubs, setRecentSubs] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, subsRes, invRes, chartRes] = await Promise.all([
          dashboardService.getStats().catch(() => ({ data: null })),
          dashboardService.getRecentSubscriptions().catch(() => ({ data: [] })),
          dashboardService.getRecentInvoices().catch(() => ({ data: [] })),
          dashboardService.getRevenueChart().catch(() => ({ data: [] })),
        ]);
        setStats(statsRes.data);
        setRecentSubs(Array.isArray(subsRes.data) ? subsRes.data : subsRes.data?.items || []);
        setRecentInvoices(Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || []);
        setChartData(Array.isArray(chartRes.data) ? chartRes.data : chartRes.data?.items || []);
      } catch (err) {
        addToast(getErrorMessage(err, 'Failed to load dashboard metrics'), 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live dynamic metrics for your subscription revenue"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          icon={Repeat}
          label="Active Subscriptions"
          value={stats?.active_subscriptions ?? stats?.activeSubscriptions}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={Users}
          label="Total Customers"
          value={stats?.total_customers ?? stats?.totalCustomers}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue Received"
          value={formatCurrency(stats?.revenue_received ?? stats?.revenueReceived)}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          icon={AlertCircle}
          label="Outstanding Balance"
          value={formatCurrency(stats?.outstanding_payments ?? stats?.outstandingPayments)}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={FileText}
          label="Overdue Invoices"
          value={stats?.overdue_invoices ?? stats?.overdueInvoices}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
      </div>

      {/* Charts & Recent Subscriptions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardBody>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No dynamic revenue data reported by API yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(v) => [formatCurrency(v), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Recent Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Subscriptions</CardTitle>
            <Link to="/subscriptions" className="text-xs font-semibold text-blue-600 hover:underline">
              View all
            </Link>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Subscription #</Th>
              <Th>Customer</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
            </TableHead>
            {recentSubs.length === 0 ? (
              <TableEmpty message="No recent subscriptions" cols={4} />
            ) : (
              <TableBody>
                {recentSubs.map((sub) => (
                  <tr key={sub.id}>
                    <Td className="font-mono text-xs">{sub.subscription_number || `#${sub.id}`}</Td>
                    <Td className="font-medium text-slate-800">{sub.customer_name || sub.customer?.name || '—'}</Td>
                    <Td>{sub.plan_name || sub.plan?.name || '—'}</Td>
                    <Td>
                      <StatusBadge status={sub.status} />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
          <Link to="/invoices" className="text-xs font-semibold text-blue-600 hover:underline">
            View all
          </Link>
        </CardHeader>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Issue Date</Th>
            <Th>Due Date</Th>
            <Th>Total</Th>
            <Th>Balance Due</Th>
            <Th>Status</Th>
          </TableHead>
          {recentInvoices.length === 0 ? (
            <TableEmpty message="No recent invoices" cols={7} />
          ) : (
            <TableBody>
              {recentInvoices.map((inv) => (
                <tr key={inv.id}>
                  <Td className="font-mono text-xs font-semibold text-slate-900">{inv.invoice_number || inv.number}</Td>
                  <Td className="font-medium text-slate-800">{inv.customer_name || inv.customer?.name || '—'}</Td>
                  <Td>{formatDate(inv.issue_date || inv.date || inv.invoice_date)}</Td>
                  <Td>{formatDate(inv.due_date)}</Td>
                  <Td className="font-medium text-slate-900">{formatCurrency(inv.total)}</Td>
                  <Td className={inv.balance_due > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                    {formatCurrency(
                      inv.balance_due !== undefined
                        ? inv.balance_due
                        : (inv.total || 0) - (inv.amount_paid || 0)
                    )}
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
    </div>
  );
}
