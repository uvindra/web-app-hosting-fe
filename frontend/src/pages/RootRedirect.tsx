import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { loginUrl, orgHomeUrl } from '../paths';
import { getSessionOrgHandle } from '../auth/tokenManager';

export default function RootRedirect(): JSX.Element {
  const orgHandle = getSessionOrgHandle();
  return <Navigate to={orgHandle ? orgHomeUrl(orgHandle) : loginUrl()} replace />;
}
