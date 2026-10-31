import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { planService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PlanFormModal } from './PlanFormModal';

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PlansPage() {
  const addToast = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, plan: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planService.getAll();
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setPlans(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load subscription plans'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openAdd = () => {
    setEditPlan(null);
    setModalOpen(true);
  };
  const openEdit = (p) => {
    setEditPlan(p);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    fetchPlans();
    addToast(editPlan ? 'Plan updated successfully' : 'Plan created successfully', 'success');
  };

  const handleDelete = async () => {
    if (!deleteModal.plan) return;
    setActionLoading(true);
    try {
      await planService.delete(deleteModal.plan.id);
      addToast('Plan deleted', 'info');
      fetchPlans();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete plan'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, plan: null });
    }
  };

  return (
    <div>
      <PageHeader
        title="Subscription Plans"
        subtitle={`${plans.length} active recurring billing plan(s)`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Plan
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Plan Name</Th>
            <Th>Billing Interval</Th>
            <Th>Price</Th>
            <Th>Min Qty</Th>
            <Th>Available From</Th>
            <Th>Available Until</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : plans.length === 0 ? (
            <TableEmpty message="No subscription plans configured yet." cols={7} />
          ) : (
            <TableBody>
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <Td>
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={p.billing_interval || p.billing_cycle} />
                  </Td>
                  <Td className="font-semibold text-slate-900">{formatCurrency(p.price)}</Td>
                  <Td>{p.minimum_quantity ?? p.min_quantity ?? 1}</Td>
                  <Td>{formatDate(p.available_from || p.start_date)}</Td>
                  <Td>{formatDate(p.available_until || p.available_to || p.end_date)}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <IconButton icon={Pencil} label="Edit plan" onClick={() => openEdit(p)} />
                      <IconButton
                        icon={Trash2}
                        label="Delete plan"
                        onClick={() => setDeleteModal({ open: true, plan: p })}
                        className="text-red-400 hover:text-red-600"
                      />
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

      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, plan: null })}
        onConfirm={handleDelete}
        title="Delete Subscription Plan"
        message={`Are you sure you want to delete ${deleteModal.plan?.name}? Existing active subscriptions on this plan will remain valid.`}
        confirmLabel="Delete Plan"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
