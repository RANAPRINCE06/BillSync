import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export default function LoginPage() {
  const { login, loginAsDemo } = useAuth();
  const addToast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: 'admin@billsync.com', password: 'Admin@12345' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const demoAccounts = [
    { role: 'Admin', email: 'admin@billsync.com', pass: 'Admin@12345', icon: ShieldCheck, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { role: 'Staff', email: 'staff@billsync.com', pass: 'Staff@12345', icon: UserCheck, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    { role: 'Customer', email: 'customer@billsync.com', pass: 'Customer@12345', icon: Users, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  ];

  const validate = () => {
    const e = {};
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    return e;
  };

  const handleQuickLogin = (acc) => {
    setForm({ email: acc.email, password: acc.pass });
    const user = loginAsDemo(acc.role);
    addToast(`Signed in as demo ${acc.role}!`, 'success');
    navigate(user.role === 'CUSTOMER' ? '/portal' : '/');
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
      const user = await login({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      addToast('Welcome back to BillSync!', 'success');
      const role = (user?.role || '').toUpperCase();
      navigate(role === 'CUSTOMER' ? '/portal' : '/');
    } catch (err) {
      const msg = getErrorMessage(err, 'Invalid email or password');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-3 shadow-md shadow-blue-500/20">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign in to BillSync</h1>
          <p className="text-sm text-slate-500 mt-1">Subscription Management System</p>
        </div>

        {/* Demo Credentials Box */}
        <div className="mb-5 bg-white rounded-xl border border-blue-100 p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Demo Accounts (Click to Sign In)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {demoAccounts.map((acc) => {
              const Icon = acc.icon;
              return (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  className={`p-2 rounded-lg border text-left transition-all hover:scale-[1.02] cursor-pointer ${acc.color}`}
                >
                  <div className="flex items-center gap-1 font-semibold text-xs">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{acc.role}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate mt-1">{acc.email}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                setErrors({ ...errors, email: '' });
              }}
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
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    setErrors({ ...errors, password: '' });
                  }}
                  className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-white outline-none focus:ring-2 ${
                    errors.password
                      ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
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
            </div>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 font-medium hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
