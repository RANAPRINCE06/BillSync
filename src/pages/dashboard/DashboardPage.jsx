import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Repeat, DollarSign, AlertCircle, FileText
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { dashboardService } from '../../services';
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
          dashboardService.getStats(),
          dashboardService.getRecentSubscriptions(),
          dashboardService.getRecentInvoices(),
          dashboardService.getRevenueChart(),
        ]);
        setStats(statsRes.data);
        setRecentSubs(subsRes.data || []);
        setRecentInvoices(invRes.data || []);
        setChartData(chartRes.data || []);
      } catch {
        addToast('Failed to load dashboard data', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your subscription business" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard icon={Repeat} label="Active Subscriptions" value={stats?.active_subscriptions}
          iconBg="bg-blue-50" iconColor="text-blue-600" />
        <StatCard icon={Users} label="Total Customers" value={stats?.total_customers}
          iconBg="bg-violet-50" iconColor="text-violet-600" />
        <StatCard icon={DollarSign} label="Revenue Received" value={formatCurrency(stats?.revenue_received)}
          iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard icon={AlertCircle} label="Outstanding" value={formatCurrency(stats?.outstanding_payments)}
          iconBg="bg-amber-50" iconColor="text-amber-600" />
        <StatCard icon={FileText} label="Overdue Invoices" value={stats?.overdue_invoices}
          iconBg="bg-red-50" iconColor="text-red-600" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardBody>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No chart data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(v) => [formatCurrency(v), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Recent Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Subscriptions</CardTitle>
            <Link to="/subscriptions" className="text-xs text-blue-600 hover:underline">View all</Link>
          </CardHeader>
          <Table>
            <TableHead>
              <Th>Customer</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
            </TableHead>
            {recentSubs.length === 0 ? (
              <TableEmpty message="No recent subscriptions" cols={3} />
            ) : (
              <TableBody>
                {recentSubs.map((sub) => (
                  <tr key={sub.id}>
                    <Td>{sub.customer_name || sub.customer?.name || '—'}</Td>
                    <Td>{sub.plan_name || sub.plan?.name || '—'}</Td>
                    <Td><StatusBadge status={sub.status} /></Td>
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
          <Link to="/invoices" className="text-xs text-blue-600 hover:underline">View all</Link>
        </CardHeader>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Due Date</Th>
            <Th>Total</Th>
            <Th>Status</Th>
          </TableHead>
          {recentInvoices.length === 0 ? (
            <TableEmpty message="No recent invoices" cols={6} />
          ) : (
            <TableBody>
              {recentInvoices.map((inv) => (
                <tr key={inv.id}>
                  <Td className="font-mono text-xs">{inv.invoice_number || inv.number}</Td>
                  <Td>{inv.customer_name || inv.customer?.name || '—'}</Td>
                  <Td>{formatDate(inv.date || inv.invoice_date)}</Td>
                  <Td>{formatDate(inv.due_date)}</Td>
                  <Td className="font-medium">{formatCurrency(inv.total)}</Td>
                  <Td><StatusBadge status={inv.status} /></Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>
    </div>
  );
}

