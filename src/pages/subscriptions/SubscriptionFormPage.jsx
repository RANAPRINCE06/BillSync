import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { subscriptionService, customerService, planService, productService } from '../../services';
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
    customer_id: '', plan_id: '',
    start_date: new Date().toISOString().split('T')[0],
    expiry_date: '', notes: '',
  });
  const [productLines, setProductLines] = useState([]);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    Promise.all([
      customerService.getAll(),
      planService.getAll(),
      productService.getAll(),
    ]).then(([cr, plr, pr]) => {
      setCustomers(cr.data || []);
      setPlans(plr.data || []);
      setProducts(pr.data || []);
    }).catch(() => addToast('Failed to load reference data', 'error'));
  }, []);

  const addProductLine = () =>
    setProductLines((prev) => [...prev, { product_id: '', quantity: 1 }]);
  const removeProductLine = (i) => setProductLines((prev) => prev.filter((_, idx) => idx !== i));
  const updateProductLine = (i, field, value) => {
    setProductLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Select a customer';
    if (!form.plan_id) e.plan_id = 'Select a plan';
    if (!form.start_date) e.start_date = 'Start date required';
    if (form.expiry_date && form.start_date > form.expiry_date) e.expiry_date = 'Expiry must be after start';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        plan_id: Number(form.plan_id),
        start_date: form.start_date,
        expiry_date: form.expiry_date || null,
        notes: form.notes,
        products: productLines
          .filter((l) => l.product_id)
          .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) })),
      };
      await subscriptionService.create(payload);
      addToast('Subscription created', 'success');
      navigate('/subscriptions');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create subscription';
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
      <PageHeader title="New Subscription" />
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader><CardTitle>Subscription Details</CardTitle></CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Customer" value={form.customer_id} onChange={set('customer_id')} error={errors.customer_id} required>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Subscription Plan" value={form.plan_id} onChange={set('plan_id')} error={errors.plan_id} required>
              <option value="">Select plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.billing_cycle}</option>)}
            </Select>
            <Input label="Start Date" type="date" value={form.start_date} onChange={set('start_date')} error={errors.start_date} required />
            <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Products</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addProductLine}>
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          </CardHeader>
          <CardBody>
            {productLines.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No additional products</p>
            ) : (
              <div className="space-y-3">
                {productLines.map((line, i) => (
                  <div key={i} className="flex gap-3 items-end">
                    <Select label="Product" value={line.product_id}
                      onChange={(e) => updateProductLine(i, 'product_id', e.target.value)}
                      containerClass="flex-1">
                      <option value="">Select product</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <Input label="Quantity" type="number" min="1" value={line.quantity}
                      onChange={(e) => updateProductLine(i, 'quantity', e.target.value)}
                      containerClass="w-28" />
                    <div className="pb-1">
                      <IconButton icon={Trash2} label="Remove" onClick={() => removeProductLine(i)}
                        className="text-red-400 hover:text-red-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/subscriptions')}>Cancel</Button>
          <Button type="submit" loading={loading}>Create Subscription</Button>
        </div>
      </form>
    </div>
  );
}

