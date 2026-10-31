import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { invoiceService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export default function InvoicesPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceService.getAll();
      setInvoices(res.data || []);
    } catch {
      addToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice(s)`}
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Due Date</Th>
            <Th>Subtotal</Th>
            <Th>Tax</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={9} rows={6} />
          ) : invoices.length === 0 ? (
            <TableEmpty message="No invoices found" cols={9} />
          ) : (
            <TableBody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{inv.invoice_number || inv.number || `INV-${inv.id}`}</Td>
                  <Td className="font-medium">{inv.customer_name || inv.customer?.name || '—'}</Td>
                  <Td>{formatDate(inv.date || inv.invoice_date)}</Td>
                  <Td>{formatDate(inv.due_date)}</Td>
                  <Td>{formatCurrency(inv.subtotal)}</Td>
                  <Td>{formatCurrency(inv.tax)}</Td>
                  <Td className="font-medium">{formatCurrency(inv.total)}</Td>
                  <Td><StatusBadge status={inv.status} /></Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Eye} label="View" onClick={() => navigate(`/invoices/${inv.id}`)} />
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

