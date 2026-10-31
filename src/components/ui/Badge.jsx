export function Badge({ label, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant] || variants.default}`}>
      {label}
    </span>
  );
}

const STATUS_MAP = {
  // Subscription
  active: { label: 'Active', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' },
  expired: { label: 'Expired', variant: 'danger' },
  closed: { label: 'Closed', variant: 'danger' },
  pending: { label: 'Pending', variant: 'info' },
  // Invoice
  draft: { label: 'Draft', variant: 'default' },
  confirmed: { label: 'Confirmed', variant: 'info' },
  sent: { label: 'Sent', variant: 'purple' },
  paid: { label: 'Paid', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  // Quotation
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  converted: { label: 'Converted', variant: 'purple' },
  // Payment
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

export function StatusBadge({ status }) {
  const config = STATUS_MAP[status?.toLowerCase()] || { label: status || 'Unknown', variant: 'default' };
  return <Badge label={config.label} variant={config.variant} />;
}

