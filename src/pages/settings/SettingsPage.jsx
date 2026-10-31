import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services';
import { getErrorMessage } from '../../services/api';
import { PageHeader } from '../../components/ui/Common';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function SettingsPage() {
  const { user, roleUpper } = useAuth();
  const addToast = useToast();

  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [profileLoading, setProfileLoading] = useState(false);

  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passErrors, setPassErrors] = useState({});
  const [passLoading, setPassLoading] = useState(false);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      addToast('Name is required', 'error');
      return;
    }
    setProfileLoading(true);
    try {
      if (authService.updateProfile) {
        await authService.updateProfile(profileForm);
      }
      addToast('Profile updated successfully', 'success');
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to update profile'), 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const validatePass = () => {
    const e = {};
    if (!passForm.current_password) e.current_password = 'Current password is required';
    if (!passForm.new_password) {
      e.new_password = 'New password is required';
    } else if (passForm.new_password.length <= 8) {
      e.new_password = 'Password must be longer than 8 characters';
    } else if (!/[A-Z]/.test(passForm.new_password)) {
      e.new_password = 'Must contain at least one uppercase letter';
    } else if (!/[a-z]/.test(passForm.new_password)) {
      e.new_password = 'Must contain at least one lowercase letter';
    } else if (!/[0-9]/.test(passForm.new_password)) {
      e.new_password = 'Must contain at least one digit';
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(passForm.new_password)) {
      e.new_password = 'Must contain at least one special character';
    }

    if (passForm.new_password !== passForm.confirm_password) {
      e.confirm_password = 'Passwords do not match';
    }
    return e;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const errs = validatePass();
    if (Object.keys(errs).length) {
      setPassErrors(errs);
      return;
    }
    setPassLoading(true);
    try {
      if (authService.changePassword) {
        await authService.changePassword(passForm);
      }
      addToast('Password updated successfully', 'success');
      setPassForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      addToast(getErrorMessage(err, 'Failed to change password'), 'error');
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Account configuration & credentials" />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <Input
                label="Full Name"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                required
              />
              <Input
                label="Email Address"
                type="email"
                value={profileForm.email}
                disabled
                className="bg-slate-50 cursor-not-allowed"
              />
              <div className="flex items-center gap-3 py-1">
                <span className="text-sm text-slate-500">System Role:</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                  {roleUpper || 'CUSTOMER'}
                </span>
              </div>
              <Button type="submit" loading={profileLoading}>
                Save Profile
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security & Password</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleChangePassword} className="space-y-4" noValidate>
              <Input
                label="Current Password"
                type="password"
                value={passForm.current_password}
                onChange={(e) => {
                  setPassForm({ ...passForm, current_password: e.target.value });
                  setPassErrors({ ...passErrors, current_password: '' });
                }}
                error={passErrors.current_password}
                required
              />
              <Input
                label="New Password"
                type="password"
                placeholder="Must exceed 8 chars with uppercase, digit & symbol"
                value={passForm.new_password}
                onChange={(e) => {
                  setPassForm({ ...passForm, new_password: e.target.value });
                  setPassErrors({ ...passErrors, new_password: '' });
                }}
                error={passErrors.new_password}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                value={passForm.confirm_password}
                onChange={(e) => {
                  setPassForm({ ...passForm, confirm_password: e.target.value });
                  setPassErrors({ ...passErrors, confirm_password: '' });
                }}
                error={passErrors.confirm_password}
                required
              />
              <Button type="submit" loading={passLoading}>
                Update Password
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
