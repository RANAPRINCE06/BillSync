import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { paymentService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/quotationCalculations';
import { CreditCard, DollarSign, AlertCircle } from 'lucide-react';

export function RecordPaymentModal({ isOpen, onClose, onSaved, preselectedInvoice, invoices = [] }) {
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
    if (isOpen) {
      const invId = preselectedInvoice ? preselectedInvoice.id : (invoices[0]?.id || '');
      const activeInv = preselectedInvoice || invoices.find((x) => String(x.id) === String(invId));
      const outstanding = activeInv
        ? (activeInv.balance_due ?? Math.max(0, (activeInv.total || 0) - (activeInv.amount_paid || 0)))
        : '';

      setForm({
        invoice_id: invId,
        amount: outstanding > 0 ? outstanding : '',
        payment_method: 'CREDIT_CARD',
        payment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setErrors({});
    }
  }, [isOpen, preselectedInvoice, invoices]);

  const selectedInvoice = preselectedInvoice || invoices.find((inv) => String(inv.id) === String(form.invoice_id));
  const outstanding = selectedInvoice
    ? (selectedInvoice.balance_due ?? Math.max(0, (selectedInvoice.total || 0) - (selectedInvoice.amount_paid || 0)))
    : null;

  const validate = () => {
    const e = {};
    if (!form.invoice_id) e.invoice_id = 'Please select a target invoice';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      e.amount = 'Enter a valid payment amount greater than zero';
    } else if (outstanding !== null && Number(form.amount) > outstanding + 0.01) {
      e.amount = `Payment amount cannot exceed outstanding balance (${formatCurrency(outstanding)})`;
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

  const handleInvoiceChange = (id) => {
    setForm((prev) => {
      const inv = invoices.find((x) => String(x.id) === String(id));
      const bal = inv ? (inv.balance_due ?? Math.max(0, (inv.total || 0) - (inv.amount_paid || 0))) : '';
      return {
        ...prev,
        invoice_id: id,
        amount: bal > 0 ? bal : prev.amount,
      };
    });
    setErrors((prev) => ({ ...prev, invoice_id: '', amount: '' }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Invoice Payment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {!preselectedInvoice ? (
          <Select
            label="Target Invoice"
            value={form.invoice_id}
            onChange={(e) => handleInvoiceChange(e.target.value)}
            error={errors.invoice_id}
            required
          >
            <option value="">Select an invoice to pay...</option>
            {invoices
              .filter((inv) => (inv.balance_due ?? 1) > 0 && inv.status !== 'CANCELLED')
              .map((inv) => {
                const bal = inv.balance_due ?? Math.max(0, (inv.total || 0) - (inv.amount_paid || 0));
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number || `INV-${inv.id}`} — {inv.customer_name || inv.customer?.name} (Due: {formatCurrency(bal)})
                  </option>
                );
              })}
          </Select>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Target Invoice</span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {preselectedInvoice.invoice_number || `INV-${preselectedInvoice.id}`} — {preselectedInvoice.customer_name}
            </div>
          </div>
        )}

        {/* Invoice Balance Snapshot */}
        {selectedInvoice && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Total Invoice Amount:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(selectedInvoice.total)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Amount Already Paid:</span>
              <span className="font-semibold text-emerald-700">{formatCurrency(selectedInvoice.amount_paid || 0)}</span>
            </div>
            <div className="border-t border-blue-200/80 pt-1.5 flex justify-between font-bold text-blue-900">
              <span>Current Outstanding Balance:</span>
              <span className="text-sm text-red-600">{formatCurrency(outstanding)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Payment Amount (₹)"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => {
              setForm({ ...form, amount: e.target.value });
              setErrors({ ...errors, amount: '' });
            }}
            error={errors.amount}
            placeholder="0.00"
            required
          />

          <Select
            label="Payment Method"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            required
          >
            <option value="CREDIT_CARD">Credit / Debit Card</option>
            <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
            <option value="BANK_TRANSFER">Bank Wire / NEFT / RTGS</option>
            <option value="CASH">Cash Deposit</option>
            <option value="CHEQUE">Cheque / Demand Draft</option>
          </Select>
        </div>

        <Input
          label="Payment Execution Date"
          type="date"
          value={form.payment_date}
          onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
          error={errors.payment_date}
          required
        />

        <Textarea
          label="Payment Notes / Transaction UTR Reference"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="e.g. Bank UTR, UPI Ref ID, Cheque number, authorization code..."
          rows={2}
        />

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}