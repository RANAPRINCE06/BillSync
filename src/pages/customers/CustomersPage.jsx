import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil } from 'lucide-react';
import { customerService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { CustomerFormModal } from './CustomerFormModal';

export default function CustomersPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customerService.getAll(search ? { search } : {});
      const list = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setCustomers(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load customers'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  const openAdd = () => {
    setEditCustomer(null);
    setModalOpen(true);
  };
  const openEdit = (c) => {
    setEditCustomer(c);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    fetchCustomers();
    addToast(editCustomer ? 'Customer updated successfully' : 'Customer added successfully', 'success');
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} registered customer(s)`}
        action={
          <Button onClick={openAdd} size="md">
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        }
      />

      <Card>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or company..."
            className="w-full max-w-sm"
          />
        </div>
        <Table>
          <TableHead>
            <Th>Name / Organization</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th>Billing Address</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={5} rows={6} />
          ) : customers.length === 0 ? (
            <TableEmpty message="No customers found. Click 'Add Customer' to create your first client." cols={5} />
          ) : (
            <TableBody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td>{c.email}</Td>
                  <Td>{c.phone || '—'}</Td>
                  <Td className="max-w-xs truncate text-slate-500">{c.billing_address || c.address || '—'}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View details" onClick={() => navigate(`/customers/${c.id}`)} />
                      <IconButton icon={Pencil} label="Edit customer" onClick={() => openEdit(c)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </TableBody>
          )}
        </Table>
      </Card>

      <CustomerFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        customer={editCustomer}
      />
    </div>
  );
}
