import type { ReactNode, JSX } from 'react';
import { useAccessControl } from '../contexts/AccessControlContext';

interface AuthorizedProps {
  permissions: string | string[];
  children: ReactNode;
  fallback?: JSX.Element;
}

// Permission checks are currently a stub (see AccessControlContext) — this component still gates
// through them so real permissions slot in later without touching call sites.
export default function Authorized({ permissions, children, fallback }: AuthorizedProps) {
  const { hasAnyPermission } = useAccessControl();
  const permList = Array.isArray(permissions) ? permissions : [permissions];
  if (hasAnyPermission(permList)) return <>{children}</>;
  return fallback ?? null;
}
