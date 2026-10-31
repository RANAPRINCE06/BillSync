import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Layers, Calendar, DollarSign, Calculator } from 'lucide-react';
import { subscriptionService, customerService, planService, productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { calculateLineTotal, calculateQuotationTotals, formatCurrency } from '../../utils/quotationCalculations';

export default function SubscriptionFormPage() {
  const addToast = useToast();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    plan_id: '',
    status: 'ACTIVE',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    payment_terms: 'Due upon receipt',
    notes: '',
  });

  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    Promise.all([
      customerService.getAll(),
      planService.getAll(),
      productService.getAll(),
    ])
      .then(([cr, plr, pr]) => {
        const custList = Array.isArray(cr.data) ? cr.data : cr.data?.items || [];
        const planList = Array.isArray(plr.data) ? plr.data : plr.data?.items || [];
        const prodList = Array.isArray(pr.data) ? pr.data : pr.data?.items || [];
        setCustomers(custList);
        setPlans(planList);
        setProducts(prodList);

        // Pre-initialize with first product if available
        if (prodList.length > 0) {
          const firstProd = prodList[0];
          setItems([
            {
              product_id: firstProd.id,
              name: firstProd.name,
              quantity: 1,
              unit_price: firstProd.sales_price ?? firstProd.price ?? 0,
              tax_rate: 18,
            },
          ]);
        }
      })
      .catch((err) => addToast(getErrorMessage(err, 'Failed to load reference data'), 'error'));
  }, []);

  const handlePlanChange = (planId) => {
    const selectedPlan = plans.find((p) => String(p.id) === String(planId));
    setForm((prev) => {
      let nextEnd = prev.end_date;
      if (selectedPlan) {
        const interval = (selectedPlan.billing_interval || selectedPlan.billing_cycle || 'MONTHLY').toUpperCase();
        const start = prev.start_date ? new Date(prev.start_date) : new Date();
        if (interval === 'YEARLY') {
          start.setFullYear(start.getFullYear() + 1);
        } else if (interval === 'MONTHLY') {
          start.setMonth(start.getMonth() + 12);
        } else if (interval === 'WEEKLY') {
          start.setDate(start.getDate() + 90);
        } else if (interval === 'DAILY') {
          start.setDate(start.getDate() + 30);
        }
        nextEnd = start.toISOString().split('T')[0];
      }
      return { ...prev, plan_id: planId, end_date: nextEnd };
    });

    if (selectedPlan && selectedPlan.minimum_quantity > 1) {
      setItems((prev) =>
        prev.map((item, idx) => (idx === 0 ? { ...item, quantity: Math.max(item.quantity, selectedPlan.minimum_quantity) } : item))
      );
    }
    setErrors((prev) => ({ ...prev, plan_id: '' }));
  };

  const addItem = () => {
    const defaultProd = products[0] || {};
    setItems((prev) => [
      ...prev,
      {
        product_id: defaultProd.id || '',
        name: defaultProd.name || '',
        quantity: 1,
        unit_price: defaultProd.sales_price ?? defaultProd.price ?? 0,
        tax_rate: 18,
      },
    ]);
  };

  const removeItem = (i) => {
    if (items.length === 1) {
      addToast('A subscription must retain at least one product line', 'warning');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateItem = (i, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find((x) => String(x.id) === String(value));
        if (p) {
          item.name = p.name;
          item.unit_price = p.sales_price ?? p.price ?? 0;
        }
      }
      next[i] = item;
      return next;
    });
  };

  const totals = calculateQuotationTotals(items, 0, 18);
  const selectedPlanObj = plans.find((p) => String(p.id) === String(form.plan_id));
  const minRequiredQty = selectedPlanObj?.minimum_quantity ?? 1;

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Please select a customer';
    if (!form.plan_id) e.plan_id = 'Please select a recurring plan';
    if (!form.start_date) e.start_date = 'Start date is required';
    if (form.end_date && form.start_date > form.end_date) {
      e.end_date = 'End date cannot precede the start date';
    }
    if (items.length === 0) e.items = 'Please add at least one offering line';

    const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    if (totalQty < minRequiredQty) {
      e.items = `The selected plan requires a minimum aggregate quantity of ${minRequiredQty}`;
    }

    items.forEach((it, idx) => {
      if (!it.product_id) e[`item_${idx}_prod`] = 'Select product';
      if (it.quantity === '' || Number(it.quantity) <= 0) e[`item_${idx}_qty`] = 'Quantity must be > 0';
      if (it.unit_price === '' || Number(it.unit_price) < 0) e[`item_${idx}_price`] = 'Price >= 0';
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
        plan_id: form.plan_id,
        status: form.status,
        start_date: `${form.start_date}T00:00:00Z`,
        end_date: form.end_date ? `${form.end_date}T23:59:59Z` : null,
        payment_terms: form.payment_terms,
        notes: form.notes.trim() || null,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        total_amount: totals.total,
        items: items.map((l) => ({
          product_id: l.product_id,
          product_name: l.name || 'Service Offering',
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate) || 18,
          line_total: calculateLineTotal(l.quantity, l.unit_price),
        })),
      };

      await subscriptionService.create(payload);
      addToast('Subscription agreement successfully created and provisioned!', 'success');
      navigate('/subscriptions');
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create subscription agreement');
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/subscriptions')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <PageHeader title="New Subscription" subtitle="Provision a recurring customer agreement" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Customer & Plan Selector Card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer, Plan & Lifecycle</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Recipient Customer"
              value={form.customer_id}
              onChange={set('customer_id')}
              error={errors.customer_id}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `(${c.company})` : `(${c.email})`}
                </option>
              ))}
            </Select>

            <Select
              label="Subscription Plan"
              value={form.plan_id}
              onChange={(e) => handlePlanChange(e.target.value)}
              error={errors.plan_id}
              required
            >
              <option value="">Select recurring plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.billing_interval || p.billing_cycle} ({formatCurrency(p.price)})
                </option>
              ))}
            </Select>

            <Select label="Initial Agreement Status" value={form.status} onChange={set('status')}>
              <option value="ACTIVE">Active (Immediate Provisioning)</option>
              <option value="CONFIRMED">Confirmed (Pending Activation)</option>
              <option value="DRAFT">Draft (Under Review)</option>
            </Select>
          </CardBody>
        </Card>

        {/* Schedule & Payment Terms */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule & Billing Terms</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Subscription Start Date"
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              error={errors.start_date}
              required
            />

            <Input
              label="Contract End Date (Optional)"
              type="date"
              value={form.end_date}
              onChange={set('end_date')}
              error={errors.end_date}
            />

            <Select label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')}>
              <option value="Due upon receipt">Due upon receipt</option>
              <option value="Immediate">Immediate / Card Auto-Debit</option>
              <option value="Net 15">Net 15</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 60">Net 60</option>
            </Select>
          </CardBody>
        </Card>

        {/* Product Line Offerings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Provisioned Product Lines</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedPlanObj ? `Plan minimum required quantity: ${minRequiredQty} seat(s)` : 'Specify unit allocations'}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <Plus className="w-3.5 h-3.5" /> Add Product Line
            </Button>
          </CardHeader>

          <CardBody className="space-y-3">
            {errors.items && <p className="text-xs text-red-500 font-medium">{errors.items}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Product / Service Offering</th>
                    <th className="px-3 py-2 w-28 text-center">Quantity *</th>
                    <th className="px-3 py-2 w-36 text-right">Unit Price (₹) *</th>
                    <th className="px-3 py-2 w-24 text-center">Tax (%)</th>
                    <th className="px-3 py-2 w-32 text-right">Line Total (₹)</th>
                    <th className="px-3 py-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, i) => {
                    const lineTotal = calculateLineTotal(item.quantity, item.unit_price);
                    return (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5">
                          <select
                            value={item.product_id}
                            onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                          >
                            <option value="">— Select Offering —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatCurrency(p.sales_price ?? p.price ?? 0)})
                              </option>
                            ))}
                          </select>
                          {errors[`item_${i}_prod`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`item_${i}_prod`]}</p>
                          )}
                        </td>

                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded text-center outline-none focus:border-blue-500"
                          />
                          {errors[`item_${i}_qty`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`item_${i}_qty`]}</p>
                          )}
                        </td>

                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded text-right outline-none focus:border-blue-500"
                          />
                          {errors[`item_${i}_price`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`item_${i}_price`]}</p>
                          )}
                        </td>

                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.tax_rate}
                            onChange={(e) => updateItem(i, 'tax_rate', e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded text-center outline-none focus:border-blue-500"
                          />
                        </td>

                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          {formatCurrency(lineTotal)}
                        </td>

                        <td className="px-3 py-2.5 text-center">
                          <IconButton
                            icon={Trash2}
                            label="Remove Line"
                            onClick={() => removeItem(i)}
                            className="text-red-400 hover:text-red-600"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Notes & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Internal Notes & SLA Addenda</CardTitle>
              </CardHeader>
              <CardBody>
                <Textarea
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Special client terms, hardware dispatch notes, account manager assignments..."
                  rows={4}
                />
              </CardBody>
            </Card>
          </div>

          <div>
            <Card className="bg-slate-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" /> Recurring Financials
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Recurring Subtotal:</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totals.subtotal)}</span>
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Taxes (GST 18%):</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totals.taxAmount)}</span>
                </div>

                <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-base">Recurring Total:</span>
                  <span className="font-bold text-lg text-emerald-700">{formatCurrency(totals.total)}</span>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => navigate('/subscriptions')}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading}>
                    Create Subscription
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}