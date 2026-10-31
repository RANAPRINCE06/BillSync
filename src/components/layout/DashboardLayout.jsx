import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, Shield, UserCheck, User } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user, roleUpper, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const handleSwitchRole = (roleKey) => {
    const nextUser = loginAsDemo(roleKey);
    addToast(`Switched active test role to ${nextUser.role} (${nextUser.name})`, 'info');
    if (roleKey.toLowerCase() === 'customer') {
      navigate('/portal');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative z-50">
            <Sidebar collapsed={false} />
          </div>
          <button
            className="absolute top-4 left-64 z-50 p-2 bg-white rounded-full shadow cursor-pointer"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main area */}
      <div className={`flex-1 flex flex-col transition-all duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <button
              className="hidden lg:flex p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Right Header with Quick Role Testing Switcher */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Role Demo Switcher */}
            <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
              <span className="text-[11px] text-slate-400 px-2 font-semibold uppercase tracking-wider">Test Role:</span>
              <button
                type="button"
                onClick={() => handleSwitchRole('admin')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  roleUpper === 'ADMIN'
                    ? 'bg-purple-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Shield className="w-3 h-3" /> Admin
              </button>
              <button
                type="button"
                onClick={() => handleSwitchRole('staff')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  roleUpper === 'STAFF'
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <UserCheck className="w-3 h-3" /> Staff
              </button>
              <button
                type="button"
                onClick={() => handleSwitchRole('customer')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  roleUpper === 'CUSTOMER'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <User className="w-3 h-3" /> Customer
              </button>
            </div>

            {/* Profile Avatar / Current Identity */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-blue-700">
                  {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight max-w-[130px] truncate">
                  {user?.name || user?.email}
                </p>
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                  {roleUpper || 'USER'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

