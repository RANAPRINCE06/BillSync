import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { productService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge, StatusBadge } from '../../components/ui/Badge';
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

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} product(s) in catalog`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        }
      />

      <Card>
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name or description..."
            className="w-full max-w-sm"
          />
        </div>
        <Table>
          <TableHead>
            <Th>Product Name</Th>
            <Th>Type</Th>
            <Th>Sales Price</Th>
            <Th>Cost Price</Th>
            <Th>Status</Th>
            <Th>Description</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={7} rows={5} />
          ) : products.length === 0 ? (
            <TableEmpty message="No products found in the catalog." cols={7} />
          ) : (
            <TableBody>
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <Td className="font-semibold text-slate-900">{p.name}</Td>
                  <Td>
                    <StatusBadge status={p.product_type || p.type} />
                  </Td>
                  <Td className="font-medium text-slate-900">{formatCurrency(p.sales_price ?? p.price)}</Td>
                  <Td className="text-slate-500">{formatCurrency(p.cost_price)}</Td>
                  <Td>
                    <Badge
                      label={p.is_active !== false ? 'Active' : 'Inactive'}
                      variant={p.is_active !== false ? 'success' : 'default'}
                    />
                  </Td>
                  <Td className="max-w-xs truncate text-slate-500">{p.description || '—'}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Pencil} label="Edit product" onClick={() => openEdit(p)} />
                    </div>
                  </Td>
                </tr>
              ))}
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
    </div>
  );
}
