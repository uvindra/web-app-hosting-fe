import { createContext, useContext, useMemo } from 'react';
import type { ReactNode, JSX } from 'react';

interface AccessControlContextType {
  hasPermission: (permission: string) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const AccessControlContext = createContext<AccessControlContextType | undefined>(undefined);

// Stub pending backend permissions: the Web App Hosting API doesn't expose a permission model
// yet, so every check passes. Keep this as the single seam to fill in once it does — call sites
// already gate through `hasPermission`/`Authorized`, so wiring in a real permission set later is a
// change confined to this file.
export function AccessControlProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useMemo<AccessControlContextType>(
    () => ({
      hasPermission: () => true,
      hasAllPermissions: () => true,
      hasAnyPermission: () => true,
    }),
    [],
  );

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccessControl(): AccessControlContextType {
  const context = useContext(AccessControlContext);
  if (!context) {
    throw new Error('useAccessControl must be used within AccessControlProvider');
  }
  return context;
}
