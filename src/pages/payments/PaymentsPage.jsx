import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { paymentService, invoiceService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select } from '../../components/ui/Input';

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
    invoice_id: '', amount: '', payment_method: 'cash',
    payment_date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) { setForm({ invoice_id: '', amount: '', payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], notes: '' }); setErrors({}); }
  }, [isOpen]);

  const selectedInvoice = invoices.find((inv) => String(inv.id) === String(form.invoice_id));
  const outstanding = selectedInvoice ? (selectedInvoice.total || 0) - (selectedInvoice.amount_paid || 0) : null;

  const validate = () => {
    const e = {};
    if (!form.invoice_id) e.invoice_id = 'Select an invoice';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) e.amount = 'Enter a valid amount';
    else if (outstanding !== null && Number(form.amount) > outstanding) e.amount = `Max payable: ${formatCurrency(outstanding)}`;
    if (!form.payment_date) e.payment_date = 'Payment date required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await paymentService.create({
        invoice_id: Number(form.invoice_id),
        amount: Number(form.amount),
        payment_method: form.payment_method,
        payment_date: form.payment_date,
        notes: form.notes,
      });
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to record payment';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Select label="Invoice" value={form.invoice_id} onChange={set('invoice_id')} error={errors.invoice_id} required>
          <option value="">Select invoice</option>
          {invoices.filter((inv) => ['confirmed', 'sent', 'overdue'].includes(inv.status?.toLowerCase())).map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.invoice_number || inv.number || `INV-${inv.id}`} — {inv.customer_name || inv.customer?.name} — {formatCurrency(inv.total)}
            </option>
          ))}
        </Select>
        {outstanding !== null && (
          <p className="text-xs text-slate-500">Outstanding: <span className="font-semibold text-slate-700">{formatCurrency(outstanding)}</span></p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Input label="Amount" type="number" min="0.01" step="0.01" value={form.amount}
            onChange={set('amount')} error={errors.amount} required />
          <Input label="Payment Date" type="date" value={form.payment_date}
            onChange={set('payment_date')} error={errors.payment_date} required />
        </div>
        <Select label="Payment Method" value={form.payment_method} onChange={set('payment_method')}>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit_card">Credit Card</option>
          <option value="upi">UPI</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </Select>
        <Input label="Notes" value={form.notes} onChange={set('notes')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" loading={loading}>Record Payment</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PaymentsPage() {
  const addToast = useToast();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, invRes] = await Promise.all([paymentService.getAll(), invoiceService.getAll()]);
      setPayments(payRes.data || []);
      setInvoices(invRes.data || []);
    } catch {
      addToast('Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaved = () => {
    setModalOpen(false);
    fetchData();
    addToast('Payment recorded', 'success');
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} payment(s)`}
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" /> Record Payment
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Method</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={6} rows={6} />
          ) : payments.length === 0 ? (
            <TableEmpty message="No payments found" cols={6} />
          ) : (
            <TableBody>
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{p.invoice_number || p.invoice?.number || `INV-${p.invoice_id}`}</Td>
                  <Td className="font-medium">{p.customer_name || p.customer?.name || p.invoice?.customer_name || '—'}</Td>
                  <Td>{formatDate(p.payment_date || p.date)}</Td>
                  <Td className="capitalize">{(p.payment_method || '').replace('_', ' ')}</Td>
                  <Td className="font-medium text-emerald-700">{formatCurrency(p.amount)}</Td>
                  <Td><StatusBadge status={p.status || 'completed'} /></Td>
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

