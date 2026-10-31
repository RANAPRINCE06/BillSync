import { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Filter, CreditCard, DollarSign, Printer, Download } from 'lucide-react';
import { paymentService, invoiceService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/quotationCalculations';
import { RecordPaymentModal } from './RecordPaymentModal';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const METHOD_FILTERS = [
  { value: 'ALL', label: 'All Payment Methods' },
  { value: 'CREDIT_CARD', label: 'Credit / Debit Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Wire / NEFT' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
];

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'SUCCESSFUL', label: 'Successful' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
];

export default function PaymentsPage() {
  const addToast = useToast();
  const { isCustomer } = useAuth();

  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [viewPayment, setViewPayment] = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (methodFilter !== 'ALL') params.method = methodFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const res = await paymentService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setPayments(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load payments'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, methodFilter, statusFilter]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await invoiceService.getAll();
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setInvoices(list);
    } catch {
      // Invoices for payment matching
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchPayments, 250);
    return () => clearTimeout(t);
  }, [fetchPayments]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleSaved = () => {
    setRecordModalOpen(false);
    fetchPayments();
    fetchInvoices();
    addToast('Payment recorded and applied successfully', 'success');
  };

  // Find linked invoice for viewing payment details
  const linkedInvoice = viewPayment
    ? invoices.find((inv) => String(inv.id) === String(viewPayment.invoice_id) || inv.invoice_number === viewPayment.invoice_number)
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} customer transaction(s) recorded`}
        action={
          !isCustomer && (
            <Button onClick={() => setRecordModalOpen(true)}>
              <Plus className="w-4 h-4" /> Record Payment
            </Button>
          )
        }
      />

      <Card>
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by payment ref, invoice #, customer or notes..."
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {METHOD_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

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

        {/* Payments Table */}
        <Table>
          <TableHead>
            <Th>Payment Ref</Th>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Payment Method</Th>
            <Th>Amount Paid</Th>
            <Th>Payment Date</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={8} rows={6} />
          ) : payments.length === 0 ? (
            <TableEmpty message="No payments found matching your filter criteria." cols={8} />
          ) : (
            <TableBody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <Td className="font-mono text-xs font-semibold text-slate-900">
                    <button
                      type="button"
                      onClick={() => setViewPayment(p)}
                      className="hover:text-blue-600 transition-colors"
                    >
                      {p.payment_reference || `#${p.id}`}
                    </button>
                  </Td>
                  <Td className="font-mono text-xs text-blue-700 font-medium">
                    {p.invoice_number || (p.invoice_id ? `INV-${p.invoice_id}` : '—')}
                  </Td>
                  <Td className="font-medium text-slate-900">{p.customer_name || 'Client'}</Td>
                  <Td>
                    <StatusBadge status={p.payment_method} />
                  </Td>
                  <Td className="font-bold text-emerald-700">{formatCurrency(p.amount)}</Td>
                  <Td>{formatDate(p.payment_date || p.created_at)}</Td>
                  <Td>
                    <StatusBadge status={p.status || 'SUCCESSFUL'} />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        icon={Eye}
                        label="View transaction details"
                        onClick={() => setViewPayment(p)}
                        className="text-slate-500 hover:text-blue-600"
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onSaved={handleSaved}
        invoices={invoices}
      />

      {/* View Payment Details Modal */}
      <Modal
        isOpen={Boolean(viewPayment)}
        onClose={() => setViewPayment(null)}
        title="Transaction & Payment Details"
        size="md"
      >
        {viewPayment && (
          <div className="space-y-4 text-xs">
            {/* Header Badge */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-400 block font-medium">Payment Reference</span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {viewPayment.payment_reference || viewPayment.id}
                </span>
              </div>
              <StatusBadge status={viewPayment.status || 'SUCCESSFUL'} />
            </div>

            {/* Payment Metrics */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                  Amount Transferred
                </span>
                <div className="text-xl font-bold text-emerald-700 mt-0.5">
                  {formatCurrency(viewPayment.amount)}
                </div>
              </div>
              <StatusBadge status={viewPayment.payment_method} />
            </div>

            {/* Invoice & Outstanding Summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <span className="font-semibold text-slate-800 block uppercase tracking-wide text-[11px]">
                Invoice Financial Context
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Target Invoice:</span>
                  <p className="font-mono font-bold text-blue-700 mt-0.5">
                    {viewPayment.invoice_number || `INV-${viewPayment.invoice_id}`}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Customer:</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{viewPayment.customer_name || 'Client'}</p>
                </div>
              </div>

              {linkedInvoice && (
                <div className="border-t border-slate-200 pt-2 grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-slate-400">Invoice Total:</span>
                    <p className="font-semibold text-slate-800">{formatCurrency(linkedInvoice.total)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Paid:</span>
                    <p className="font-semibold text-emerald-700">{formatCurrency(linkedInvoice.amount_paid || 0)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Remaining Balance:</span>
                    <p className="font-bold text-red-600">
                      {formatCurrency(linkedInvoice.balance_due ?? Math.max(0, (linkedInvoice.total || 0) - (linkedInvoice.amount_paid || 0)))}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Execution Date & Reference Notes */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
              <div>
                <span className="text-slate-400 font-medium">Transaction Execution Date</span>
                <p className="font-semibold text-slate-800 mt-0.5">{formatDate(viewPayment.payment_date)}</p>
              </div>

              {viewPayment.notes && (
                <div className="border-t border-slate-100 pt-2">
                  <span className="text-slate-400 font-medium">UTR / Transaction Reference</span>
                  <p className="text-slate-700 mt-0.5 whitespace-pre-line font-mono">{viewPayment.notes}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" /> Print Receipt
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const exportReceipt = {
                    payment_reference: viewPayment.payment_reference,
                    invoice_number: viewPayment.invoice_number,
                    customer: viewPayment.customer_name,
                    amount: viewPayment.amount,
                    payment_method: viewPayment.payment_method,
                    payment_date: viewPayment.payment_date,
                    notes: viewPayment.notes,
                  };
                  const blob = new Blob([JSON.stringify(exportReceipt, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Receipt_${viewPayment.payment_reference || viewPayment.id}.json`;
                  a.click();
                  URL.revokeObjectURL(a);
                  addToast('Payment receipt downloaded', 'success');
                }}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
              <Button variant="secondary" onClick={() => setViewPayment(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}