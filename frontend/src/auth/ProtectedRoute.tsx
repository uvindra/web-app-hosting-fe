import type { JSX } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { loginUrl, withOrg } from '../paths';
import { configuredOrgHandle, saveRedirectUrl } from './tokenManager';

// Permissions aren't enforced yet — the Web App Hosting backend doesn't expose a permission
// model. AccessControlContext currently grants everything; this route only checks that the user
// has a session. Revisit once the backend defines real org/project/webapp-level permissions.
export default function ProtectedRoute(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    saveRedirectUrl(window.location.href);
    return <Navigate to={loginUrl()} replace />;
  }

  // With a configured ORG_HANDLE (local OpenChoreo) there is only one org: move URLs from an older session
  // (e.g. under the user's ouHandle) onto it, so the header and links show the org the BFF really uses.
  const org = configuredOrgHandle();
  const path = `${location.pathname}${location.search}${location.hash}`;
  if (org && withOrg(path, org) !== path) {
    return <Navigate to={withOrg(path, org)} replace />;
  }

  return <Outlet />;
}
