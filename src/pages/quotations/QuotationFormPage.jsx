import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { quotationService, customerService, productService } from '../../services';
import { getErrorMessage } from '../../services/api';
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
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    discount_amount: 0,
    tax_rate: 18,
    notes: '',
  });

  const [items, setItems] = useState([
    { product_id: '', quantity: 1, unit_price: '', tax_rate: 18 },
  ]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    Promise.all([
      customerService.getAll(),
      productService.getAll(),
    ])
      .then(([cr, pr]) => {
        setCustomers(Array.isArray(cr.data) ? cr.data : cr.data?.items || []);
        setProducts(Array.isArray(pr.data) ? pr.data : pr.data?.items || []);
      })
      .catch((err) => addToast(getErrorMessage(err, 'Failed to load customers and products'), 'error'));
  }, []);

  const addItem = () =>
    setItems((prev) => [...prev, { product_id: '', quantity: 1, unit_price: '', tax_rate: 18 }]);

  const removeItem = (i) => {
    if (items.length === 1) {
      addToast('Quotation must have at least one line item', 'warning');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateItem = (i, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const prod = products.find((x) => String(x.id) === String(value));
        if (prod) {
          next[i].unit_price = prod.sales_price ?? prod.price ?? 0;
        }
      }
      return next;
    });
  };

  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );
  const discount = Math.min(Number(form.discount_amount) || 0, subtotal);
  const taxableBase = Math.max(0, subtotal - discount);
  const taxRate = Number(form.tax_rate) || 0;
  const taxAmount = (taxableBase * taxRate) / 100;
  const total = taxableBase + taxAmount;

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Please select a customer';
    if (items.length === 0) e.items = 'Add at least one product line item';
    items.forEach((item, i) => {
      if (!item.product_id) e[`item_${i}_product`] = 'Select a product';
      if (Number(item.quantity) < 1) e[`item_${i}_qty`] = 'Min quantity 1';
      if (item.unit_price === '' || Number(item.unit_price) < 0) e[`item_${i}_price`] = 'Valid price required';
    });
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
        customer_id: form.customer_id,
        valid_until: form.valid_until ? `${form.valid_until}T23:59:59Z` : null,
        discount_amount: Number(form.discount_amount) || 0,
        tax_amount: taxAmount,
        subtotal: subtotal,
        total: total,
        notes: form.notes.trim() || null,
        items: items.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate) || 0,
          line_total: Number(l.quantity) * Number(l.unit_price),
        })),
      };

      await quotationService.create(payload);
      addToast('Quotation created successfully', 'success');
      navigate('/quotations');
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create quotation');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/quotations')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <PageHeader title="New Quotation" subtitle="Create pricing estimate for a customer" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Header card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer & Terms</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Customer"
              value={form.customer_id}
              onChange={(e) => {
                setForm({ ...form, customer_id: e.target.value });
                setErrors({ ...errors, customer_id: '' });
              }}
              error={errors.customer_id}
              required
            >
              <option value="">Select recipient customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>

            <Input
              label="Valid Until"
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
            />
          </CardBody>
        </Card>

        {/* Lines card */}
        <Card>
          <CardHeader>
            <CardTitle>Quotation Line Items</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          </CardHeader>
          <CardBody>
            {errors.items && <p className="text-xs text-red-500 mb-3">{errors.items}</p>}
            <div className="space-y-3">
              {items.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-end border-b border-slate-100 pb-3">
                  <div className="col-span-5">
                    <Select
                      label="Product / Offering"
                      value={line.product_id}
                      onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                      error={errors[`item_${i}_product`]}
                      required
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Sales: ₹{p.sales_price ?? p.price ?? 0})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Quantity"
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      error={errors[`item_${i}_qty`]}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label="Unit Price (₹)"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                      error={errors[`item_${i}_price`]}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 font-medium mb-1">Line Total</p>
                    <p className="text-sm font-semibold text-slate-800 py-2">
                      ₹{((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)).toFixed(2)}
                    </p>
                  </div>
                  <div className="col-span-1 flex justify-end pb-2">
                    <IconButton
                      icon={Trash2}
                      label="Remove item"
                      onClick={() => removeItem(i)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Totals & Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Internal Notes & Terms</CardTitle>
            </CardHeader>
            <CardBody>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Payment terms, validity clauses, or delivery schedules..."
                rows={5}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Price Summary</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Discount Amount (₹)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount_amount}
                  onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
                />
                <Input
                  label="Tax Rate (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.tax_rate}
                  onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-800">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Tax ({taxRate}%)</span>
                  <span className="font-medium text-slate-800">+₹{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
                  <span className="text-slate-900">Total Estimate</span>
                  <span className="text-blue-700">₹{total.toFixed(2)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Quotation
          </Button>
        </div>
      </form>
    </div>
  );
}
