export function Input({
  label,
  error,
  required,
  className = '',
  containerClass = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900
          placeholder-slate-400 outline-none transition-colors
          border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100
          disabled:bg-slate-50 disabled:text-slate-500
          ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  required,
  children,
  className = '',
  containerClass = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        className={`
          w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900
          outline-none transition-colors
          border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100
          disabled:bg-slate-50 disabled:text-slate-500
          ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Textarea({
  label,
  error,
  required,
  className = '',
  containerClass = '',
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        className={`
          w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-900
          placeholder-slate-400 outline-none transition-colors resize-none
          border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100
          disabled:bg-slate-50 disabled:text-slate-500
          ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}
          ${className}
        `}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

