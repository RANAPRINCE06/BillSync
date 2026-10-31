import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { planService, productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const INITIAL = {
  name: '',
  product_id: '',
  billing_interval: 'MONTHLY',
  price: '',
  minimum_quantity: 1,
  available_from: '',
  available_until: '',
  description: '',
  allow_pause: true,
  allow_renewal: true,
  allow_early_close: true,
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
        allow_pause: plan.allow_pause ?? true,
        allow_renewal: plan.allow_renewal ?? true,
        allow_early_close: plan.allow_early_close ?? true,
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
        allow_pause: Boolean(form.allow_pause),
        allow_renewal: Boolean(form.allow_renewal),
        allow_early_close: Boolean(form.allow_early_close),
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
    <Modal isOpen={isOpen} onClose={onClose} title={plan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Plan Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Pro Monthly Tier"
          required
        />

        {products.length > 0 && (
          <Select label="Linked Catalog Product" value={form.product_id} onChange={set('product_id')}>
            <option value="">Default Product / Standalone</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Sales Price: ₹{p.sales_price ?? p.price ?? 0})
              </option>
            ))}
          </Select>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select label="Billing Interval" value={form.billing_interval} onChange={set('billing_interval')} required>
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
        </div>

        <Input
          label="Minimum Required Quantity"
          type="number"
          min="1"
          value={form.minimum_quantity}
          onChange={set('minimum_quantity')}
          error={errors.minimum_quantity}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Available From"
            type="date"
            value={form.available_from}
            onChange={set('available_from')}
          />
          <Input
            label="Available Until"
            type="date"
            value={form.available_until}
            onChange={set('available_until')}
            error={errors.available_until}
          />
        </div>

        <Textarea
          label="Description / Terms"
          value={form.description}
          onChange={set('description')}
          placeholder="Plan description and billing details"
          rows={2}
        />

        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.allow_pause}
              onChange={(e) => setForm({ ...form, allow_pause: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Allow Pause
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.allow_renewal}
              onChange={(e) => setForm({ ...form, allow_renewal: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Allow Renewal
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.allow_early_close}
              onChange={(e) => setForm({ ...form, allow_early_close: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Allow Early Close
          </label>
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
