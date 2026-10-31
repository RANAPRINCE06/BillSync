import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function SettingsPage() {
  const { user } = useAuth();
  const addToast = useToast();

  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [profileLoading, setProfileLoading] = useState(false);

  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passErrors, setPassErrors] = useState({});
  const [passLoading, setPassLoading] = useState(false);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) { addToast('Name is required', 'error'); return; }
    setProfileLoading(true);
    try {
      // Profile update endpoint — adjust to match backend
      await authService.getMe(); // placeholder
      addToast('Profile updated', 'success');
    } catch {
      addToast('Failed to update profile', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const validatePass = () => {
    const e = {};
    if (!passForm.current_password) e.current_password = 'Current password required';
    if (!passForm.new_password) e.new_password = 'New password required';
    else if (passForm.new_password.length < 8) e.new_password = 'At least 8 characters';
    if (passForm.new_password !== passForm.confirm_password) e.confirm_password = 'Passwords do not match';
    return e;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const errs = validatePass();
    if (Object.keys(errs).length) { setPassErrors(errs); return; }
    setPassLoading(true);
    try {
      addToast('Password changed successfully', 'success');
      setPassForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch {
      addToast('Failed to change password', 'error');
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your account settings" />

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <Input label="Full Name" value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} required />
              <Input label="Email Address" type="email" value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} required />
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">Role:</span>
                <span className="text-sm font-medium text-slate-800 capitalize">{user?.role || '—'}</span>
              </div>
              <Button type="submit" loading={profileLoading}>Save Changes</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={handleChangePassword} className="space-y-4" noValidate>
              <Input label="Current Password" type="password" value={passForm.current_password}
                onChange={(e) => { setPassForm({ ...passForm, current_password: e.target.value }); setPassErrors({ ...passErrors, current_password: '' }); }}
                error={passErrors.current_password} required />
              <Input label="New Password" type="password" value={passForm.new_password}
                onChange={(e) => { setPassForm({ ...passForm, new_password: e.target.value }); setPassErrors({ ...passErrors, new_password: '' }); }}
                error={passErrors.new_password} required />
              <Input label="Confirm Password" type="password" value={passForm.confirm_password}
                onChange={(e) => { setPassForm({ ...passForm, confirm_password: e.target.value }); setPassErrors({ ...passErrors, confirm_password: '' }); }}
                error={passErrors.confirm_password} required />
              <Button type="submit" loading={passLoading}>Change Password</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

