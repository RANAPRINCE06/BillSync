import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Eye, Filter, CheckCircle2, XCircle } from 'lucide-react';
import { planService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { PlanFormModal } from './PlanFormModal';
import { PlanViewModal } from './PlanViewModal';

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FREQUENCY_OPTIONS = [
  { value: 'ALL', label: 'All Billing Frequencies' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export default function PlansPage() {
  const addToast = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [viewPlan, setViewPlan] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, plan: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (frequencyFilter !== 'ALL') params.interval = frequencyFilter;
      const res = await planService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setPlans(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load subscription plans'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, frequencyFilter]);

  useEffect(() => {
    const t = setTimeout(fetchPlans, 250);
    return () => clearTimeout(t);
  }, [fetchPlans]);

  const openAdd = () => {
    setEditPlan(null);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditPlan(p);
    setModalOpen(true);
  };

  const openView = (p) => {
    setViewPlan(p);
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
      addToast('Plan deleted successfully', 'info');
      fetchPlans();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete plan'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, plan: null });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscription Plans"
        subtitle={`${plans.length} configured recurring plan(s) with lifecycle rules`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Plan
          </Button>
        }
      />

      <Card>
        {/* Search and Filter */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plans by name or terms..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Table>
          <TableHead>
            <Th>Plan Name</Th>
            <Th>Billing Frequency</Th>
            <Th>Price</Th>
            <Th>Min Qty</Th>
            <Th>Availability Window</Th>
            <Th>Configured Settings</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : plans.length === 0 ? (
            <TableEmpty message="No subscription plans found matching your criteria." cols={7} />
          ) : (
            <TableBody>
              {plans.map((p) => {
                const autoClose = Boolean(p.auto_close_at_end_date ?? p.auto_close);
                const allowPause = Boolean(p.allow_pause);
                const allowRenewal = Boolean(p.allow_renewal);
                const allowEarlyClose = Boolean(p.allow_early_close);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <button
                        type="button"
                        onClick={() => openView(p)}
                        className="text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {p.name}
                      </button>
                      {p.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={p.billing_interval || p.billing_cycle} />
                    </Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(p.price)}</Td>
                    <Td>{p.minimum_quantity ?? p.min_quantity ?? 1}</Td>
                    <Td className="text-xs text-slate-600">
                      <div>From: {formatDate(p.available_from || p.start_date)}</div>
                      <div className="text-slate-400">Until: {formatDate(p.available_until || p.available_to || p.end_date)}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            autoClose ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={autoClose ? 'Auto-close at end date enabled' : 'Auto-close disabled'}
                        >
                          Auto-Close: {autoClose ? 'Yes' : 'No'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            allowEarlyClose ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={allowEarlyClose ? 'Early closing allowed' : 'Early closing disabled'}
                        >
                          Early Close
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            allowPause ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={allowPause ? 'Pause allowed' : 'Pause not allowed'}
                        >
                          Pause
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            allowRenewal ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={allowRenewal ? 'Renewal allowed' : 'Renewal not allowed'}
                        >
                          Renew
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Eye}
                          label="View Plan Details"
                          onClick={() => openView(p)}
                          className="text-slate-500 hover:text-blue-600"
                        />
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
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>

      {/* Form Modal (Add/Edit) */}
      <PlanFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        plan={editPlan}
      />

      {/* View Modal */}
      <PlanViewModal
        isOpen={Boolean(viewPlan)}
        onClose={() => setViewPlan(null)}
        plan={viewPlan}
        onEdit={(p) => openEdit(p)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, plan: null })}
        onConfirm={handleDelete}
        title="Delete Subscription Plan"
        message={`Are you sure you want to delete ${deleteModal.plan?.name}? Existing active customer subscriptions created under this plan will remain valid.`}
        confirmLabel="Delete Plan"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}