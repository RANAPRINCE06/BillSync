import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { paymentService, invoiceService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

function RecordPaymentModal({ isOpen, onClose, onSaved, invoices }) {
  const addToast = useToast();
  const [form, setForm] = useState({
    invoice_id: '',
    amount: '',
    payment_method: 'CREDIT_CARD',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm({
        invoice_id: '',
        amount: '',
        payment_method: 'CREDIT_CARD',
        payment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setErrors({});
    }
  }, [isOpen]);

  const selectedInvoice = invoices.find((inv) => String(inv.id) === String(form.invoice_id));
  const outstanding = selectedInvoice
    ? (selectedInvoice.balance_due ?? (selectedInvoice.total || 0) - (selectedInvoice.amount_paid || 0))
    : null;

  const validate = () => {
    const e = {};
    if (!form.invoice_id) e.invoice_id = 'Please select an invoice';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      e.amount = 'Enter a valid payment amount greater than zero';
    } else if (outstanding !== null && Number(form.amount) > outstanding) {
      e.amount = `Amount cannot exceed outstanding balance (${formatCurrency(outstanding)})`;
    }
    if (!form.payment_date) e.payment_date = 'Payment date is required';
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
        invoice_id: form.invoice_id,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        payment_date: `${form.payment_date}T00:00:00Z`,
        notes: form.notes.trim() || null,
      };

      await paymentService.create(payload);
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to record payment');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    if (field === 'invoice_id') {
      const inv = invoices.find((x) => String(x.id) === String(e.target.value));
      if (inv) {
        const bal = inv.balance_due ?? (inv.total || 0) - (inv.amount_paid || 0);
        if (bal > 0) setForm((prev) => ({ ...prev, invoice_id: e.target.value, amount: bal }));
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Select label="Target Invoice" value={form.invoice_id} onChange={set('invoice_id')} error={errors.invoice_id} required>
          <option value="">Select an invoice to pay...</option>
          {invoices
            .filter((inv) => {
              const status = (inv.status || '').toUpperCase();
              return ['CONFIRMED', 'SENT', 'OVERDUE', 'PARTIALLY_PAID', 'DRAFT'].includes(status);
            })
            .map((inv) => {
              const bal = inv.balance_due ?? (inv.total || 0) - (inv.amount_paid || 0);
              return (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number || inv.number || `INV-${inv.id}`} — {inv.customer_name || inv.customer?.name} (Due: {formatCurrency(bal)})
                </option>
              );
            })}
        </Select>

        {outstanding !== null && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-600">Total Invoice: <strong>{formatCurrency(selectedInvoice.total)}</strong></span>
            <span className="text-blue-800 font-semibold">Remaining Due: {formatCurrency(outstanding)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Payment Amount (₹)"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={set('amount')}
            error={errors.amount}
            placeholder="0.00"
            required
          />
          <Input
            label="Payment Date"
            type="date"
            value={form.payment_date}
            onChange={set('payment_date')}
            error={errors.payment_date}
            required
          />
        </div>

        <Select label="Payment Method" value={form.payment_method} onChange={set('payment_method')}>
          <option value="CREDIT_CARD">Credit / Debit Card</option>
          <option value="BANK_TRANSFER">Bank Wire Transfer</option>
          <option value="UPI">UPI</option>
          <option value="CASH">Cash</option>
          <option value="OTHER">Other Gateway</option>
        </Select>

        <Textarea
          label="Transaction / Reference Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Bank reference number, cheque number, or gateway tx ID"
          rows={2}
        />

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Confirm Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PaymentsPage() {
  const addToast = useToast();
  const { isCustomer } = useAuth();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, invRes] = await Promise.all([
        paymentService.getAll(),
        invoiceService.getAll().catch(() => ({ data: [] })),
      ]);
      const payList = Array.isArray(payRes.data) ? payRes.data : (payRes.data?.items || []);
      const invList = Array.isArray(invRes.data) ? invRes.data : (invRes.data?.items || []);
      setPayments(payList);
      setInvoices(invList);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load payments'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaved = () => {
    setModalOpen(false);
    fetchData();
    addToast('Payment recorded successfully', 'success');
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} processed payment transaction(s)`}
        action={
          !isCustomer && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" /> Record Payment
            </Button>
          )
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Payment Reference</Th>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Payment Date</Th>
            <Th>Method</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={6} />
          ) : payments.length === 0 ? (
            <TableEmpty message="No payments recorded yet." cols={7} />
          ) : (
            <TableBody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <Td className="font-mono text-xs font-semibold text-slate-900">
                    {p.payment_reference || `PAY-${p.id}`}
                  </Td>
                  <Td className="font-mono text-xs text-slate-700">
                    {p.invoice_number || p.invoice?.invoice_number || p.invoice?.number || `INV-${p.invoice_id}`}
                  </Td>
                  <Td className="font-medium text-slate-900">
                    {p.customer_name || p.customer?.name || p.invoice?.customer_name || p.invoice?.customer?.name || '—'}
                  </Td>
                  <Td>{formatDate(p.payment_date || p.created_at || p.date)}</Td>
                  <Td className="font-medium text-slate-700">
                    {(p.payment_method || '').replace(/_/g, ' ')}
                  </Td>
                  <Td className="font-semibold text-emerald-700">{formatCurrency(p.amount)}</Td>
                  <Td>
                    <StatusBadge status={p.status || 'SUCCESSFUL'} />
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      <RecordPaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        invoices={invoices}
      />
    </div>
  );
}
