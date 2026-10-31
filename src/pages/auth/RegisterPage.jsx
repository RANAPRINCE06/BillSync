import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Check, X } from 'lucide-react';
import { authService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export default function RegisterPage() {
  const addToast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const passwordRules = [
    { label: 'Longer than 8 characters (at least 9)', valid: form.password.length > 8 },
    { label: 'At least one uppercase letter', valid: /[A-Z]/.test(form.password) },
    { label: 'At least one lowercase letter', valid: /[a-z]/.test(form.password) },
    { label: 'At least one numeric digit', valid: /[0-9]/.test(form.password) },
    { label: 'At least one special character (!@#$%^&*)', valid: /[!@#$%^&*(),.?":{}|<>]/.test(form.password) },
  ];

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address';

    if (!form.password) {
      e.password = 'Password is required';
    } else if (passwordRules.some((r) => !r.valid)) {
      e.password = 'Password must meet all complexity requirements';
    }

    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
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
      await authService.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      addToast('Registration successful! Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      const msg = getErrorMessage(err, 'Registration failed. Please try again.');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create an account</h1>
          <p className="text-sm text-slate-500 mt-1">Get started with BillSync</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Full name"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
              error={errors.name}
              required
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: '' }); }}
              error={errors.email}
              required
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Strong password"
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: '' }); }}
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white outline-none focus:ring-2 ${
                    errors.password
                      ? 'border-red-400 focus:ring-red-100'
                      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100'
                  }`}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}

              {/* Real-time complexity check */}
              {form.password && (
                <div className="mt-2 p-2.5 bg-slate-50 rounded-lg space-y-1 text-xs">
                  {passwordRules.map((rule, idx) => (
                    <div key={idx} className={`flex items-center gap-1.5 ${rule.valid ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {rule.valid ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat password"
              value={form.confirm}
              onChange={(e) => { setForm({ ...form, confirm: e.target.value }); setErrors({ ...errors, confirm: '' }); }}
              error={errors.confirm}
              required
            />

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
