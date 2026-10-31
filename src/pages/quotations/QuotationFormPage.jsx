import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Bookmark, Calculator, Package, Layers } from 'lucide-react';
import { quotationService, customerService, productService, planService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { calculateLineTotal, calculateQuotationTotals, formatCurrency } from '../../utils/quotationCalculations';

export default function QuotationFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const addToast = useToast();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  const [form, setForm] = useState({
    quotation_number: '',
    customer_id: '',
    quotation_date: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    discount_amount: 0,
    tax_rate: 18,
    notes: '',
    status: 'DRAFT',
  });

  const [items, setItems] = useState([
    {
      item_type: 'PRODUCT', // 'PRODUCT' | 'PLAN'
      product_id: '',
      plan_id: '',
      name: '',
      quantity: 1,
      unit_price: '',
      tax_rate: 18,
    },
  ]);
  const [errors, setErrors] = useState({});

  // Load catalog dependencies
  useEffect(() => {
    Promise.all([
      customerService.getAll(),
      productService.getAll(),
      planService.getAll(),
      quotationService.getTemplates ? quotationService.getTemplates() : Promise.resolve({ data: [] }),
    ])
      .then(([cr, pr, plr, tmplr]) => {
        setCustomers(Array.isArray(cr.data) ? cr.data : cr.data?.items || []);
        setProducts(Array.isArray(pr.data) ? pr.data : pr.data?.items || []);
        setPlans(Array.isArray(plr.data) ? plr.data : plr.data?.items || []);
        setTemplates(Array.isArray(tmplr.data) ? tmplr.data : tmplr.data?.items || []);
      })
      .catch((err) => addToast(getErrorMessage(err, 'Failed to load form dependencies'), 'error'));
  }, []);

  // Load existing quotation if in edit mode
  useEffect(() => {
    if (!isEdit) return;
    setInitialLoading(true);
    quotationService
      .getById(id)
      .then((res) => {
        const q = res.data;
        setForm({
          quotation_number: q.quotation_number || '',
          customer_id: q.customer_id || '',
          quotation_date: q.created_at ? q.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          valid_until: q.valid_until ? q.valid_until.split('T')[0] : '',
          discount_amount: q.discount_amount ?? 0,
          tax_rate: 18,
          notes: q.notes || '',
          status: q.status || 'DRAFT',
        });
        if (Array.isArray(q.items) && q.items.length > 0) {
          setItems(
            q.items.map((it) => ({
              item_type: it.plan_id ? 'PLAN' : 'PRODUCT',
              product_id: it.product_id || '',
              plan_id: it.plan_id || '',
              name: it.product_name || it.name || '',
              quantity: it.quantity ?? 1,
              unit_price: it.unit_price ?? '',
              tax_rate: it.tax_rate ?? 18,
            }))
          );
        }
      })
      .catch((err) => {
        addToast(getErrorMessage(err, 'Failed to load quotation for editing'), 'error');
        navigate('/quotations');
      })
      .finally(() => setInitialLoading(false));
  }, [id, isEdit]);

  // Handle template selection
  const handleApplyTemplate = (templateId) => {
    if (!templateId) return;
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;

    const days = Number(tmpl.validity_days) || 14;
    const newValidUntil = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    setForm((prev) => ({
      ...prev,
      valid_until: newValidUntil,
      discount_amount: tmpl.discount_amount ?? prev.discount_amount,
      notes: tmpl.notes ? `${tmpl.notes}\n${prev.notes}`.trim() : prev.notes,
    }));

    if (Array.isArray(tmpl.items) && tmpl.items.length > 0) {
      const mappedItems = tmpl.items.map((it) => ({
        item_type: it.item_type || (it.plan_id ? 'PLAN' : 'PRODUCT'),
        product_id: it.product_id || '',
        plan_id: it.plan_id || '',
        name: it.name || '',
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        tax_rate: it.tax_rate ?? 18,
      }));
      setItems(mappedItems);
    }

    addToast(`Template "${tmpl.name}" applied successfully`, 'info');
  };

  const addItem = (type = 'PRODUCT') => {
    setItems((prev) => [
      ...prev,
      {
        item_type: type,
        product_id: '',
        plan_id: '',
        name: '',
        quantity: 1,
        unit_price: '',
        tax_rate: 18,
      },
    ]);
  };

  const removeItem = (i) => {
    if (items.length === 1) {
      addToast('Quotation must contain at least one line item', 'warning');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateItem = (i, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[i], [field]: value };

      if (field === 'item_type') {
        item.product_id = '';
        item.plan_id = '';
        item.name = '';
        item.unit_price = '';
      } else if (field === 'product_id') {
        const prod = products.find((x) => String(x.id) === String(value));
        if (prod) {
          item.name = prod.name;
          item.unit_price = prod.sales_price ?? prod.price ?? 0;
        }
      } else if (field === 'plan_id') {
        const pl = plans.find((x) => String(x.id) === String(value));
        if (pl) {
          item.name = pl.name;
          item.unit_price = pl.price ?? 0;
          item.quantity = Math.max(item.quantity, pl.minimum_quantity ?? 1);
        }
      }

      next[i] = item;
      return next;
    });
  };

  // Real-time calculation previews using organized utility
  const totals = calculateQuotationTotals(items, form.discount_amount, form.tax_rate);

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Recipient customer is required';
    if (!form.valid_until) {
      e.valid_until = 'Validity expiration date is required';
    } else if (form.quotation_date && form.valid_until < form.quotation_date) {
      e.valid_until = 'Validity date cannot precede quotation creation date';
    }
    if (Number(form.discount_amount) < 0) {
      e.discount_amount = 'Discount amount cannot be negative';
    }

    if (items.length === 0) {
      e.items = 'At least one quotation line item is required';
    }

    items.forEach((item, i) => {
      if (item.item_type === 'PRODUCT' && !item.product_id) {
        e[`item_${i}_selection`] = 'Please select a catalog product';
      }
      if (item.item_type === 'PLAN' && !item.plan_id) {
        e[`item_${i}_selection`] = 'Please select a subscription plan';
      }
      if (item.quantity === '' || Number(item.quantity) <= 0) {
        e[`item_${i}_qty`] = 'Quantity must be > 0';
      }
      if (item.unit_price === '' || isNaN(item.unit_price) || Number(item.unit_price) < 0) {
        e[`item_${i}_price`] = 'Price must be >= 0';
      }
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
      const selectedCustomer = customers.find((c) => String(c.id) === String(form.customer_id));
      const payload = {
        quotation_number: form.quotation_number || undefined,
        customer_id: form.customer_id,
        customer_name: selectedCustomer?.name || 'Client',
        customer_email: selectedCustomer?.email || '',
        company: selectedCustomer?.company || '',
        created_at: form.quotation_date ? `${form.quotation_date}T10:00:00Z` : new Date().toISOString(),
        valid_until: form.valid_until ? `${form.valid_until}T23:59:59Z` : null,
        subtotal: totals.subtotal,
        discount_amount: totals.discount,
        tax_amount: totals.taxAmount,
        total: totals.total,
        status: form.status,
        notes: form.notes.trim() || null,
        items: items.map((l) => ({
          item_type: l.item_type,
          product_id: l.item_type === 'PRODUCT' ? l.product_id : null,
          plan_id: l.item_type === 'PLAN' ? l.plan_id : null,
          product_name: l.name || (l.item_type === 'PRODUCT' ? 'Product Offering' : 'Subscription Plan'),
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate) || 0,
          line_total: calculateLineTotal(l.quantity, l.unit_price),
        })),
      };

      if (isEdit) {
        await quotationService.update(id, payload);
        addToast('Quotation updated successfully', 'success');
      } else {
        await quotationService.create(payload);
        addToast('Quotation created successfully', 'success');
      }
      navigate('/quotations');
    } catch (err) {
      const msg = getErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} quotation`);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading quotation details...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/quotations')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <PageHeader
          title={isEdit ? `Edit Quotation ${form.quotation_number}` : 'New Quotation'}
          subtitle={isEdit ? 'Modify quote terms, pricing, and line offerings' : 'Create pricing estimate for a customer'}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Template Quick Loader */}
        {templates.length > 0 && !isEdit && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-900">Load Quotation Template</p>
                <p className="text-[11px] text-blue-700">Quickly pre-fill product bundles, default validity, and terms</p>
              </div>
            </div>
            <select
              onChange={(e) => handleApplyTemplate(e.target.value)}
              defaultValue=""
              className="text-xs px-3 py-1.5 border border-blue-300 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="">— Select a preset template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Customer & Dates Header Card */}
        <Card>
          <CardHeader>
            <CardTitle>Customer & Quotation Parameters</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Recipient Customer"
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
                  {c.name} {c.company ? `(${c.company})` : `(${c.email})`}
                </option>
              ))}
            </Select>

            <Input
              label="Quotation Date"
              type="date"
              value={form.quotation_date}
              onChange={(e) => setForm({ ...form, quotation_date: e.target.value })}
              required
            />

            <Input
              label="Validity Expiration Date"
              type="date"
              value={form.valid_until}
              onChange={(e) => {
                setForm({ ...form, valid_until: e.target.value });
                setErrors({ ...errors, valid_until: '' });
              }}
              error={errors.valid_until}
              required
            />
          </CardBody>
        </Card>

        {/* Quotation Line Items Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Products & Subscription Plans</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">Include physical offerings, digital services, and recurring tiers</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => addItem('PRODUCT')}>
                <Plus className="w-3.5 h-3.5" /> Add Product Line
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => addItem('PLAN')}>
                <Plus className="w-3.5 h-3.5" /> Add Plan Line
              </Button>
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            {errors.items && <p className="text-xs text-red-500 font-medium">{errors.items}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-28">Type</th>
                    <th className="px-3 py-2">Offering Selection *</th>
                    <th className="px-3 py-2 w-24">Qty *</th>
                    <th className="px-3 py-2 w-32">Unit Price (₹) *</th>
                    <th className="px-3 py-2 w-24">Tax (%)</th>
                    <th className="px-3 py-2 w-32 text-right">Line Total (₹)</th>
                    <th className="px-3 py-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, i) => {
                    const lineTotal = calculateLineTotal(item.quantity, item.unit_price);
                    const isPlan = item.item_type === 'PLAN';

                    return (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5">
                          <select
                            value={item.item_type}
                            onChange={(e) => updateItem(i, 'item_type', e.target.value)}
                            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                          >
                            <option value="PRODUCT">Product</option>
                            <option value="PLAN">Plan Tier</option>
                          </select>
                        </td>

                        <td className="px-3 py-2.5">
                          {isPlan ? (
                            <select
                              value={item.plan_id}
                              onChange={(e) => updateItem(i, 'plan_id', e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                            >
                              <option value="">— Select Subscription Plan —</option>
                              {plans.map((pl) => (
                                <option key={pl.id} value={pl.id}>
                                  {pl.name} ({pl.billing_interval} - {formatCurrency(pl.price)})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={item.product_id}
                              onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                            >
                              <option value="">— Select Product Offering —</option>
                              {products.map((pr) => (
                                <option key={pr.id} value={pr.id}>
                                  {pr.name} ({formatCurrency(pr.sales_price ?? pr.price ?? 0)})
                                </option>
                              ))}
                            </select>
                          )}
                          {errors[`item_${i}_selection`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`item_${i}_selection`]}</p>
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

        {/* Notes & Summary Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer Proposal Terms & Notes</CardTitle>
              </CardHeader>
              <CardBody>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Terms of service, delivery schedule, implementation milestones, or custom payment conditions..."
                  rows={5}
                />
              </CardBody>
            </Card>
          </div>

          <div>
            <Card className="bg-slate-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" /> Calculation Summary
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Gross Subtotal</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totals.subtotal)}</span>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-600 gap-2">
                  <span>Discount (₹)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discount_amount}
                    onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
                    className="w-28 text-right text-xs px-2 py-1 border border-slate-300 rounded bg-white outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Taxable Base</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totals.taxableBase)}</span>
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Estimated Taxes</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(totals.taxAmount)}</span>
                </div>

                <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-base">Grand Total</span>
                  <span className="font-bold text-lg text-emerald-700">{formatCurrency(totals.total)}</span>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => navigate('/quotations')}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading}>
                    {isEdit ? 'Save Changes' : 'Generate Quotation'}
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