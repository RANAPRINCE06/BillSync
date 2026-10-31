export function Badge({ label, variant = 'default' }) {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-red-50 text-red-700 border border-red-200',
    info: 'bg-blue-50 text-blue-700 border border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border border-orange-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant] || variants.default}`}>
      {label}
    </span>
  );
}

const STATUS_MAP = {
  // SubscriptionStatus
  draft: { label: 'Draft', variant: 'default' },
  quotation: { label: 'Quotation', variant: 'info' },
  confirmed: { label: 'Confirmed', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  paused: { label: 'Paused', variant: 'warning' },
  closed: { label: 'Closed', variant: 'danger' },
  expired: { label: 'Expired', variant: 'danger' },

  // InvoiceStatus
  sent: { label: 'Sent', variant: 'purple' },
  paid: { label: 'Paid', variant: 'success' },
  partially_paid: { label: 'Partially Paid', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'danger' },

  // QuotationStatus
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },

  // PaymentStatus
  pending: { label: 'Pending', variant: 'warning' },
  successful: { label: 'Successful', variant: 'success' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  refunded: { label: 'Refunded', variant: 'purple' },

  // BillingInterval
  daily: { label: 'Daily', variant: 'default' },
  weekly: { label: 'Weekly', variant: 'info' },
  monthly: { label: 'Monthly', variant: 'success' },
  yearly: { label: 'Yearly', variant: 'purple' },

  // ProductType
  service: { label: 'Service', variant: 'info' },
  physical: { label: 'Physical', variant: 'orange' },
  digital: { label: 'Digital', variant: 'purple' },
  subscription: { label: 'Subscription', variant: 'success' },
};

export function StatusBadge({ status }) {
  if (!status) return <Badge label="—" variant="default" />;
  const normalized = String(status).toLowerCase().replace(/[\s-]/g, '_');
  const config = STATUS_MAP[normalized] || {
    label: String(status).replace(/_/g, ' '),
    variant: 'default',
  };
  return <Badge label={config.label} variant={config.variant} />;
}
