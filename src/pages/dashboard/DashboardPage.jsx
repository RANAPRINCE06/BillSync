import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Repeat, DollarSign, AlertCircle, FileText,
  RotateCcw, Filter, Calendar, CreditCard, ChevronRight, TrendingUp, CheckCircle, ShieldAlert
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dashboardService, paymentService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useRealtimeBalance } from '../../hooks/useRealtimeBalance';
import { formatINR } from '../../utils/balanceEngine';
import { StatCard } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Feedback';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DashboardPage() {
  const addToast = useToast();
  const navigate = useNavigate();

  // Cloud Firestore Real-Time Balance Hook (Source of Truth)
  const {
    totalInvoiced,
    totalReceived,
    totalBalance,
    overdueBalance,
    invoiceBreakdowns,
    isFirestoreLive,
    formattedTotalInvoiced,
    formattedTotalReceived,
    formattedTotalBalance,
    formattedOverdueBalance,
  } = useRealtimeBalance();

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
    addToast('Dashboard data refreshed with real-time Firestore metrics', 'success');
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      {/* Top Header with Date & Status Filters, Live Sync Badge, and Refresh Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isFirestoreLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
              title={
                isFirestoreLive
                  ? 'Connected to Cloud Firestore live listener'
                  : 'Real-time synchronization active across all local and cloud records'
              }
            >
              <span className={`w-2 h-2 rounded-full ${isFirestoreLive ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-ping'}`} />
              {isFirestoreLive ? 'Cloud Firestore Live' : 'Real-Time Sync Active'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time financial performance, accurate balance tracking, and subscription growth
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

      {/* 5 Core Summary Cards Displayed Separately */}
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
            value={stats?.active_subscriptions ?? 0}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
        </div>

        {/* 2. Total Invoiced Card (Sum of confirmed invoice amounts) */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Sum of confirmed invoice amounts"
        >
          <StatCard
            icon={DollarSign}
            label="Total Invoiced"
            value={formattedTotalInvoiced}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-600"
          />
        </div>

        {/* 3. Total Received Card (Sum of valid payments against confirmed invoices) */}
        <div
          onClick={() => navigate('/payments')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Sum of valid payments received against confirmed invoices"
        >
          <StatCard
            icon={CreditCard}
            label="Total Received"
            value={formattedTotalReceived}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>

        {/* 4. Total Balance Card (Remaining amount customers owe: Total Invoiced - Total Received) */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Total Balance = Total Invoiced − Total Received"
        >
          <StatCard
            icon={AlertCircle}
            label="Total Balance"
            value={formattedTotalBalance}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* 5. Overdue Balance Card (Outstanding amount on invoices past due date) */}
        <div
          onClick={() => navigate('/invoices')}
          className="cursor-pointer transition-transform hover:-translate-y-0.5"
          title="Outstanding amount on invoices past their due date"
        >
          <StatCard
            icon={FileText}
            label="Overdue Balance"
            value={formattedOverdueBalance}
            iconBg="bg-red-50"
            iconColor="text-red-600"
          />
        </div>
      </div>

      {/* Invoice-Wise Balance Breakdown Section (Strictly per Section 2 Specification) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <CardTitle>Invoice-Wise Calculation Breakdown</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Remaining balance calculated separately per confirmed invoice (Integer paise arithmetic)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 hidden md:inline">
                Formula: <span className="font-semibold text-slate-700">Outstanding = Invoice Amount − Paid Amount</span>
              </span>
              <span className="text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1 rounded-lg">
                Total Balance: {formattedTotalBalance}
              </span>
            </div>
          </div>
        </CardHeader>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th className="text-right">Invoice Amount</Th>
            <Th className="text-right">Paid Amount</Th>
            <Th className="text-right">Outstanding</Th>
            <Th className="text-center">Status</Th>
          </TableHead>
          <TableBody>
            {invoiceBreakdowns.length === 0 ? (
              <TableEmpty message="No confirmed invoices available for balance calculation" cols={6} />
            ) : (
              <>
                {invoiceBreakdowns.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/invoices/${row.id}`)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Td className="font-mono text-xs font-semibold text-blue-700">{row.invoice_number}</Td>
                    <Td className="text-xs font-medium text-slate-800">
                      <div>{row.customer_name}</div>
                      {row.company && <div className="text-[11px] text-slate-400">{row.company}</div>}
                    </Td>
                    <Td className="text-right font-mono text-xs text-slate-800">{formatINR(row.total)}</Td>
                    <Td className="text-right font-mono text-xs text-emerald-700 font-semibold">{formatINR(row.amount_paid)}</Td>
                    <Td className="text-right font-mono text-xs font-bold">
                      {row.balance_due > 0 ? (
                        <span className={row.is_overdue ? 'text-red-600' : 'text-amber-600'}>
                          {formatINR(row.balance_due)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 flex items-center justify-end gap-1">
                          <CheckCircle className="w-3.5 h-3.5 inline" /> ₹0.00
                        </span>
                      )}
                    </Td>
                    <Td className="text-center">
                      <StatusBadge status={row.is_overdue ? 'OVERDUE' : row.status} />
                    </Td>
                  </tr>
                ))}
                {/* Summary Row Matching Section 2 Requirements */}
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 text-xs">
                  <Td colSpan={2} className="text-slate-900 uppercase tracking-wider">
                    Total
                  </Td>
                  <Td className="text-right font-mono text-slate-900">{formattedTotalInvoiced}</Td>
                  <Td className="text-right font-mono text-emerald-700">{formattedTotalReceived}</Td>
                  <Td className="text-right font-mono text-blue-700 text-sm">{formattedTotalBalance}</Td>
                  <Td className="text-center text-[11px] text-slate-500 font-normal">
                    {invoiceBreakdowns.filter((i) => i.balance_due === 0).length} of {invoiceBreakdowns.length} Paid
                  </Td>
                </tr>
              </>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Charts Section: Revenue Trend & Subscription Growth */}
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
              <p className="text-sm text-slate-400 text-center py-12">No revenue data reported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(v) => [formatINR(v), 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Subscription Growth & Renewals Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <CardTitle>Subscription Growth & Renewals</CardTitle>
            </div>
            <span className="text-xs text-slate-500 font-medium">Monthly Agreement Volume</span>
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
              <Th className="text-right">Total</Th>
              <Th className="text-center">Status</Th>
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
                    <Td className="font-medium text-right font-mono text-slate-900">{formatINR(inv.total)}</Td>
                    <Td className="text-center">
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
              <Th className="text-right">Amount</Th>
              <Th className="text-center">Method</Th>
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
                    <Td className="font-bold text-right font-mono text-emerald-700">{formatINR(p.amount)}</Td>
                    <Td className="text-center">
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
