import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, CreditCard, FileText,
  Repeat, Receipt, DollarSign, Settings, LogOut, ChevronRight,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ALL_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'staff'] },
  { to: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'staff'] },
  { to: '/products', label: 'Products', icon: Package, roles: ['admin', 'staff'] },
  { to: '/plans', label: 'Subscription Plans', icon: CreditCard, roles: ['admin', 'staff'] },
  { to: '/quotations', label: 'Quotations', icon: FileText, roles: ['admin', 'staff'] },
  { to: '/subscriptions', label: 'Subscriptions', icon: Repeat, roles: ['admin', 'staff', 'customer'] },
  { to: '/invoices', label: 'Invoices', icon: Receipt, roles: ['admin', 'staff', 'customer'] },
  { to: '/payments', label: 'Payments', icon: DollarSign, roles: ['admin', 'staff', 'customer'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ collapsed }) {
  const { user, logout, isAdmin, isStaff, isCustomer } = useAuth();
  const navigate = useNavigate();

  const userRole = user?.role || 'customer';
  const navItems = ALL_NAV.filter((item) => item.roles.includes(userRole));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside
      className={`
        fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-30 flex flex-col
        transition-all duration-200
        ${collapsed ? 'w-16' : 'w-60'}
      `}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-slate-100 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="ml-3 text-base font-bold text-slate-800">BillSync</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors group
                  ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      <div className="border-t border-slate-100 p-3 shrink-0">
        {!collapsed && (
          <div className="px-2 py-2 mb-1">
            <p className="text-xs font-medium text-slate-800 truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  );
}

