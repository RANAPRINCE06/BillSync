import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button, IconButton } from '../../components/ui/Button';
import { productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';

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
      setVariants(product.variants || []);
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
        id: `v-${Date.now().toString(36)}`,
        name: '',
        sku: '',
        price: form.sales_price || '',
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
      e.sales_price = 'Enter a valid sales price';
    } else if (Number(form.sales_price) < 0) {
      e.sales_price = 'Price must be non-negative';
    }
    if (form.cost_price !== '' && (isNaN(form.cost_price) || Number(form.cost_price) < 0)) {
      e.cost_price = 'Cost price must be non-negative';
    }
    variants.forEach((v, i) => {
      if (!v.name?.trim()) e[`variant_${i}_name`] = 'Variant name required';
      if (v.price === '' || isNaN(v.price) || Number(v.price) < 0) e[`variant_${i}_price`] = 'Valid price required';
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
        name: form.name.trim(),
        product_type: form.product_type,
        sales_price: Number(form.sales_price),
        cost_price: form.cost_price !== '' ? Number(form.cost_price) : 0,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        is_active: Boolean(form.is_active),
        variants: variants.map((v) => ({
          id: v.id || `v-${Date.now().toString(36)}`,
          name: v.name.trim(),
          sku: v.sku?.trim() || '',
          price: Number(v.price) || Number(form.sales_price),
        })),
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product ? 'Edit Product & Variants' : 'Add New Product'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Product / Service Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Cloud Virtual Server"
          required
        />
        <Select label="Product Type" value={form.product_type} onChange={set('product_type')}>
          <option value="SERVICE">Service</option>
          <option value="PHYSICAL">Physical Product</option>
          <option value="DIGITAL">Digital Good</option>
          <option value="SUBSCRIPTION">Subscription Bundle</option>
        </Select>

        <div className="grid grid-cols-2 gap-4">
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
          placeholder="Detailed client-facing description"
          rows={2}
        />

        {/* Product Variants Section */}
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Product Variants</p>
              <p className="text-[11px] text-slate-500">Configure size, tier, or specifications for this offering</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addVariant}>
              <Plus className="w-3.5 h-3.5" /> Add Variant
            </Button>
          </div>

          {variants.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">No variants created. Base product price will apply.</p>
          ) : (
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={i} className="flex gap-2 items-center bg-white p-2 rounded border border-slate-200">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Variant Name (e.g. 4 vCPU / 8GB)"
                      value={v.name}
                      onChange={(e) => updateVariant(i, 'name', e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500"
                    />
                    {errors[`variant_${i}_name`] && (
                      <p className="text-[10px] text-red-500 mt-0.5">{errors[`variant_${i}_name`]}</p>
                    )}
                  </div>
                  <div className="w-28">
                    <input
                      type="text"
                      placeholder="SKU Code"
                      value={v.sku}
                      onChange={(e) => updateVariant(i, 'sku', e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      placeholder="Price (₹)"
                      value={v.price}
                      onChange={(e) => updateVariant(i, 'price', e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-500"
                    />
                    {errors[`variant_${i}_price`] && (
                      <p className="text-[10px] text-red-500 mt-0.5">{errors[`variant_${i}_price`]}</p>
                    )}
                  </div>
                  <IconButton
                    icon={Trash2}
                    label="Remove"
                    onClick={() => removeVariant(i)}
                    className="text-red-400 hover:text-red-600"
                  />
                </div>
              ))}
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
          <label htmlFor="is_active_prod" className="text-sm font-medium text-slate-700">
            Active in catalog for new subscriptions
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
