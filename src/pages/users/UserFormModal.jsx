import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { userService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const INITIAL = {
  name: '',
  email: '',
  role: 'STAFF',
  is_active: true,
};

export function UserFormModal({ isOpen, onClose, onSaved, user }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        role: (user.role || 'STAFF').toUpperCase(),
        is_active: user.is_active ?? true,
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [user, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
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
        email: form.email.trim().toLowerCase(),
        role: form.role,
        is_active: Boolean(form.is_active),
      };

      if (user) {
        await userService.update(user.id, payload);
      } else {
        await userService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save user account');
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
    <Modal isOpen={isOpen} onClose={onClose} title={user ? 'Edit Staff Details' : 'Add Staff Member'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Full Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Alex Morgan"
          required
        />
        <Input
          label="Email Address"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          placeholder="alex@billsync.com"
          disabled={!!user}
          required
        />

        <Select label="Assigned System Role" value={form.role} onChange={set('role')} required>
          <option value="STAFF">Staff (Operations & Client Management)</option>
          <option value="ADMIN">Admin (Full Access & Settings)</option>
          <option value="CUSTOMER">Customer (Self-service Portal Only)</option>
        </Select>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="user_is_active"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="user_is_active" className="text-sm font-medium text-slate-700">
            Account Active (Permit login)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {user ? 'Save Changes' : 'Create Staff Member'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

