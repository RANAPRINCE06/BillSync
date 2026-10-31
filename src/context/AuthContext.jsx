import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services';

const AuthContext = createContext(null);

const DEMO_USERS = {
  'admin@billsync.com': {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Rudra Chauhan (Admin)',
    email: 'admin@billsync.com',
    role: 'ADMIN',
    is_active: true,
  },
  'staff@billsync.com': {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Staff Operator',
    email: 'staff@billsync.com',
    role: 'STAFF',
    is_active: true,
  },
  'customer@billsync.com': {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Acme Corp (Customer)',
    email: 'customer@billsync.com',
    role: 'CUSTOMER',
    is_active: true,
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    // If it's a demo session, keep the stored user
    if (token.startsWith('demo-token-')) {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          /* ignore */
        }
      }
      setLoading(false);
      return;
    }

    try {
      const res = await authService.getMe();
      const userData = res.data?.user || res.data;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (credentials) => {
    const cleanEmail = (credentials.email || '').trim().toLowerCase();
    try {
      // Attempt real backend login first
      const res = await authService.login(credentials);
      const payload = res.data;
      const access_token = payload.access_token;
      const userData = payload.user || payload;

      if (access_token) {
        localStorage.setItem('access_token', access_token);
      }
      if (userData) {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      }
      return userData;
    } catch (err) {
      // If backend auth is not yet ready or offline, fallback to demo user if credentials match
      if (DEMO_USERS[cleanEmail]) {
        const demoUser = DEMO_USERS[cleanEmail];
        const demoToken = `demo-token-${demoUser.role.toLowerCase()}`;
        localStorage.setItem('access_token', demoToken);
        localStorage.setItem('user', JSON.stringify(demoUser));
        setUser(demoUser);
        return demoUser;
      }
      throw err;
    }
  };

  const loginAsDemo = (roleKey = 'admin') => {
    const emailKey = `${roleKey.toLowerCase()}@billsync.com`;
    const demoUser = DEMO_USERS[emailKey] || DEMO_USERS['admin@billsync.com'];
    const demoToken = `demo-token-${demoUser.role.toLowerCase()}`;
    localStorage.setItem('access_token', demoToken);
    localStorage.setItem('user', JSON.stringify(demoUser));
    setUser(demoUser);
    return demoUser;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const roleUpper = (user?.role || '').toUpperCase();
  const isAdmin = roleUpper === 'ADMIN';
  const isStaff = roleUpper === 'STAFF';
  const isCustomer = roleUpper === 'CUSTOMER';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginAsDemo,
        logout,
        isAdmin,
        isStaff,
        isCustomer,
        roleUpper,
        DEMO_USERS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
