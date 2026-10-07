import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { loginUrl, orgHomeUrl } from '../paths';

export default function RootRedirect(): JSX.Element {
  const orgHandle = localStorage.getItem('org_handle');
  return <Navigate to={orgHandle ? orgHomeUrl(orgHandle) : loginUrl()} replace />;
}
