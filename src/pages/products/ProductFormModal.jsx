import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
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
};

export function ProductFormModal({ isOpen, onClose, onSaved, product }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
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
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [product, isOpen]);

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
    <Modal isOpen={isOpen} onClose={onClose} title={product ? 'Edit Product' : 'Add New Product'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Product / Service Name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="e.g. Cloud Hosting Plan"
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
            label="Sales Price (₹)"
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

        <Textarea
          label="Internal Notes"
          value={form.notes}
          onChange={set('notes')}
          placeholder="Private internal fulfillment notes"
          rows={2}
        />

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
            Active in catalog
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
