import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { quotationService } from '../../services';
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
function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export default function QuotationsPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await quotationService.getAll();
      setQuotations(res.data || []);
    } catch {
      addToast('Failed to load quotations', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle={`${quotations.length} quotation(s)`}
        action={
          <Button onClick={() => navigate('/quotations/new')}>
            <Plus className="w-4 h-4" /> New Quotation
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Ref #</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Subtotal</Th>
            <Th>Discount</Th>
            <Th>Tax</Th>
            <Th>Total</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={9} rows={5} />
          ) : quotations.length === 0 ? (
            <TableEmpty message="No quotations found" cols={9} />
          ) : (
            <TableBody>
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{q.reference || q.number || `QT-${q.id}`}</Td>
                  <Td>{q.customer_name || q.customer?.name || '—'}</Td>
                  <Td>{formatDate(q.date || q.created_at)}</Td>
                  <Td>{formatCurrency(q.subtotal)}</Td>
                  <Td>{formatCurrency(q.discount)}</Td>
                  <Td>{formatCurrency(q.tax)}</Td>
                  <Td className="font-medium">{formatCurrency(q.total)}</Td>
                  <Td><StatusBadge status={q.status} /></Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Eye} label="View" onClick={() => navigate(`/quotations/${q.id}`)} />
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

