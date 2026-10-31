import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { customerService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const INITIAL = {
  name: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  notes: '',
};

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
        company: customer.company || '',
        address: customer.address || customer.billing_address || '',
        notes: customer.notes || '',
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [customer, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Customer name is required';
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
        company: form.company.trim() || null,
        address: form.address.trim() || null,
        billing_address: form.address.trim() || null,
        notes: form.notes.trim() || null,
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
    <Modal isOpen={isOpen} onClose={onClose} title={customer ? 'Edit Customer' : 'Add New Customer'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Customer Name"
            value={form.name}
            onChange={set('name')}
            error={errors.name}
            placeholder="e.g. John Doe"
            required
          />
          <Input
            label="Company Name (Optional)"
            value={form.company}
            onChange={set('company')}
            placeholder="e.g. Acme Technologies"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email Address"
            type="email"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            placeholder="john@acme.com"
            required
          />
          <Input
            label="Phone Number"
            value={form.phone}
            onChange={set('phone')}
            placeholder="+91 98765 43210"
          />
        </div>

        <Textarea
          label="Billing / Postal Address"
          value={form.address}
          onChange={set('address')}
          placeholder="Street address, city, state, postal code"
          rows={2}
        />

        <Textarea
          label="Internal Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Client preferences, payment terms, or fulfillment notes..."
          rows={2}
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
