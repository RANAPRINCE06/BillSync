import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { planService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PlanFormModal } from './PlanFormModal';

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CYCLE_BADGE = {
  daily: 'default', weekly: 'info', monthly: 'success', yearly: 'purple',
};

export default function PlansPage() {
  const addToast = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planService.getAll();
      setPlans(res.data || []);
    } catch {
      addToast('Failed to load plans', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openAdd = () => { setEditPlan(null); setModalOpen(true); };
  const openEdit = (p) => { setEditPlan(p); setModalOpen(true); };
  const handleSaved = () => {
    setModalOpen(false);
    fetchPlans();
    addToast(editPlan ? 'Plan updated' : 'Plan created', 'success');
  };

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        subtitle={`${plans.length} plan(s)`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Plan
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Name</Th>
            <Th>Billing Cycle</Th>
            <Th>Price</Th>
            <Th>Min Qty</Th>
            <Th>Available From</Th>
            <Th>Available To</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : plans.length === 0 ? (
            <TableEmpty message="No subscription plans found" cols={7} />
          ) : (
            <TableBody>
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>}
                  </Td>
                  <Td>
                    <Badge label={p.billing_cycle} variant={CYCLE_BADGE[p.billing_cycle] || 'default'} />
                  </Td>
                  <Td className="font-medium">{formatCurrency(p.price)}</Td>
                  <Td>{p.min_quantity ?? 1}</Td>
                  <Td>{formatDate(p.available_from || p.start_date)}</Td>
                  <Td>{formatDate(p.available_to || p.end_date)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Pencil} label="Edit" onClick={() => openEdit(p)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      <PlanFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        plan={editPlan}
      />
    </div>
  );
}

