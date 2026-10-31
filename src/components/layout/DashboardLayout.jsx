import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import {
  Menu, X, User, Search, Bell,
  Settings, LogOut, CheckCircle, AlertTriangle, ArrowRight, Clock
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { customerService, subscriptionService, invoiceService } from '../../services';

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user, roleUpper, logout } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  // Header State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Mock Notifications
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      title: 'Invoice Due Tomorrow',
      message: 'INV-2026-003 for ₹4,720 is scheduled for payment tomorrow.',
      type: 'warning',
      time: '10 mins ago',
      read: false,
      link: '/invoices',
    },
    {
      id: 'notif-2',
      title: 'Subscription Renewed',
      message: 'SUB-2026-001 enterprise agreement was auto-renewed successfully.',
      type: 'success',
      time: '1 hour ago',
      read: false,
      link: '/subscriptions',
    },
    {
      id: 'notif-3',
      title: 'New Quotation Request',
      message: 'Acme Technologies approved quotation proposal QT-2026-002.',
      type: 'info',
      time: 'Yesterday',
      read: true,
      link: '/quotations',
    },
  ]);

  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick Omnisearch implementation
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const runSearch = async () => {
      try {
        const [cRes, sRes, iRes] = await Promise.all([
          customerService.getAll().catch(() => ({ data: [] })),
          subscriptionService.getAll().catch(() => ({ data: [] })),
          invoiceService.getAll().catch(() => ({ data: [] })),
        ]);
        const custs = (Array.isArray(cRes.data) ? cRes.data : cRes.data?.items || [])
          .filter((c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
          .slice(0, 3)
          .map((c) => ({ type: 'Customer', label: c.name, sub: c.email, to: `/customers/${c.id}` }));

        const subs = (Array.isArray(sRes.data) ? sRes.data : sRes.data?.items || [])
          .filter((s) => s.subscription_number?.toLowerCase().includes(q) || s.plan_name?.toLowerCase().includes(q))
          .slice(0, 3)
          .map((s) => ({ type: 'Subscription', label: s.subscription_number, sub: s.plan_name, to: `/subscriptions/${s.id}` }));

        const invs = (Array.isArray(iRes.data) ? iRes.data : iRes.data?.items || [])
          .filter((i) => i.invoice_number?.toLowerCase().includes(q))
          .slice(0, 3)
          .map((i) => ({ type: 'Invoice', label: i.invoice_number, sub: `₹${i.total}`, to: `/invoices/${i.id}` }));

        setSearchResults([...custs, ...subs, ...invs]);
      } catch {
        setSearchResults([]);
      }
    };
    runSearch();
  }, [searchQuery]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    addToast('Logged out of BillSync session', 'info');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    addToast('All notifications marked as read', 'info');
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
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 cursor-pointer text-slate-600"
              onClick={() => setMobileSidebarOpen(true)}
              title="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              className="hidden lg:flex p-2 rounded-lg hover:bg-slate-100 cursor-pointer text-slate-600"
              onClick={() => setCollapsed(!collapsed)}
              title="Toggle Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search Button */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Search records, invoices, clients...</span>
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile Search Button */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="sm:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Notification Icon & Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg relative cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 text-xs">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-bold text-slate-900">Notifications ({unreadCount})</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[11px] text-blue-600 hover:underline cursor-pointer font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate(n.link);
                        }}
                        className={`p-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                          !n.read ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{n.title}</span>
                          <span className="text-[10px] text-slate-400">{n.time}</span>
                        </div>
                        <p className="text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar / Current Identity Dropdown */}
            <div className="relative pl-2 border-l border-slate-200" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
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
              </button>

              {/* Profile Dropdown Menu */}
              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="font-bold text-slate-900 truncate">{user?.name || 'User Profile'}</p>
                    <p className="text-slate-500 font-mono text-[11px] truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                      Role: {roleUpper}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                    <span>Settings</span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600 cursor-pointer font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Global Quick Search Dialog */}
      <Modal
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
        }}
        title="Quick Record Search"
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers, subscriptions, invoices..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
            {searchResults.length === 0 ? (
              <p className="text-center py-6 text-slate-400">
                {searchQuery ? 'No matching records found' : 'Type name, email, plan, or invoice #'}
              </p>
            ) : (
              searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                    navigate(item.to);
                  }}
                  className="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 mr-2">
                      {item.type}
                    </span>
                    <span className="font-semibold text-slate-900">{item.label}</span>
                    <span className="text-slate-400 text-[11px] block">{item.sub}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* User Profile Inspection Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="My Profile Information"
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">{user?.name}</h3>
              <p className="text-slate-500">{user?.email}</p>
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                Role: {roleUpper}
              </span>
            </div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Account Status:</span>
              <span className="font-semibold text-emerald-600">Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Session Mode:</span>
              <span className="font-mono text-slate-700">Authenticated Token</span>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setProfileModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

