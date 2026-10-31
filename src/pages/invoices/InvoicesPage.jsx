import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Printer, CreditCard, Filter } from 'lucide-react';
import { invoiceService, paymentService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { formatCurrency } from '../../utils/quotationCalculations';
import { RecordPaymentModal } from '../payments/RecordPaymentModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function InvoicesPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Record payment modal
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const res = await invoiceService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setInvoices(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load invoices'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchInvoices, 250);
    return () => clearTimeout(t);
  }, [fetchInvoices]);

  const handlePrint = (e, invId) => {
    e.stopPropagation();
    navigate(`/invoices/${invId}?print=true`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices & Billing"
        subtitle={`${invoices.length} generated customer invoice(s)`}
      />

      <Card>
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, client, company, or subscription..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Invoices Table */}
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer & Company</Th>
            <Th>Subscription Ref</Th>
            <Th>Issue Date</Th>
            <Th>Due Date</Th>
            <Th>Subtotal</Th>
            <Th>Discounts</Th>
            <Th>Taxes</Th>
            <Th>Total</Th>
            <Th>Paid</Th>
            <Th>Outstanding</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={13} rows={6} />
          ) : invoices.length === 0 ? (
            <TableEmpty message="No invoices found matching your filter criteria." cols={13} />
          ) : (
            <TableBody>
              {invoices.map((inv) => {
                const balanceDue = inv.balance_due !== undefined
                  ? inv.balance_due
                  : Math.max(0, (inv.total || 0) - (inv.amount_paid || 0));
                const canPay = balanceDue > 0 && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT';

                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="font-mono text-xs font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {inv.invoice_number || inv.number || `INV-${inv.id}`}
                      </button>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-900">{inv.customer_name || inv.customer?.name || '—'}</div>
                      {inv.company && <div className="text-xs text-slate-400">{inv.company}</div>}
                    </Td>
                    <Td className="font-mono text-xs text-slate-500">
                      {inv.subscription_id ? (
                        <span className="text-blue-600">#{inv.subscription_id}</span>
                      ) : (
                        <span className="text-slate-400 italic">Direct Sale</span>
                      )}
                    </Td>
                    <Td>{formatDate(inv.issue_date || inv.date || inv.invoice_date)}</Td>
                    <Td>{formatDate(inv.due_date)}</Td>
                    <Td>{formatCurrency(inv.subtotal)}</Td>
                    <Td className="text-emerald-700">
                      {Number(inv.discount_amount) > 0 ? `-${formatCurrency(inv.discount_amount)}` : '—'}
                    </Td>
                    <Td>{formatCurrency(inv.tax_amount)}</Td>
                    <Td className="font-bold text-slate-900">{formatCurrency(inv.total)}</Td>
                    <Td className="text-emerald-700 font-medium">{formatCurrency(inv.amount_paid || 0)}</Td>
                    <Td className={balanceDue > 0 ? 'text-red-600 font-bold' : 'text-slate-500'}>
                      {formatCurrency(balanceDue)}
                    </Td>
                    <Td>
                      <StatusBadge status={inv.status} />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Eye}
                          label="View invoice details"
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="text-slate-500 hover:text-blue-600"
                        />
                        <IconButton
                          icon={Printer}
                          label="Print invoice"
                          onClick={(e) => handlePrint(e, inv.id)}
                          className="text-slate-500 hover:text-slate-800"
                        />
                        {canPay && (
                          <IconButton
                            icon={CreditCard}
                            label="Record payment"
                            onClick={() => setPaymentModalInvoice(inv)}
                            className="text-emerald-600 hover:text-emerald-800"
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
        <RecordPaymentModal
          isOpen={Boolean(paymentModalInvoice)}
          onClose={() => setPaymentModalInvoice(null)}
          onSaved={() => {
            setPaymentModalInvoice(null);
            fetchInvoices();
            addToast('Payment recorded and invoice balance updated successfully!', 'success');
          }}
          preselectedInvoice={paymentModalInvoice}
          invoices={invoices}
        />
      )}
    </div>
  );
}