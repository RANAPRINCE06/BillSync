import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { productService } from '../../services';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
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
      setProducts(res.data || []);
    } catch {
      addToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 300);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  const openAdd = () => { setEditProduct(null); setModalOpen(true); };
  const openEdit = (p) => { setEditProduct(p); setModalOpen(true); };

  const handleSaved = () => {
    setModalOpen(false);
    fetchProducts();
    addToast(editProduct ? 'Product updated' : 'Product added', 'success');
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} product(s)`}
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        }
      />

      <Card>
        <div className="px-4 py-3 border-b border-slate-100">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..." className="max-w-xs" />
        </div>
        <Table>
          <TableHead>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Sales Price</Th>
            <Th>Cost Price</Th>
            <Th>Description</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={6} rows={5} />
          ) : products.length === 0 ? (
            <TableEmpty message="No products found" cols={6} />
          ) : (
            <TableBody>
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="capitalize">{p.type || '—'}</Td>
                  <Td>{formatCurrency(p.sales_price || p.price)}</Td>
                  <Td>{formatCurrency(p.cost_price)}</Td>
                  <Td className="max-w-xs truncate text-slate-500">{p.description || '—'}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton icon={Pencil} label="Edit" onClick={() => openEdit(p)} />
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

