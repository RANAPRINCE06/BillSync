import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { customerService } from '../../services';
import { useToast } from '../../context/ToastContext';

const INITIAL = { name: '', email: '', phone: '', company: '', address: '', notes: '' };

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
        address: customer.address || '',
        notes: customer.notes || '',
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [customer, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      if (customer) {
        await customerService.update(customer.id, form);
      } else {
        await customerService.create(form);
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save customer';
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
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" value={form.name} onChange={set('name')} error={errors.name} required />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Phone" value={form.phone} onChange={set('phone')} />
          <Input label="Company" value={form.company} onChange={set('company')} />
        </div>
        <Input label="Address" value={form.address} onChange={set('address')} />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" loading={loading}>{customer ? 'Update' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

