import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { planService } from '../../services';
import { useToast } from '../../context/ToastContext';

const INITIAL = {
  name: '', description: '', billing_cycle: 'monthly',
  price: '', min_quantity: 1, available_from: '', available_to: '',
};

export function PlanFormModal({ isOpen, onClose, onSaved, plan }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name || '',
        description: plan.description || '',
        billing_cycle: plan.billing_cycle || 'monthly',
        price: plan.price ?? '',
        min_quantity: plan.min_quantity ?? 1,
        available_from: plan.available_from?.split('T')[0] || plan.start_date?.split('T')[0] || '',
        available_to: plan.available_to?.split('T')[0] || plan.end_date?.split('T')[0] || '',
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [plan, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Plan name is required';
    if (form.price === '' || isNaN(form.price)) e.price = 'Enter a valid price';
    else if (Number(form.price) < 0) e.price = 'Price must be positive';
    if (Number(form.min_quantity) < 1) e.min_quantity = 'Minimum quantity must be at least 1';
    if (form.available_from && form.available_to && form.available_from > form.available_to) {
      e.available_to = 'End date must be after start date';
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        min_quantity: Number(form.min_quantity),
        available_from: form.available_from || null,
        available_to: form.available_to || null,
      };
      if (plan) {
        await planService.update(plan.id, payload);
      } else {
        await planService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save plan';
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
    <Modal isOpen={isOpen} onClose={onClose} title={plan ? 'Edit Plan' : 'Create Plan'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input label="Plan Name" value={form.name} onChange={set('name')} error={errors.name} required />
        <Textarea label="Description" value={form.description} onChange={set('description')} rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Billing Cycle" value={form.billing_cycle} onChange={set('billing_cycle')} required>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
          <Input label="Price" type="number" min="0" step="0.01" value={form.price}
            onChange={set('price')} error={errors.price} required />
        </div>
        <Input label="Minimum Quantity" type="number" min="1" value={form.min_quantity}
          onChange={set('min_quantity')} error={errors.min_quantity} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Available From" type="date" value={form.available_from} onChange={set('available_from')} />
          <Input label="Available To" type="date" value={form.available_to}
            onChange={set('available_to')} error={errors.available_to} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" loading={loading}>{plan ? 'Update' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

