import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { quotationService, customerService, productService, planService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';

export default function QuotationFormPage() {
  const addToast = useToast();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    discount: 0,
    tax_rate: 0,
  });
  const [lines, setLines] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    Promise.all([
      customerService.getAll(),
      productService.getAll(),
      planService.getAll(),
    ]).then(([cr, pr, plr]) => {
      setCustomers(cr.data || []);
      setProducts(pr.data || []);
      setPlans(plr.data || []);
    }).catch(() => addToast('Failed to load reference data', 'error'));
  }, []);

  const addLine = () => setLines((prev) => [...prev, { type: 'product', item_id: '', quantity: 1, unit_price: '' }]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const updateLine = (i, field, value) => {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      // Auto-fill price
      if (field === 'item_id') {
        const list = next[i].type === 'product' ? products : plans;
        const item = list.find((x) => String(x.id) === String(value));
        if (item) next[i].unit_price = item.sales_price ?? item.price ?? '';
      }
      return next;
    });
  };

  const subtotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const discount = Number(form.discount) || 0;
  const taxRate = Number(form.tax_rate) || 0;
  const taxAmount = (subtotal - discount) * (taxRate / 100);
  const total = subtotal - discount + taxAmount;

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Select a customer';
    if (lines.length === 0) e.lines = 'Add at least one line item';
    else {
      lines.forEach((l, i) => {
        if (!l.item_id) e[`line_${i}_item`] = 'Select an item';
        if (Number(l.quantity) < 1) e[`line_${i}_qty`] = 'Qty must be at least 1';
        if (l.unit_price === '' || Number(l.unit_price) < 0) e[`line_${i}_price`] = 'Enter valid price';
      });
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        customer_id: Number(form.customer_id),
        discount: Number(form.discount),
        tax_rate: Number(form.tax_rate),
        lines: lines.map((l) => ({
          type: l.type,
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
      };
      await quotationService.create(payload);
      addToast('Quotation created', 'success');
      navigate('/quotations');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create quotation';
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Quotation" />
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Header */}
        <Card>
          <CardHeader><CardTitle>Quotation Details</CardTitle></CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Customer" value={form.customer_id}
              onChange={(e) => { setForm({ ...form, customer_id: e.target.value }); setErrors({ ...errors, customer_id: '' }); }}
              error={errors.customer_id} required>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Date" type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </CardBody>
        </Card>

        {/* Lines */}
        <Card>
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4" /> Add Line
            </Button>
          </CardHeader>
          <CardBody>
            {errors.lines && <p className="text-xs text-red-500 mb-3">{errors.lines}</p>}
            {lines.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No line items added yet.</p>
            ) : (
              <div className="space-y-3">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-end border-b border-slate-100 pb-3">
                    <div className="col-span-2">
                      <Select label="Type" value={line.type} onChange={(e) => updateLine(i, 'type', e.target.value)}>
                        <option value="product">Product</option>
                        <option value="plan">Plan</option>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Select label="Item" value={line.item_id}
                        onChange={(e) => updateLine(i, 'item_id', e.target.value)}
                        error={errors[`line_${i}_item`]}>
                        <option value="">Select…</option>
                        {(line.type === 'product' ? products : plans).map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input label="Qty" type="number" min="1" value={line.quantity}
                        onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                        error={errors[`line_${i}_qty`]} />
                    </div>
                    <div className="col-span-3">
                      <Input label="Unit Price" type="number" min="0" step="0.01" value={line.unit_price}
                        onChange={(e) => updateLine(i, 'unit_price', e.target.value)}
                        error={errors[`line_${i}_price`]} />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      <IconButton icon={Trash2} label="Remove" onClick={() => removeLine(i)}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardBody>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Additional notes..." rows={4} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Discount (₹)" type="number" min="0" step="0.01" value={form.discount}
                  onChange={(e) => setForm({ ...form, discount: e.target.value })} />
                <Input label="Tax Rate (%)" type="number" min="0" max="100" step="0.1" value={form.tax_rate}
                  onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {[
                  ['Subtotal', subtotal],
                  ['Discount', -discount],
                  [`Tax (${taxRate}%)`, taxAmount],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(total)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Quotation</Button>
        </div>
      </form>
    </div>
  );
}

