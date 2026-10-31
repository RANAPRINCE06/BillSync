import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSpinner } from './ui/Feedback';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, roleUpper } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles) {
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
    if (!normalizedAllowed.includes(roleUpper)) {
      return <Navigate to={roleUpper === 'CUSTOMER' ? '/portal' : '/'} replace />;
    }
  }

  return children;
}

export function GuestRoute({ children }) {
  const { user, loading, roleUpper } = useAuth();

  if (loading) return <PageSpinner />;

  if (user) {
    return <Navigate to={roleUpper === 'CUSTOMER' ? '/portal' : '/'} replace />;
  }

  return children;
}
