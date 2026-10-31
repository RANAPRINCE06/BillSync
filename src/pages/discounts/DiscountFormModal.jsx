import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { discountService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const INITIAL = {
  name: '',
  discount_type: 'PERCENTAGE',
  discount_value: '',
  min_purchase: 0,
  min_quantity: 1,
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  usage_limit: '',
  applicable_to: 'ALL',
  description: '',
  is_active: true,
};

export function DiscountFormModal({ isOpen, onClose, onSaved, discount }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (discount) {
      setForm({
        name: discount.name || '',
        discount_type: discount.discount_type || 'PERCENTAGE',
        discount_value: discount.discount_value ?? '',
        min_purchase: discount.min_purchase ?? 0,
        min_quantity: discount.min_quantity ?? 1,
        start_date: discount.start_date ? discount.start_date.split('T')[0] : '',
        end_date: discount.end_date ? discount.end_date.split('T')[0] : '',
        usage_limit: discount.usage_limit ?? '',
        applicable_to: discount.applicable_to || 'ALL',
        description: discount.description || '',
        is_active: discount.is_active ?? true,
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [discount, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Discount voucher name is required';
    if (form.discount_value === '' || isNaN(form.discount_value)) {
      e.discount_value = 'Enter a valid discount value';
    } else if (Number(form.discount_value) <= 0) {
      e.discount_value = 'Discount value must be greater than zero';
    } else if (form.discount_type === 'PERCENTAGE' && Number(form.discount_value) > 100) {
      e.discount_value = 'Percentage discount cannot exceed 100%';
    }

    if (form.min_purchase !== '' && Number(form.min_purchase) < 0) {
      e.min_purchase = 'Minimum purchase cannot be negative';
    }
    if (Number(form.min_quantity) < 1) {
      e.min_quantity = 'Minimum quantity must be at least 1';
    }
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      e.end_date = 'End date cannot precede the start date';
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
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_purchase: Number(form.min_purchase) || 0,
        min_quantity: Number(form.min_quantity) || 1,
        start_date: form.start_date ? `${form.start_date}T00:00:00Z` : null,
        end_date: form.end_date ? `${form.end_date}T23:59:59Z` : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        applicable_to: form.applicable_to,
        description: form.description.trim() || null,
        is_active: Boolean(form.is_active),
      };

      if (discount) {
        await discountService.update(discount.id, payload);
      } else {
        await discountService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save discount');
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
    <Modal isOpen={isOpen} onClose={onClose} title={discount ? 'Edit Discount Voucher' : 'Create New Discount Voucher'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Discount Voucher Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Diwali Enterprise Promo / Flat 500 Onboarding"
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Discount Type" value={form.discount_type} onChange={set('discount_type')} required>
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED">Fixed Amount (₹)</option>
          </Select>

          <Input
            label={form.discount_type === 'PERCENTAGE' ? 'Discount Percentage (%) *' : 'Discount Flat Amount (₹) *'}
            type="number"
            min="0.01"
            max={form.discount_type === 'PERCENTAGE' ? '100' : undefined}
            step="0.01"
            value={form.discount_value}
            onChange={set('discount_value')}
            error={errors.discount_value}
            placeholder={form.discount_type === 'PERCENTAGE' ? '15' : '500'}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Minimum Purchase (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.min_purchase}
            onChange={set('min_purchase')}
            error={errors.min_purchase}
            placeholder="0.00"
          />

          <Input
            label="Minimum Quantity"
            type="number"
            min="1"
            value={form.min_quantity}
            onChange={set('min_quantity')}
            error={errors.min_quantity}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={form.start_date}
            onChange={set('start_date')}
          />

          <Input
            label="End Date"
            type="date"
            value={form.end_date}
            onChange={set('end_date')}
            error={errors.end_date}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Usage Limit (Max Redemptions)"
            type="number"
            min="1"
            value={form.usage_limit}
            onChange={set('usage_limit')}
            placeholder="Unlimited if left empty"
          />

          <Select label="Applicable Catalog Scope" value={form.applicable_to} onChange={set('applicable_to')}>
            <option value="ALL">All Catalog Offerings</option>
            <option value="PRODUCTS">Products Only</option>
            <option value="SUBSCRIPTIONS">Subscription Plans Only</option>
          </Select>
        </div>

        <Textarea
          label="Description & Campaign Notes"
          value={form.description}
          onChange={set('description')}
          placeholder="Promotional campaign details, target customer tier, or qualification notes..."
          rows={2}
        />

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="is_active_disc"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="is_active_disc" className="text-xs font-medium text-slate-700 cursor-pointer">
            Voucher is active and ready for quotation & invoice redemptions
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {discount ? 'Update Voucher' : 'Create Voucher'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}