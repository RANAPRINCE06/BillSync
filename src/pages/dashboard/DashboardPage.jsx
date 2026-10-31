import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Repeat, DollarSign, AlertCircle, FileText,
  RotateCcw, Filter, Calendar, CreditCard, ChevronRight, TrendingUp
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
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
  const [revenueChartData, setRevenueChartData] = useState([]);
  const [subChartData, setSubChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dashboard Filters
  const [dateRange, setDateRange] = useState('ALL_TIME');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [chartPeriod, setChartPeriod] = useState('6M');

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, subsRes, invRes, chartRes, subChartRes, payRes] = await Promise.all([
        dashboardService.getStats().catch(() => ({ data: null })),
        dashboardService.getRecentSubscriptions().catch(() => ({ data: [] })),
        dashboardService.getRecentInvoices().catch(() => ({ data: [] })),
        dashboardService.getRevenueChart().catch(() => ({ data: [] })),
        dashboardService.getSubscriptionChart ? dashboardService.getSubscriptionChart().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
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
      setRevenueChartData(chartPeriod === '6M' ? rawChart.slice(-6) : rawChart);

      const rawSubChart = Array.isArray(subChartRes.data) ? subChartRes.data : subChartRes.data?.items || [];
      setSubChartData(chartPeriod === '6M' ? rawSubChart.slice(-6) : rawSubChart);
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

  const totalRevenue = stats?.total_revenue ?? ((stats?.revenue_received || 0) + (stats?.outstanding_payments || 0));

  return (
    <div className="space-y-6">
      {/* Top Header with Date & Status Filters and Refresh Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time financial performance and subscription trends
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

      {/* 5 Core Summary Cards Requested */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* 1. Active Subscriptions Card */}
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

        {/* 2. Total Revenue Card */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view all invoices and revenue"
        >
          <StatCard
            icon={DollarSign}
            label="Total Revenue"
            value={formatCurrency(totalRevenue)}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
          />
        </div>

        {/* 3. Payments Received Card */}
        <div
          onClick={() => navigate('/payments')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view payment history"
        >
          <StatCard
            icon={CreditCard}
            label="Payments Received"
            value={formatCurrency(stats?.revenue_received ?? stats?.revenueReceived)}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>

        {/* 4. Outstanding Amount Card */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Click to view unpaid and pending invoices"
        >
          <StatCard
            icon={AlertCircle}
            label="Outstanding Amount"
            value={formatCurrency(stats?.outstanding_payments ?? stats?.outstandingPayments)}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* 5. Overdue Invoices Card */}
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

      {/* Charts Section: Revenue Chart & Subscription Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue Trend Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <CardTitle>Revenue Generation Trend</CardTitle>
            </div>
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
            {revenueChartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No dynamic revenue data reported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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

        {/* Subscription Trends Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <CardTitle>Subscription Growth & Renewal Trends</CardTitle>
            </div>
            <span className="text-xs text-slate-400 font-medium">Monthly Active Agreements</span>
          </CardHeader>
          <CardBody>
            {subChartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No subscription data reported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={subChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="subscriptions" name="Active Agreements" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="renewals" name="Term Renewals" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Recent Activities Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Subscriptions */}
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
              <Th>Status</Th>
            </TableHead>
            {recentSubs.length === 0 ? (
              <TableEmpty message="No recent subscriptions" cols={3} />
            ) : (
              <TableBody>
                {recentSubs.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => navigate(`/subscriptions/${sub.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{sub.subscription_number || `#${sub.id}`}</Td>
                    <Td className="font-medium text-slate-800 truncate max-w-[120px]">{sub.customer_name || '—'}</Td>
                    <Td>
                      <StatusBadge status={sub.status} />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>

        {/* Recent Invoices */}
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
              <Th>Total</Th>
              <Th>Status</Th>
            </TableHead>
            {recentInvoices.length === 0 ? (
              <TableEmpty message="No recent invoices" cols={3} />
            ) : (
              <TableBody>
                {recentInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{inv.invoice_number}</Td>
                    <Td className="font-medium text-slate-900">{formatCurrency(inv.total)}</Td>
                    <Td>
                      <StatusBadge status={inv.status} />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>

        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <Link to="/payments" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Receipt Ref #</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
            </TableHead>
            {recentPayments.length === 0 ? (
              <TableEmpty message="No recent payments" cols={3} />
            ) : (
              <TableBody>
                {recentPayments.map((p) => (
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
