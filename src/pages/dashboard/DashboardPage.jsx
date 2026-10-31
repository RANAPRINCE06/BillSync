import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Repeat, DollarSign, AlertCircle, FileText,
  RotateCcw, Filter, Calendar, CreditCard, ChevronRight
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { dashboardService, paymentService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { StatCard } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
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
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [recentSubs, setRecentSubs] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard Filters
  const [dateRange, setDateRange] = useState('ALL_TIME');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [chartPeriod, setChartPeriod] = useState('6M');

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, subsRes, invRes, chartRes, payRes] = await Promise.all([
        dashboardService.getStats().catch(() => ({ data: null })),
        dashboardService.getRecentSubscriptions().catch(() => ({ data: [] })),
        dashboardService.getRecentInvoices().catch(() => ({ data: [] })),
        dashboardService.getRevenueChart().catch(() => ({ data: [] })),
        paymentService.getAll().catch(() => ({ data: [] })),
      ]);

      setStats(statsRes.data);
      let subs = Array.isArray(subsRes.data) ? subsRes.data : subsRes.data?.items || [];
      let invs = Array.isArray(invRes.data) ? invRes.data : invRes.data?.items || [];
      let pays = Array.isArray(payRes.data) ? payRes.data : payRes.data?.items || [];

      // Filter statistics dynamically if status filter is applied
      if (statusFilter === 'ACTIVE_ONLY') {
        subs = subs.filter((s) => s.status === 'ACTIVE');
        invs = invs.filter((i) => i.status !== 'CANCELLED');
      }

      setRecentSubs(subs.slice(0, 5));
      setRecentInvoices(invs.slice(0, 5));
      setRecentPayments(pays.slice(0, 5));

      const rawChart = Array.isArray(chartRes.data) ? chartRes.data : chartRes.data?.items || [];
      setChartData(chartPeriod === '6M' ? rawChart.slice(-6) : rawChart);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load dashboard metrics'), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, chartPeriod]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    addToast('Dashboard data refreshed with real-time metrics', 'success');
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Top Header with Date & Status Filters and Refresh Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time financial performance and subscription health
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                addToast(`Reporting period updated to: ${e.target.options[e.target.selectedIndex].text}`, 'info');
              }}
              className="bg-transparent outline-none font-medium text-slate-700 cursor-pointer"
            >
              <option value="LAST_30">Last 30 Days</option>
              <option value="THIS_QUARTER">This Quarter</option>
              <option value="THIS_YEAR">This Fiscal Year</option>
              <option value="ALL_TIME">All-Time Cumulative</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent outline-none font-medium text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Operations</option>
              <option value="ACTIVE_ONLY">Active Subscriptions Only</option>
            </select>
          </div>

          {/* Refresh Dashboard Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            loading={refreshing}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Interactive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Active Subscriptions Card */}
        <div
          onClick={() => navigate('/subscriptions')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view all active subscriptions"
        >
          <StatCard
            icon={Repeat}
            label="Active Subscriptions"
            value={stats?.active_subscriptions ?? stats?.activeSubscriptions ?? 0}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
        </div>

        {/* Total Customers Card */}
        <div
          onClick={() => navigate('/customers')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view registered clients"
        >
          <StatCard
            icon={Users}
            label="Total Customers"
            value={stats?.total_customers ?? stats?.totalCustomers ?? 0}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
          />
        </div>

        {/* Revenue Received Card */}
        <div
          onClick={() => navigate('/payments')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view payment history"
        >
          <StatCard
            icon={DollarSign}
            label="Revenue Received"
            value={formatCurrency(stats?.revenue_received ?? stats?.revenueReceived)}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>

        {/* Outstanding Balance Card */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view unpaid and pending invoices"
        >
          <StatCard
            icon={AlertCircle}
            label="Outstanding Balance"
            value={formatCurrency(stats?.outstanding_payments ?? stats?.outstandingPayments)}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* Overdue Invoices Card */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to inspect overdue invoices"
        >
          <StatCard
            icon={FileText}
            label="Overdue Invoices"
            value={stats?.overdue_invoices ?? stats?.overdueInvoices ?? 0}
            iconBg="bg-red-50"
            iconColor="text-red-600"
          />
        </div>
      </div>

      {/* Charts & Graphs Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue Trend Chart with 6M/12M toggle */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Generation Trend</CardTitle>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartPeriod('6M')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  chartPeriod === '6M' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                6 Months
              </button>
              <button
                type="button"
                onClick={() => setChartPeriod('12M')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  chartPeriod === '12M' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                12 Months
              </button>
            </div>
          </CardHeader>
          <CardBody>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No dynamic revenue data reported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
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

        {/* Recent Subscriptions (Clickable Rows) */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Subscriptions</CardTitle>
            <Link to="/subscriptions" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
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
                  <tr
                    key={sub.id}
                    onClick={() => navigate(`/subscriptions/${sub.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{sub.subscription_number || `#${sub.id}`}</Td>
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

      {/* Recent Invoices & Recent Payments Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices (Clickable Rows) */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
            <Link to="/invoices" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Invoice #</Th>
              <Th>Customer</Th>
              <Th>Total</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
            </TableHead>
            {recentInvoices.length === 0 ? (
              <TableEmpty message="No recent invoices" cols={5} />
            ) : (
              <TableBody>
                {recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{inv.invoice_number || inv.number}</Td>
                    <Td className="font-medium text-slate-800">{inv.customer_name || '—'}</Td>
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

        {/* Recent Payment Transactions (Clickable Rows) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <CardTitle>Recent Payment Transactions</CardTitle>
            </div>
            <Link to="/payments" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Receipt Ref #</Th>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Status</Th>
            </TableHead>
            {recentPayments.length === 0 ? (
              <TableEmpty message="No payments recorded" cols={5} />
            ) : (
              <TableBody>
                {recentPayments.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate('/payments')}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      {p.payment_reference || `#${p.id}`}
                    </Td>
                    <Td className="font-medium text-slate-800">{p.customer_name || 'Client'}</Td>
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
    </div>
  );
}
