import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Tag, Calendar, ShoppingBag, Pencil, Percent, DollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils/quotationCalculations';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getDiscountStatus(discount) {
  const now = new Date();
  if (discount.end_date && new Date(discount.end_date) < now) {
    return { label: 'Expired', variant: 'danger' };
  }
  if (discount.usage_limit && (discount.times_used || 0) >= discount.usage_limit) {
    return { label: 'Exhausted', variant: 'warning' };
  }
  if (discount.is_active === false) {
    return { label: 'Inactive', variant: 'default' };
  }
  return { label: 'Active', variant: 'success' };
}

export function DiscountViewModal({ isOpen, onClose, discount, onEdit }) {
  if (!discount) return null;

  const status = getDiscountStatus(discount);
  const isPercentage = (discount.discount_type || 'PERCENTAGE').toUpperCase() === 'PERCENTAGE';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Discount Voucher Details" size="md">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{discount.name}</h3>
              <Badge label={status.label} variant={status.variant} />
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {discount.id}</p>
          </div>
          {onEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(discount);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </div>

        {/* Value and Applicability banner */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Discount Value</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {isPercentage ? `${discount.discount_value}%` : formatCurrency(discount.discount_value)}
            </div>
            <span className="text-[11px] text-blue-600">
              {isPercentage ? 'Percentage deduction' : 'Fixed flat deduction'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Applicable Scope</span>
            <div className="text-sm font-bold text-slate-800 mt-1 uppercase">
              {discount.applicable_to || 'ALL CATALOG ITEMS'}
            </div>
            <span className="text-[11px] text-slate-400">Products & Subscriptions</span>
          </div>
        </div>

        {/* Qualification Rules */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
          <span className="font-semibold text-slate-700 block uppercase">Eligibility Thresholds</span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-slate-400">Minimum Purchase:</span>
              <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(discount.min_purchase || 0)}</p>
            </div>
            <div>
              <span className="text-slate-400">Minimum Line Quantity:</span>
              <p className="font-bold text-slate-800 mt-0.5">{discount.min_quantity || 1} unit(s)</p>
            </div>
          </div>
        </div>

        {/* Validity & Usage Limits */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium block">Validity Period</span>
            <div className="font-medium text-slate-800">
              <div>From: {formatDate(discount.start_date)}</div>
              <div>Until: {formatDate(discount.end_date)}</div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium block">Usage Redemptions</span>
            <div className="text-sm font-bold text-slate-800 mt-0.5">
              {discount.times_used || 0} / {discount.usage_limit ? `${discount.usage_limit} Max` : 'Unlimited'}
            </div>
            <span className="text-[10px] text-slate-500">
              {discount.usage_limit
                ? `${Math.max(0, discount.usage_limit - (discount.times_used || 0))} redemption(s) remaining`
                : 'No cap configured'}
            </span>
          </div>
        </div>

        {/* Description */}
        {discount.description && (
          <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Description & Notes</span>
            <p className="text-slate-700 mt-1 leading-relaxed">{discount.description}</p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
