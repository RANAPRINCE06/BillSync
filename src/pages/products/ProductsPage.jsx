import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Layers, Trash2, Eye, Filter } from 'lucide-react';
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
import { ProductViewModal } from './ProductViewModal';

function formatCurrency(val) {
  if (val === undefined || val === null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val);
}

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Product Types' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'PHYSICAL', label: 'Physical Product' },
  { value: 'DIGITAL', label: 'Digital Good' },
  { value: 'SUBSCRIPTION', label: 'Subscription Bundle' },
];

export default function ProductsPage() {
  const addToast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  
  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, product: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (typeFilter !== 'ALL') params.type = typeFilter;
      const res = await productService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setProducts(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load products'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 250);
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

  const openView = (p) => {
    setViewProduct(p);
  };

  const handleSaved = () => {
    setModalOpen(false);
    fetchProducts();
    addToast(editProduct ? 'Product updated successfully' : 'Product created successfully', 'success');
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
    <div className="space-y-5">
      <PageHeader
        title="Products & Offerings"
        subtitle={`${products.length} product(s) configured with flexible tier pricing and variants`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        }
      />

      <Card>
        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, notes or description..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Products Table */}
        <Table>
          <TableHead>
            <Th>Product / Offering</Th>
            <Th>Type</Th>
            <Th>Base Sales Price</Th>
            <Th>Cost Price</Th>
            <Th>Variants & Pricing</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : products.length === 0 ? (
            <TableEmpty message="No products found matching your filter criteria." cols={7} />
          ) : (
            <TableBody>
              {products.map((p) => {
                const variants = p.variants || [];
                const baseSales = Number(p.sales_price ?? p.price ?? 0);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <button
                        type="button"
                        onClick={() => openView(p)}
                        className="text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {p.name}
                      </button>
                      {p.description && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{p.description}</div>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={p.product_type || p.type} />
                    </Td>
                    <Td className="font-semibold text-slate-900">{formatCurrency(baseSales)}</Td>
                    <Td className="text-slate-500">{formatCurrency(p.cost_price)}</Td>
                    <Td>
                      {variants.length > 0 ? (
                        <div className="flex flex-col gap-1 max-w-xs">
                          {variants.slice(0, 3).map((v, idx) => {
                            const addl = Number(v.additional_price ?? Math.max(0, (v.price ?? baseSales) - baseSales));
                            const finalPrice = Number(v.final_price ?? baseSales + addl);
                            return (
                              <div
                                key={idx}
                                className="inline-flex items-center justify-between gap-2 px-2 py-0.5 rounded text-[11px] bg-slate-50 border border-slate-200"
                                title={`Base ${formatCurrency(baseSales)} + Add'l ${formatCurrency(addl)} = ${formatCurrency(finalPrice)}`}
                              >
                                <div className="flex items-center gap-1 truncate">
                                  <Layers className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                                  <span className="font-medium truncate max-w-[110px] text-slate-700">{v.name}</span>
                                </div>
                                <span className="font-semibold text-emerald-700 shrink-0">
                                  {formatCurrency(finalPrice)}
                                </span>
                              </div>
                            );
                          })}
                          {variants.length > 3 && (
                            <span className="text-[10px] text-slate-400 pl-1">
                              +{variants.length - 3} more variant(s)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Base standard only</span>
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
                        <IconButton
                          icon={Eye}
                          label="View Product Details"
                          onClick={() => openView(p)}
                          className="text-slate-500 hover:text-blue-600"
                        />
                        <IconButton
                          icon={Pencil}
                          label="Edit Product & Variants"
                          onClick={() => openEdit(p)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Delete Product"
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

      {/* Form Modal (Add / Edit) */}
      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        product={editProduct}
      />

      {/* View Details Modal */}
      <ProductViewModal
        isOpen={Boolean(viewProduct)}
        onClose={() => setViewProduct(null)}
        product={viewProduct}
        onEdit={(p) => openEdit(p)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, product: null })}
        onConfirm={handleDelete}
        title="Delete Product Offering"
        message={`Are you sure you want to delete ${deleteModal.product?.name}? Any existing historical invoices or subscriptions referencing this item will remain recorded.`}
        confirmLabel="Delete Product"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}