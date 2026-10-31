import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, UserCheck, Shield, User } from 'lucide-react';
import { userService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui/Common';
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
  const addToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userService.getAll();
      const list = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setUsers(list);
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to load users'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
    addToast(editUser ? 'User profile updated' : 'User account created', 'success');
  };

  const handleDelete = async () => {
    if (!deleteModal.user) return;
    setActionLoading(true);
    try {
      await userService.delete(deleteModal.user.id);
      addToast('User deleted', 'info');
      fetchUsers();
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to delete user'), 'error');
    } finally {
      setActionLoading(false);
      setDeleteModal({ open: false, user: null });
    }
  };

  return (
    <div>
      <PageHeader
        title="User & Role Management"
        subtitle="Manage operators, administrative staff, and system access roles"
        action={
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add User
          </Button>
        }
      />

      <Card>
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
            <TableEmpty message="No users found." cols={6} />
          ) : (
            <TableBody>
              {users.map((u) => {
                const roleConfig = ROLE_BADGE[u.role] || ROLE_BADGE.CUSTOMER;
                const Icon = roleConfig.icon;
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
                    <Td className="text-slate-600">{u.email}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1">
                        <Badge label={roleConfig.label} variant={roleConfig.variant} />
                      </span>
                    </Td>
                    <Td>
                      <Badge
                        label={u.is_active !== false ? 'Active' : 'Deactivated'}
                        variant={u.is_active !== false ? 'success' : 'danger'}
                      />
                    </Td>
                    <Td>{formatDate(u.created_at)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
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

      <UserFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        user={editUser}
      />

      <ConfirmModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, user: null })}
        onConfirm={handleDelete}
        title="Delete User Account"
        message={`Are you sure you want to delete ${deleteModal.user?.name}? This action cannot be undone.`}
        confirmLabel="Delete User"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
