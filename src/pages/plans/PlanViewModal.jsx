import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Pencil, CheckCircle2, XCircle, Calendar, DollarSign, Layers, ShieldCheck } from 'lucide-react';

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PlanViewModal({ isOpen, onClose, plan, onEdit }) {
  if (!plan) return null;

  const frequency = (plan.billing_interval || plan.billing_cycle || 'MONTHLY').toUpperCase();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Subscription Plan Details" size="md">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={frequency} />
              <span className="text-xs text-slate-400 font-mono">ID: {plan.id}</span>
            </div>
          </div>
          {onEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(plan);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Plan
            </Button>
          )}
        </div>

        {/* Pricing & Min Quantity Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Recurring Price</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(plan.price)}</div>
            <span className="text-[11px] text-blue-600">Billed {frequency.toLowerCase()}</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Minimum Quantity</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{plan.minimum_quantity ?? plan.min_quantity ?? 1}</div>
            <span className="text-[11px] text-slate-400">Seat(s) or unit(s) required</span>
          </div>
        </div>

        {/* Availability Dates */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" /> Availability Window
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400">Available From:</span>
              <p className="font-medium text-slate-800">{formatDate(plan.available_from || plan.start_date)}</p>
            </div>
            <div>
              <span className="text-slate-400">Available Until:</span>
              <p className="font-medium text-slate-800">{formatDate(plan.available_until || plan.available_to || plan.end_date)}</p>
            </div>
          </div>
        </div>

        {/* Plan Settings (Configurable Options) */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Plan Rules & Configurable Options
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                label: 'Auto-close at end date',
                desc: 'Subscription terminates automatically when end date is reached',
                active: Boolean(plan.auto_close_at_end_date ?? plan.auto_close),
              },
              {
                label: 'Allow early closing',
                desc: 'Client or staff can terminate before term completion',
                active: Boolean(plan.allow_early_close),
              },
              {
                label: 'Allow pause',
                desc: 'Subscriptions on this plan can be paused temporarily',
                active: Boolean(plan.allow_pause),
              },
              {
                label: 'Allow renewal',
                desc: 'Recurring term can be renewed upon expiration',
                active: Boolean(plan.allow_renewal),
              },
            ].map((setting, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${
                  setting.active
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {setting.active ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold">{setting.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{setting.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Description / Terms */}
        <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Description & Billing Terms</span>
          <p className="text-xs text-slate-700 leading-relaxed">
            {plan.description || <span className="text-slate-400 italic">No description provided for this plan.</span>}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}