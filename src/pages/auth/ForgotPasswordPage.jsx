import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';
import { authService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export default function ForgotPasswordPage() {
  const addToast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email'); return; }
    setLoading(true);
    try {
      await authService.forgotPassword({ email });
      setSent(true);
      addToast('Reset instructions sent to your email.', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to send reset email.';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <img src="/logo.png" alt="BillSync Logo" className="w-16 h-16 object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">Enter your email and we'll send reset instructions</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-4 mb-4">
                Check your inbox for password reset instructions.
              </p>
              <Link to="/login" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Input label="Email address" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                error={error} required />
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                Send Reset Link
              </Button>
              <Link to="/login" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mt-2">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

