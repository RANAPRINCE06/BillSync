import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, CreditCard, FileText,
  Repeat, Receipt, DollarSign, Settings, LogOut, Zap,
  UserCheck, UserCog, Tag
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ALL_NAV = [
  // Admin & Staff Dashboard
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'STAFF'] },

  // Customer Self-Service Portal
  { to: '/portal', label: 'My Portal', icon: UserCheck, roles: ['CUSTOMER', 'ADMIN'] },

  // Operational Modules (Admin & Staff)
  { to: '/customers', label: 'Customers', icon: Users, roles: ['ADMIN', 'STAFF'] },
  { to: '/products', label: 'Products', icon: Package, roles: ['ADMIN', 'STAFF'] },
  { to: '/plans', label: 'Subscription Plans', icon: CreditCard, roles: ['ADMIN', 'STAFF'] },
  { to: '/quotations', label: 'Quotations', icon: FileText, roles: ['ADMIN', 'STAFF'] },
  { to: '/subscriptions', label: 'Subscriptions', icon: Repeat, roles: ['ADMIN', 'STAFF'] },
  { to: '/discounts', label: 'Discounts', icon: Tag, roles: ['ADMIN', 'STAFF'] },
  { to: '/invoices', label: 'Invoices', icon: Receipt, roles: ['ADMIN', 'STAFF'] },
  { to: '/payments', label: 'Payments', icon: DollarSign, roles: ['ADMIN', 'STAFF'] },

  // Administration (Admin Only)
  { to: '/users', label: 'Users & Roles', icon: UserCog, roles: ['ADMIN'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export function Sidebar({ collapsed }) {
  const { user, logout, roleUpper } = useAuth();
  const navigate = useNavigate();

  const currentRole = roleUpper || 'CUSTOMER';
  const navItems = ALL_NAV.filter((item) => item.roles.includes(currentRole));

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
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-xs">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="ml-3">
            <span className="text-base font-bold text-slate-900 block leading-tight">BillSync</span>
            <span className="text-[10px] text-slate-400 font-medium block">Subscription SaaS</span>
          </div>
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
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-xs'
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
          <div className="px-2 py-2 mb-1 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-xs font-semibold text-slate-800 truncate">{user?.name || user?.email}</p>
            <p className="text-[11px] text-blue-600 font-medium capitalize">{currentRole.toLowerCase()}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}
