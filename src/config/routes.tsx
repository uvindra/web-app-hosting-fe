import type { JSX } from 'react';
import { Route, Routes } from 'react-router';
import ProtectedRoute from '../auth/ProtectedRoute';
import AppLayout from '../layouts/AppLayout';
import Login from '../pages/Login';
import SignIn from '../pages/SignIn';
import RootRedirect from '../pages/RootRedirect';
import Placeholder from '../pages/Placeholder';
import Projects from '../pages/Projects';
import CreateProject from '../pages/CreateProject';
import WebApps from '../pages/WebApps';
import CreateWebAppOptions from '../pages/CreateWebAppOptions';
import ImportWebAppOptions from '../pages/ImportWebAppOptions';
import CreateWebAppForm from '../pages/CreateWebAppForm';
import WebAppOverview from '../pages/WebAppOverview';
import GitHubAuthCallback from '../pages/GitHubAuthCallback';
import DevSeedSession from '../pages/DevSeedSession';
import { ghAppCallbackUrl, loginUrl, oidcCallbackUrl } from '../paths';

// Route path patterns (with :param placeholders) mirror the concrete URLs paths.ts builds —
// paths.ts is the source of truth callers use to navigate; this table is what react-router
// matches against.
export default function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path={loginUrl()} element={<Login />} />
      <Route path={oidcCallbackUrl()} element={<SignIn />} />
      {/* Bare popup window (no AppLayout/ProtectedRoute) that GitHub OAuth redirects back to. */}
      <Route path={ghAppCallbackUrl()} element={<GitHubAuthCallback />} />
      {/* Dev-only demo helper — never registered in a production build. Run `pnpm demo`. */}
      {import.meta.env.DEV && <Route path="/dev-login" element={<DevSeedSession />} />}

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/organizations/:orgHandler" element={<Projects />} />
          <Route path="/organizations/:orgHandler/projects/new" element={<CreateProject />} />
          <Route path="/organizations/:orgHandler/projects/:projectHandler/home" element={<WebApps />} />
          <Route path="/organizations/:orgHandler/projects/:projectHandler/webapps/new" element={<CreateWebAppOptions />} />
          <Route path="/organizations/:orgHandler/projects/:projectHandler/webapps/new/import" element={<ImportWebAppOptions />} />
          <Route path="/organizations/:orgHandler/projects/:projectHandler/webapps/new/configure" element={<CreateWebAppForm />} />
          <Route path="/organizations/:orgHandler/projects/:projectHandler/webapps/:webAppHandler/overview" element={<WebAppOverview />} />
        </Route>
      </Route>

      <Route path="*" element={<Placeholder title="Not Found" />} />
    </Routes>
  );
}
