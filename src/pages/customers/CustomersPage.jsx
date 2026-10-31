import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Building, Filter } from 'lucide-react';
import { customerService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { CustomerFormModal } from './CustomerFormModal';

export default function CustomersPage() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, customer: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (companyFilter !== 'ALL') params.company = companyFilter;

      const res = await customerService.getAll(params);
      const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setCustomers(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load customers'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, companyFilter]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 250);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  // Extract unique companies for filter dropdown
  const uniqueCompanies = Array.from(
    new Set(customers.map((c) => c.company).filter(Boolean))
  );

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

  const handleDelete = async () => {
    if (!deleteModal.customer) return;
    setActionLoading(true);
    try {
      await customerService.delete(deleteModal.customer.id);
      addToast('Customer deleted', 'info');
      fetchCustomers();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete customer'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, customer: null });
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} registered client(s)`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customers, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `customers_export_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                addToast('Customer directory exported successfully', 'success');
              }}
              size="md"
            >
              Export
            </Button>
            <Button onClick={openAdd} size="md">
              <Plus className="w-4 h-4" /> Add Customer
            </Button>
          </div>
        }
      />

      <Card>
        {/* Search & Filter Bar */}
        <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, company, or phone..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Companies</option>
              {uniqueCompanies.map((comp) => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
            {(search || companyFilter !== 'ALL') && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCompanyFilter('ALL');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        <Table>
          <TableHead>
            <Th>Customer Name</Th>
            <Th>Company Name</Th>
            <Th>Email Address</Th>
            <Th>Phone</Th>
            <Th>Address</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={6} rows={6} />
          ) : customers.length === 0 ? (
            <TableEmpty message="No customers found matching the search criteria." cols={6} />
          ) : (
            <TableBody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <Td>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    {c.notes && (
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{c.notes}</div>
                    )}
                  </Td>
                  <Td>
                    {c.company ? (
                      <span className="inline-flex items-center gap-1 text-slate-800 font-medium text-xs">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {c.company}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Individual</span>
                    )}
                  </Td>
                  <Td className="text-slate-600">{c.email}</Td>
                  <Td className="text-slate-600">{c.phone || '—'}</Td>
                  <Td className="max-w-xs truncate text-slate-500 text-xs">
                    {c.address || c.billing_address || '—'}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Eye} label="View customer details" onClick={() => navigate(`/customers/${c.id}`)} />
                      <IconButton icon={Pencil} label="Edit customer" onClick={() => openEdit(c)} />
                      <IconButton
                        icon={Trash2}
                        label="Delete customer"
                        onClick={() => setDeleteModal({ open: true, customer: c })}
                        className="text-red-400 hover:text-red-600"
                      />
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

      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, customer: null })}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`Are you sure you want to delete ${deleteModal.customer?.name}? This will affect their linked records.`}
        confirmLabel="Delete Customer"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
