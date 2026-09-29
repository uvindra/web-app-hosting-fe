import type { JSX } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext';
import { loginUrl } from '../paths';
import { saveRedirectUrl } from './tokenManager';

// Permissions aren't enforced yet — the Web App Hosting backend doesn't expose a permission
// model. AccessControlContext currently grants everything; this route only checks that the user
// has a session. Revisit once the backend defines real org/project/webapp-level permissions.
export default function ProtectedRoute(): JSX.Element {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    saveRedirectUrl(window.location.href);
    return <Navigate to={loginUrl()} replace />;
  }

  return <Outlet />;
}
