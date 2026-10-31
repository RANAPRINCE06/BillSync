import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { planService, productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ShieldCheck } from 'lucide-react';

const INITIAL = {
  name: '',
  product_id: '',
  billing_interval: 'MONTHLY',
  price: '',
  minimum_quantity: 1,
  available_from: '',
  available_until: '',
  description: '',
  auto_close_at_end_date: true,
  allow_early_close: true,
  allow_pause: true,
  allow_renewal: true,
};

export function PlanFormModal({ isOpen, onClose, onSaved, plan }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [products, setProducts] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    productService
      .getAll()
      .then((res) => setProducts(Array.isArray(res.data) ? res.data : res.data?.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name || '',
        product_id: plan.product_id || '',
        billing_interval: (plan.billing_interval || plan.billing_cycle || 'MONTHLY').toUpperCase(),
        price: plan.price ?? '',
        minimum_quantity: plan.minimum_quantity ?? plan.min_quantity ?? 1,
        available_from: plan.available_from?.split('T')[0] || plan.start_date?.split('T')[0] || '',
        available_until: plan.available_until?.split('T')[0] || plan.available_to?.split('T')[0] || plan.end_date?.split('T')[0] || '',
        description: plan.description || '',
        auto_close_at_end_date: plan.auto_close_at_end_date ?? plan.auto_close ?? true,
        allow_early_close: plan.allow_early_close ?? true,
        allow_pause: plan.allow_pause ?? true,
        allow_renewal: plan.allow_renewal ?? true,
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [plan, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Plan name is required';
    if (form.price === '' || isNaN(form.price)) {
      e.price = 'Enter a valid plan price';
    } else if (Number(form.price) < 0) {
      e.price = 'Price must be non-negative';
    }
    if (Number(form.minimum_quantity) < 1) {
      e.minimum_quantity = 'Minimum quantity must be at least 1';
    }
    if (form.available_from && form.available_until && form.available_from > form.available_until) {
      e.available_until = 'Available until date must be after available from date';
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        product_id: form.product_id || (products.length > 0 ? products[0].id : null),
        billing_interval: form.billing_interval,
        billing_cycle: form.billing_interval.toLowerCase(),
        price: Number(form.price),
        minimum_quantity: Number(form.minimum_quantity),
        min_quantity: Number(form.minimum_quantity),
        available_from: form.available_from ? `${form.available_from}T00:00:00Z` : null,
        available_until: form.available_until ? `${form.available_until}T23:59:59Z` : null,
        available_to: form.available_until ? `${form.available_until}T23:59:59Z` : null,
        description: form.description.trim() || null,
        auto_close_at_end_date: Boolean(form.auto_close_at_end_date),
        allow_early_close: Boolean(form.allow_early_close),
        allow_pause: Boolean(form.allow_pause),
        allow_renewal: Boolean(form.allow_renewal),
        is_active: true,
      };

      if (plan) {
        await planService.update(plan.id, payload);
      } else {
        await planService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save subscription plan');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={plan ? 'Edit Subscription Plan' : 'Create Subscription Plan'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Plan Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Pro Monthly Tier / Enterprise Dedicated"
          required
        />

        {products.length > 0 && (
          <Select label="Linked Catalog Offering (Optional)" value={form.product_id} onChange={set('product_id')}>
            <option value="">Default Catalog Product / Standalone</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Sales Price: ₹{p.sales_price ?? p.price ?? 0})
              </option>
            ))}
          </Select>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Billing Frequency" value={form.billing_interval} onChange={set('billing_interval')} required>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </Select>

          <Input
            label="Plan Price (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={set('price')}
            error={errors.price}
            placeholder="0.00"
            required
          />

          <Input
            label="Minimum Quantity"
            type="number"
            min="1"
            value={form.minimum_quantity}
            onChange={set('minimum_quantity')}
            error={errors.minimum_quantity}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Availability Start Date"
            type="date"
            value={form.available_from}
            onChange={set('available_from')}
          />
          <Input
            label="Availability End Date"
            type="date"
            value={form.available_until}
            onChange={set('available_until')}
            error={errors.available_until}
          />
        </div>

        <Textarea
          label="Plan Description & Billing Terms"
          value={form.description}
          onChange={set('description')}
          placeholder="Terms of service, SLA guarantees, usage allowances, or renewal conditions..."
          rows={2}
        />

        {/* Plan Settings (Configurable Options) */}
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/80 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 uppercase tracking-wide">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Plan Rules & Settings
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2.5 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors">
              <input
                type="checkbox"
                checked={form.auto_close_at_end_date}
                onChange={(e) => setForm({ ...form, auto_close_at_end_date: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Auto-close at end date</span>
                <span className="text-[11px] text-slate-500">Automatically terminates subscription on validity expiration</span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors">
              <input
                type="checkbox"
                checked={form.allow_early_close}
                onChange={(e) => setForm({ ...form, allow_early_close: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Allow early closing</span>
                <span className="text-[11px] text-slate-500">Permits customer or admin to cancel before end date</span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors">
              <input
                type="checkbox"
                checked={form.allow_pause}
                onChange={(e) => setForm({ ...form, allow_pause: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Allow pause</span>
                <span className="text-[11px] text-slate-500">Enables temporary suspension of billing cycle</span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-400 transition-colors">
              <input
                type="checkbox"
                checked={form.allow_renewal}
                onChange={(e) => setForm({ ...form, allow_renewal: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
              />
              <div>
                <span className="text-xs font-semibold text-slate-800 block">Allow renewal</span>
                <span className="text-[11px] text-slate-500">Allows subscription renewal for consecutive billing periods</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {plan ? 'Update Plan' : 'Create Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}