import { Loader2 } from 'lucide-react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  ...props
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 focus:ring-slate-400',
    danger: 'bg-red-600 text-white border-red-600 hover:bg-red-700 focus:ring-red-500',
    ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 focus:ring-slate-400',
    success: 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
    warning: 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600 focus:ring-amber-400',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      title={label}
      className={`p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors ${className}`}
      {...props}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

