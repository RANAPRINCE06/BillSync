import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { productService } from '../../services';
import { useToast } from '../../context/ToastContext';

const INITIAL = { name: '', type: 'service', sales_price: '', cost_price: '', description: '' };

export function ProductFormModal({ isOpen, onClose, onSaved, product }) {
  const addToast = useToast();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        type: product.type || 'service',
        sales_price: product.sales_price ?? product.price ?? '',
        cost_price: product.cost_price ?? '',
        description: product.description || '',
      });
    } else {
      setForm(INITIAL);
    }
    setErrors({});
  }, [product, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Product name is required';
    if (form.sales_price === '' || isNaN(form.sales_price)) e.sales_price = 'Enter a valid price';
    else if (Number(form.sales_price) < 0) e.sales_price = 'Price must be positive';
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
        sales_price: Number(form.sales_price),
        cost_price: form.cost_price !== '' ? Number(form.cost_price) : null,
      };
      if (product) {
        await productService.update(product.id, payload);
      } else {
        await productService.create(payload);
      }
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to save product';
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
    <Modal isOpen={isOpen} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input label="Product Name" value={form.name} onChange={set('name')} error={errors.name} required />
        <Select label="Type" value={form.type} onChange={set('type')}>
          <option value="service">Service</option>
          <option value="consumable">Consumable</option>
          <option value="storable">Storable</option>
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Sales Price" type="number" min="0" step="0.01" value={form.sales_price}
            onChange={set('sales_price')} error={errors.sales_price} required />
          <Input label="Cost Price" type="number" min="0" step="0.01" value={form.cost_price}
            onChange={set('cost_price')} />
        </div>
        <Textarea label="Description" value={form.description} onChange={set('description')} rows={3} />
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" loading={loading}>{product ? 'Update' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

