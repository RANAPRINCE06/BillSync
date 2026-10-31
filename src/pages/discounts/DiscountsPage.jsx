import { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Pencil, Trash2, Filter, Percent, Tag } from 'lucide-react';
import { discountService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/quotationCalculations';
import { DiscountFormModal } from './DiscountFormModal';
import { DiscountViewModal, getDiscountStatus } from './DiscountViewModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'EXHAUSTED', label: 'Exhausted' },
];

export default function DiscountsPage() {
  const addToast = useToast();
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editDiscount, setEditDiscount] = useState(null);
  const [viewDiscount, setViewDiscount] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, discount: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const res = await discountService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setDiscounts(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load discount vouchers'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchDiscounts, 250);
    return () => clearTimeout(t);
  }, [fetchDiscounts]);

  const openAdd = () => {
    setEditDiscount(null);
    setFormOpen(true);
  };

  const openEdit = (d) => {
    setEditDiscount(d);
    setFormOpen(true);
  };

  const openView = (d) => {
    setViewDiscount(d);
  };

  const handleSaved = () => {
    setFormOpen(false);
    fetchDiscounts();
    addToast(editDiscount ? 'Discount voucher updated successfully' : 'Discount voucher created successfully', 'success');
  };

  const handleDelete = async () => {
    if (!deleteModal.discount) return;
    setActionLoading(true);
    try {
      await discountService.delete(deleteModal.discount.id);
      addToast('Discount voucher deleted', 'info');
      fetchDiscounts();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete discount voucher'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, discount: null });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Discounts & Vouchers"
        subtitle={`${discounts.length} promotional rule(s) and discount vouchers`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Discount
          </Button>
        }
      />

      <Card>
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search discounts by name or campaign notes..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Discounts Table */}
        <Table>
          <TableHead>
            <Th>Voucher Name</Th>
            <Th>Type & Value</Th>
            <Th>Scope</Th>
            <Th>Eligibility</Th>
            <Th>Validity Window</Th>
            <Th>Usage Limit</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={8} rows={5} />
          ) : discounts.length === 0 ? (
            <TableEmpty message="No discount vouchers found matching your filter criteria." cols={8} />
          ) : (
            <TableBody>
              {discounts.map((d) => {
                const status = getDiscountStatus(d);
                const isPercentage = (d.discount_type || 'PERCENTAGE').toUpperCase() === 'PERCENTAGE';

                return (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <button
                        type="button"
                        onClick={() => openView(d)}
                        className="text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {d.name}
                      </button>
                      {d.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{d.description}</div>
                      )}
                    </Td>
                    <Td className="font-bold text-slate-900">
                      {isPercentage ? `${d.discount_value}%` : formatCurrency(d.discount_value)}
                      <span className="block text-[10px] font-normal text-slate-400">
                        {isPercentage ? 'Percentage' : 'Flat deduction'}
                      </span>
                    </Td>
                    <Td>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                        {d.applicable_to || 'ALL'}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      <div>Min: {formatCurrency(d.min_purchase || 0)}</div>
                      <div className="text-slate-400">Min Qty: {d.min_quantity || 1}</div>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      <div>From: {formatDate(d.start_date)}</div>
                      <div className="text-slate-400">Until: {formatDate(d.end_date)}</div>
                    </Td>
                    <Td className="text-xs text-slate-800 font-medium">
                      {d.times_used || 0} / {d.usage_limit ? d.usage_limit : '∞'}
                    </Td>
                    <Td>
                      <Badge label={status.label} variant={status.variant} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Eye}
                          label="View discount"
                          onClick={() => openView(d)}
                          className="text-slate-500 hover:text-blue-600"
                        />
                        <IconButton icon={Pencil} label="Edit discount" onClick={() => openEdit(d)} />
                        <IconButton
                          icon={Trash2}
                          label="Delete discount"
                          onClick={() => setDeleteModal({ open: true, discount: d })}
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

      {/* Form Modal (Add / Edit) */}
      <DiscountFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        discount={editDiscount}
      />

      {/* View Modal */}
      <DiscountViewModal
        isOpen={Boolean(viewDiscount)}
        onClose={() => setViewDiscount(null)}
        discount={viewDiscount}
        onEdit={(d) => openEdit(d)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, discount: null })}
        onConfirm={handleDelete}
        title="Delete Discount Voucher"
        message={`Are you sure you want to delete discount voucher "${deleteModal.discount?.name}"? Existing quotations referencing this voucher will not be modified.`}
        confirmLabel="Delete Voucher"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
