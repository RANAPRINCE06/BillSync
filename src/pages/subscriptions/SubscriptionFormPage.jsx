import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { subscriptionService, customerService, planService, productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';

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
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
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
        setCustomers(Array.isArray(cr.data) ? cr.data : cr.data?.items || []);
        setPlans(Array.isArray(plr.data) ? plr.data : plr.data?.items || []);
        setProducts(Array.isArray(pr.data) ? pr.data : pr.data?.items || []);
      })
      .catch((err) => addToast(getErrorMessage(err, 'Failed to load reference data'), 'error'));
  }, []);

  const addItem = () =>
    setItems((prev) => [...prev, { product_id: '', quantity: 1, unit_price: 0 }]);

  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find((x) => String(x.id) === String(value));
        if (p) next[i].unit_price = p.sales_price ?? p.price ?? 0;
      }
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Please select a customer';
    if (!form.plan_id) e.plan_id = 'Please select a subscription plan';
    if (!form.start_date) e.start_date = 'Start date is required';
    if (form.end_date && form.start_date > form.end_date) {
      e.end_date = 'End date must be after start date';
    }
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
        start_date: `${form.start_date}T00:00:00Z`,
        end_date: form.end_date ? `${form.end_date}T23:59:59Z` : null,
        expiry_date: form.end_date ? `${form.end_date}T23:59:59Z` : null,
        payment_terms: form.payment_terms,
        notes: form.notes.trim() || null,
        items: items
          .filter((l) => l.product_id)
          .map((l) => ({
            product_id: l.product_id,
            quantity: Number(l.quantity) || 1,
            unit_price: Number(l.unit_price) || 0,
          })),
      };

      await subscriptionService.create(payload);
      addToast('Subscription agreement activated successfully', 'success');
      navigate('/subscriptions');
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create subscription');
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
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/subscriptions')} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <PageHeader title="New Subscription" subtitle="Provision a recurring subscription" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Plan & Customer Terms</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Customer"
              value={form.customer_id}
              onChange={set('customer_id')}
              error={errors.customer_id}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>

            <Select
              label="Subscription Plan"
              value={form.plan_id}
              onChange={set('plan_id')}
              error={errors.plan_id}
              required
            >
              <option value="">Select recurring plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.billing_interval || p.billing_cycle} (₹{p.price})
                </option>
              ))}
            </Select>

            <Input
              label="Start Date"
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              error={errors.start_date}
              required
            />

            <Input
              label="Expiry / End Date (Optional)"
              type="date"
              value={form.end_date}
              onChange={set('end_date')}
              error={errors.end_date}
            />

            <Select label="Payment Terms" value={form.payment_terms} onChange={set('payment_terms')}>
              <option value="Due upon receipt">Due upon receipt</option>
              <option value="Net 15">Net 15 Days</option>
              <option value="Net 30">Net 30 Days</option>
              <option value="Advance">Advance Payment</option>
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Included Line Items (Add-ons)</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4" /> Add Product Add-on
            </Button>
          </CardHeader>
          <CardBody>
            {items.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No additional add-on items specified.</p>
            ) : (
              <div className="space-y-3">
                {items.map((line, i) => (
                  <div key={i} className="flex gap-3 items-end">
                    <Select
                      label="Product Offering"
                      value={line.product_id}
                      onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                      containerClass="flex-1"
                    >
                      <option value="">Select add-on product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (₹{p.sales_price ?? p.price ?? 0})
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Quantity"
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      containerClass="w-28"
                    />
                    <Input
                      label="Unit Price (₹)"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                      containerClass="w-32"
                    />
                    <div className="pb-1">
                      <IconButton
                        icon={Trash2}
                        label="Remove item"
                        onClick={() => removeItem(i)}
                        className="text-red-400 hover:text-red-600"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/subscriptions')}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Subscription
          </Button>
        </div>
      </form>
    </div>
  );
}
