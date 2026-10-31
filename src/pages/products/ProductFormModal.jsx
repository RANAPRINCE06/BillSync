import { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button, IconButton } from '../../components/ui/Button';
import { productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

const INITIAL = {
  name: '',
  product_type: 'SERVICE',
  sales_price: '',
  cost_price: '',
  description: '',
  notes: '',
  is_active: true,
  variants: [],
};

export function ProductFormModal({ isOpen, onClose, onSaved, product }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [variants, setVariants] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        product_type: (product.product_type || product.type || 'SERVICE').toUpperCase(),
        sales_price: product.sales_price ?? product.price ?? '',
        cost_price: product.cost_price ?? '',
        description: product.description || '',
        notes: product.notes || '',
        is_active: product.is_active ?? true,
      });

      const baseSales = Number(product.sales_price ?? product.price ?? 0);
      const parsedVariants = (product.variants || []).map((v) => {
        let addl = v.additional_price;
        if (addl === undefined || addl === null) {
          if (v.price !== undefined && v.price !== null) {
            addl = Math.max(0, Number(v.price) - baseSales);
          } else {
            addl = 0;
          }
        }
        return {
          id: v.id || `v-${Date.now().toString(36)}`,
          name: v.name || '',
          sku: v.sku || '',
          additional_price: addl,
        };
      });
      setVariants(parsedVariants);
    } else {
      setForm(INITIAL);
      setVariants([]);
    }
    setErrors({});
  }, [product, isOpen]);

  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        id: `v-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`,
        name: '',
        sku: '',
        additional_price: 0,
      },
    ]);
  };

  const removeVariant = (idx) => {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx, field, value) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Product name is required';
    if (form.sales_price === '' || isNaN(form.sales_price)) {
      e.sales_price = 'Enter a valid base sales price';
    } else if (Number(form.sales_price) < 0) {
      e.sales_price = 'Base price must be non-negative';
    }
    if (form.cost_price !== '' && (isNaN(form.cost_price) || Number(form.cost_price) < 0)) {
      e.cost_price = 'Cost price must be non-negative';
    }
    variants.forEach((v, i) => {
      if (!v.name?.trim()) e[`variant_${i}_name`] = 'Variant name is required';
      if (v.additional_price === '' || isNaN(v.additional_price) || Number(v.additional_price) < 0) {
        e[`variant_${i}_price`] = 'Additional price must be non-negative';
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
      const basePrice = Number(form.sales_price);
      const payload = {
        name: form.name.trim(),
        product_type: form.product_type,
        sales_price: basePrice,
        cost_price: form.cost_price !== '' ? Number(form.cost_price) : 0,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        is_active: Boolean(form.is_active),
        variants: variants.map((v) => {
          const addl = Number(v.additional_price) || 0;
          return {
            id: v.id || `v-${Date.now().toString(36)}`,
            name: v.name.trim(),
            sku: v.sku?.trim() || '',
            additional_price: addl,
            price: basePrice + addl, // backward compatibility
            final_price: basePrice + addl,
          };
        }),
      };

      if (product) {
        await productService.update(product.id, payload);
      } else {
        await productService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save product');
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const basePriceNum = Number(form.sales_price) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product ? 'Edit Product & Variants' : 'Add New Product'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Product / Offering Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Cloud Virtual Server"
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select label="Product Type" value={form.product_type} onChange={set('product_type')} required>
            <option value="SERVICE">Service</option>
            <option value="PHYSICAL">Physical Product</option>
            <option value="DIGITAL">Digital Good</option>
            <option value="SUBSCRIPTION">Subscription Bundle</option>
          </Select>

          <Input
            label="Base Sales Price (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.sales_price}
            onChange={set('sales_price')}
            error={errors.sales_price}
            placeholder="0.00"
            required
          />

          <Input
            label="Cost Price (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={set('cost_price')}
            error={errors.cost_price}
            placeholder="0.00"
          />
        </div>

        <Textarea
          label="Public Description"
          value={form.description}
          onChange={set('description')}
          placeholder="Customer-facing description of the product or offering..."
          rows={2}
        />

        <Textarea
          label="Internal / Admin Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Operational notes, vendor fulfillment guidelines, SLA notes..."
          rows={2}
        />

        {/* Product Variants Section */}
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Product Variants</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {variants.length} variant{variants.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Formula: Base Price ({formatCurrency(basePriceNum)}) + Additional Variant Price = Final Displayed Price
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addVariant}>
              <Plus className="w-3.5 h-3.5" /> Add Variant
            </Button>
          </div>

          {variants.length === 0 ? (
            <div className="text-center py-4 bg-white rounded border border-dashed border-slate-200">
              <p className="text-xs text-slate-500">No variants configured.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Base price {formatCurrency(basePriceNum)} will apply as the standard single variant.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, i) => {
                const addlNum = Number(v.additional_price) || 0;
                const finalPrice = basePriceNum + addlNum;
                return (
                  <div key={v.id || i} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs space-y-2">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Variant Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Pro Tier / 10Gbps SFP+"
                          value={v.name}
                          onChange={(e) => updateVariant(i, 'name', e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        {errors[`variant_${i}_name`] && (
                          <p className="text-[10px] text-red-500 mt-0.5">{errors[`variant_${i}_name`]}</p>
                        )}
                      </div>

                      <div className="w-28">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">SKU Code</label>
                        <input
                          type="text"
                          placeholder="e.g. SPL-PRO"
                          value={v.sku}
                          onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      <div className="w-32">
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Additional Price (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 560"
                          value={v.additional_price}
                          onChange={(e) => updateVariant(i, 'additional_price', e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500"
                        />
                        {errors[`variant_${i}_price`] && (
                          <p className="text-[10px] text-red-500 mt-0.5">{errors[`variant_${i}_price`]}</p>
                        )}
                      </div>

                      <div className="pt-6">
                        <IconButton
                          icon={Trash2}
                          label="Remove Variant"
                          onClick={() => removeVariant(i)}
                          className="text-red-400 hover:text-red-600"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded text-xs border border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calculator className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          Base {formatCurrency(basePriceNum)} + Additional {formatCurrency(addlNum)}
                        </span>
                      </div>
                      <div className="font-semibold text-emerald-700">
                        Final Price: {formatCurrency(finalPrice)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="is_active_prod"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="is_active_prod" className="text-sm font-medium text-slate-700 cursor-pointer">
            Active in catalog for new quotations and subscriptions
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {product ? 'Update Product' : 'Create Product'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}