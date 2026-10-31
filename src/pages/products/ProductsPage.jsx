import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Layers, Trash2 } from 'lucide-react';
import { productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { ProductFormModal } from './ProductFormModal';

function formatCurrency(val) {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

export default function ProductsPage() {
  const addToast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, product: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productService.getAll(search ? { search } : {});
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setProducts(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load products'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 300);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  const openAdd = () => {
    setEditProduct(null);
    setModalOpen(true);
  };
  const openEdit = (p) => {
    setEditProduct(p);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    fetchProducts();
    addToast(editProduct ? 'Product updated' : 'Product created', 'success');
  };

  const handleDelete = async () => {
    if (!deleteModal.product) return;
    setActionLoading(true);
    try {
      await productService.delete(deleteModal.product.id);
      addToast('Product removed from catalog', 'info');
      fetchProducts();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete product'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, product: null });
    }
  };

  return (
    <div>
      <PageHeader
        title="Products & Offerings"
        subtitle={`${products.length} catalog product(s) with variant configurations`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        }
      />

      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name or description..."
            className="w-full max-w-sm"
          />
        </div>
        <Table>
          <TableHead>
            <Th>Product / Offering</Th>
            <Th>Type</Th>
            <Th>Base Price</Th>
            <Th>Cost Price</Th>
            <Th>Variants</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : products.length === 0 ? (
            <TableEmpty message="No products found in the catalog." cols={7} />
          ) : (
            <TableBody>
              {products.map((p) => {
                const variants = p.variants || [];
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={p.product_type || p.type} />
                    </Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(p.sales_price ?? p.price)}</Td>
                    <Td className="text-slate-500">{formatCurrency(p.cost_price)}</Td>
                    <Td>
                      {variants.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {variants.map((v, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200"
                              title={`${v.name} (${v.sku || 'No SKU'}) - ₹${v.price}`}
                            >
                              <Layers className="w-2.5 h-2.5 text-blue-500" />
                              <span className="font-medium truncate max-w-[90px]">{v.name}</span>
                              <span className="text-slate-400">({formatCurrency(v.price)})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Standard only</span>
                      )}
                    </Td>
                    <Td>
                      <Badge
                        label={p.is_active !== false ? 'Active' : 'Inactive'}
                        variant={p.is_active !== false ? 'success' : 'default'}
                      />
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Pencil} label="Edit product & variants" onClick={() => openEdit(p)} />
                        <IconButton
                          icon={Trash2}
                          label="Delete product"
                          onClick={() => setDeleteModal({ open: true, product: p })}
                          className="text-red-400 hover:text-red-600"
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TableBody>
          )}
        </Table>
      </Card>

      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        product={editProduct}
      />

      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, product: null })}
        onConfirm={handleDelete}
        title="Delete Product Offering"
        message={`Are you sure you want to delete ${deleteModal.product?.name}? Active subscriptions referencing this product will be retained.`}
        confirmLabel="Delete Product"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
