import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, UserCheck, Shield, User, UserX, CheckCircle, Filter } from 'lucide-react';
import { userService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, SearchInput } from '../../components/ui/Common';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, Th, TableBody, Td, TableSkeleton, TableEmpty } from '../../components/ui/Table';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import { UserFormModal } from './UserFormModal';

const ROLE_BADGE = {
  ADMIN: { label: 'Admin', variant: 'purple', icon: Shield },
  STAFF: { label: 'Staff', variant: 'info', icon: UserCheck },
  CUSTOMER: { label: 'Customer', variant: 'default', icon: User },
};

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const addToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });
  const [toggleActiveModal, setToggleActiveModal] = useState({ open: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getAll();
      let list = Array.isArray(res.data) ? res.data : res.data?.items || [];

      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
      }

      if (roleFilter !== 'ALL') {
        list = list.filter((u) => (u.role || '').toUpperCase() === roleFilter.toUpperCase());
      }

      if (statusFilter !== 'ALL') {
        const isActive = statusFilter === 'ACTIVE';
        list = list.filter((u) => Boolean(u.is_active !== false) === isActive);
      }

      setUsers(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load user list'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 250);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  const isAdmin = (currentUser?.role || '').toUpperCase() === 'ADMIN';

  const openAdd = () => {
    setEditUser(null);
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    fetchUsers();
    addToast(editUser ? 'User profile updated' : 'Staff member account created', 'success');
  };

  const handleToggleActive = async () => {
    if (!toggleActiveModal.user) return;
    const target = toggleActiveModal.user;
    setActionLoading(true);
    try {
      const updatedStatus = !target.is_active;
      await userService.update(target.id, { is_active: updatedStatus });
      addToast(
        `User ${target.name} has been ${updatedStatus ? 'activated' : 'deactivated'}`,
        updatedStatus ? 'success' : 'info'
      );
      fetchUsers();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to update user status'), 'error');
    } finally {
      setActionLoading(false);
      setToggleActiveModal({ open: false, user: null });
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.user) return;
    setActionLoading(true);
    try {
      await userService.delete(deleteModal.user.id);
      addToast('User account deleted', 'info');
      fetchUsers();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete user'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, user: null });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-red-200">
        <h2 className="text-lg font-bold text-red-600">Access Restricted</h2>
        <p className="text-sm text-slate-500 mt-1">
          Only administrators have permission to manage staff members and system user access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="User & Role Management"
        subtitle="Manage operators, administrative staff, and system access roles"
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Staff Member
          </Button>
        }
      />

      <Card>
        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or email address..."
              className="w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
              <option value="CUSTOMER">Customer</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="DEACTIVATED">Deactivated Only</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <Table>
          <TableHead>
            <Th>User Profile</Th>
            <Th>Email Address</Th>
            <Th>System Role</Th>
            <Th>Account Status</Th>
            <Th>Joined Date</Th>
            <Th className="text-right">Actions</Th>
          </TableHead>
          {loading ? (
            <TableSkeleton cols={6} rows={4} />
          ) : users.length === 0 ? (
            <TableEmpty message="No users found matching your criteria." cols={6} />
          ) : (
            <TableBody>
              {users.map((u) => {
                const roleConfig = ROLE_BADGE[u.role] || ROLE_BADGE.CUSTOMER;
                const isActive = u.is_active !== false;

                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {u.name?.charAt(0) || 'U'}
                        </div>
                        <span className="font-semibold text-slate-900">{u.name}</span>
                      </div>
                    </Td>
                    <Td className="text-slate-600 font-mono text-xs">{u.email}</Td>
                    <Td>
                      <Badge label={roleConfig.label} variant={roleConfig.variant} />
                    </Td>
                    <Td>
                      <Badge
                        label={isActive ? 'Active' : 'Deactivated'}
                        variant={isActive ? 'success' : 'danger'}
                      />
                    </Td>
                    <Td>{formatDate(u.created_at)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {/* Toggle active / deactivate */}
                        <IconButton
                          icon={isActive ? UserX : CheckCircle}
                          label={isActive ? 'Deactivate user' : 'Activate user'}
                          onClick={() => setToggleActiveModal({ open: true, user: u })}
                          className={isActive ? 'text-amber-500 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-800'}
                        />
                        <IconButton icon={Pencil} label="Edit user & role" onClick={() => openEdit(u)} />
                        <IconButton
                          icon={Trash2}
                          label="Delete user"
                          onClick={() => setDeleteModal({ open: true, user: u })}
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
      <UserFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        user={editUser}
      />

      {/* Activate / Deactivate Confirmation Modal */}
      <ConfirmModal
        isOpen={toggleActiveModal.open}
        onClose={() => setToggleActiveModal({ open: false, user: null })}
        onConfirm={handleToggleActive}
        title={toggleActiveModal.user?.is_active ? 'Deactivate Staff Account' : 'Activate Staff Account'}
        message={
          toggleActiveModal.user?.is_active
            ? `Deactivating ${toggleActiveModal.user?.name} will prevent them from signing in and accessing administrative tools.`
            : `Activating ${toggleActiveModal.user?.name} will restore their login privileges with their assigned role.`
        }
        confirmLabel={toggleActiveModal.user?.is_active ? 'Deactivate Account' : 'Activate Account'}
        variant={toggleActiveModal.user?.is_active ? 'danger' : 'primary'}
        loading={actionLoading}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, user: null })}
        onConfirm={handleDelete}
        title="Delete User Account"
        message={`Are you sure you want to permanently delete user account ${deleteModal.user?.name}? This action cannot be undone.`}
        confirmLabel="Delete User"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}