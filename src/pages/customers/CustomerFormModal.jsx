import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { customerService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const INITIAL = { name: '', email: '', phone: '', billing_address: '' };

export function CustomerFormModal({ isOpen, onClose, onSaved, customer }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        billing_address: customer.billing_address || customer.address || '',
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [customer, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address';
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
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        billing_address: form.billing_address.trim() || null,
      };

      if (customer) {
        await customerService.update(customer.id, payload);
      } else {
        await customerService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save customer');
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
    <Modal isOpen={isOpen} onClose={onClose} title={customer ? 'Edit Customer' : 'Add Customer'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Full Name / Company Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Acme Corp"
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email Address"
            type="email"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            placeholder="billing@acme.com"
            required
          />
          <Input
            label="Phone Number"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+1 555-0199"
          />
        </div>
        <Textarea
          label="Billing Address"
          value={form.billing_address}
          onChange={set('billing_address')}
          placeholder="Street address, city, state, postal code"
          rows={3}
        />
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {customer ? 'Update Customer' : 'Create Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
