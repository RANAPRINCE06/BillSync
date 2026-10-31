import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { customerService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableEmpty } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Feedback';
import { CustomerFormModal } from './CustomerFormModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addToast = useToast();

  const [customer, setCustomer] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [custRes, subsRes, invRes] = await Promise.all([
        customerService.getById(id),
        customerService.getSubscriptions(id),
        customerService.getInvoices(id),
      ]);
      setCustomer(custRes.data);
      setSubscriptions(subsRes.data || []);
      setInvoices(invRes.data || []);
    } catch {
      addToast('Failed to load customer', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  if (loading) return <PageSpinner />;
  if (!customer) return <p className="text-sm text-slate-500">Customer not found.</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.email}</p>
        </div>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil className="w-4 h-4" /> Edit
        </Button>
      </div>

      {/* Info card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Customer Info</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {[
              ['Email', customer.email],
              ['Phone', customer.phone || '—'],
              ['Company', customer.company || '—'],
              ['Address', customer.address || '—'],
              ['Notes', customer.notes || '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-400 font-medium">{label}</p>
                <p className="text-sm text-slate-700 mt-0.5">{value}</p>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Subscriptions */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
          <Table>
            <TableHead>
              <Th>Plan</Th>
              <Th>Start Date</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
            </TableHead>
            {subscriptions.length === 0 ? (
              <TableEmpty message="No subscriptions" cols={4} />
            ) : (
              <TableBody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.plan_name || s.plan?.name || '—'}</Td>
                    <Td>{formatDate(s.start_date)}</Td>
                    <Td>{formatDate(s.expiry_date || s.end_date)}</Td>
                    <Td><StatusBadge status={s.status} /></Td>
                  </tr>
                ))}
              </TableBody>
            )}
          </Table>
        </Card>
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Date</Th>
            <Th>Due Date</Th>
            <Th>Total</Th>
            <Th>Status</Th>
          </TableHead>
          {invoices.length === 0 ? (
            <TableEmpty message="No invoices" cols={5} />
          ) : (
            <TableBody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <Td className="font-mono text-xs">{inv.invoice_number || inv.number}</Td>
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

      <CustomerFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); fetchData(); addToast('Customer updated', 'success'); }}
        customer={customer}
      />
    </div>
  );
}

