import { useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppShell,
  Box,
  Button,
  Chip,
  ColorSchemeToggle,
  ComplexSelect,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Footer,
  Header,
  InputAdornment,
  MenuItem,
  Popover,
  Sidebar,
  TextField,
  Tooltip,
  Typography,
  UserMenu,
  useAppShell,
} from '@wso2/oxygen-ui';
import { BarChart3, Boxes, ChevronDown, ChevronRight, Eye, Hammer, HeartPulse, KeyRound, LayoutDashboard, LogOut, Rocket, ScrollText, Search, Server, Settings, SlidersHorizontal } from '@wso2/oxygen-ui-icons-react';
import { useAuth } from '../auth/AuthContext';
import { useOrgs } from '../hooks/useOrgs';
import { billingEnabled, planLabel, useBillingOrg } from '../hooks/useBilling';
import { useProjects, useProjectByHandler } from '../hooks/useProjects';
import { hasProject, hasWebApp, resolveWebAppNavId, useScope, webAppNavGroupOf, WEB_APP_NAV_LEAVES } from '../nav';
import type { WebAppNavId } from '../nav';
import { external, orgHomeUrl, projectHomeUrl, TRACK_PARAM, withTrack } from '../paths';

export default function AppLayout(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { displayName, username, logout } = useAuth();

  const appShellOptions = useMemo(() => ({ initialCollapsed: localStorage.getItem('sidebar:collapsed') === 'true' }), []);
  const { state: shell, actions } = useAppShell(appShellOptions);
  const handleToggleSidebar = () => {
    localStorage.setItem('sidebar:collapsed', String(!shell.sidebarCollapsed));
    actions.toggleSidebar();
  };

  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [orgMenuAnchor, setOrgMenuAnchor] = useState<HTMLElement | null>(null);
  const [orgSearch, setOrgSearch] = useState('');
  const orgSearchRef = useRef<HTMLInputElement>(null);
  const orgCardRef = useRef<HTMLDivElement>(null);

  const [projectMenuAnchor, setProjectMenuAnchor] = useState<HTMLElement | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const projectSearchRef = useRef<HTMLInputElement>(null);
  const projectCardRef = useRef<HTMLDivElement>(null);

  const { data: orgsData = [] } = useOrgs();
  // First-login billing activation (C10): activates the free plan, then feeds the plan badge.
  const { data: billingOrg } = useBillingOrg(scope.org);
  const plan = planLabel(billingOrg);
  const projectHandler = hasProject(scope) ? scope.project : '';
  const { data: project } = useProjectByHandler(scope.org, projectHandler);
  const { data: projects = [] } = useProjects(scope.org);

  const activeNavId: WebAppNavId = hasWebApp(scope) ? resolveWebAppNavId(scope, pathname) : 'overview';

  // The group holding the active page opens by default; an explicit user toggle (true/false) wins.
  const activeGroup = webAppNavGroupOf(activeNavId);
  const expandedMenus = activeGroup ? { [activeGroup]: true, ...shell.expandedMenus } : shell.expandedMenus;

  const handleNavSelect = (id: string) => {
    if (hasWebApp(scope)) {
      const leaf = WEB_APP_NAV_LEAVES.find((l) => l.id === id);
      // Keep the selected deployment track across web-app pages.
      if (leaf) navigate(withTrack(leaf.url(scope), searchParams.get(TRACK_PARAM)));
      return;
    }
    navigate(hasProject(scope) ? projectHomeUrl(scope.org, scope.project) : orgHomeUrl(scope.org));
  };

  // The org comes from the access token (one org per session; no STS org exchange), so switching
  // only navigates. Clear the cache when the org actually changes.
  const handleSwitchOrg = (handle: string) => {
    setOrgMenuAnchor(null);
    setOrgSearch('');
    if (handle !== scope.org) queryClient.clear();
    navigate(orgHomeUrl(handle));
  };

  return (
    <AppShell>
      <AppShell.Navbar>
        <Header>
          <Header.Toggle collapsed={shell.sidebarCollapsed} onToggle={handleToggleSidebar} />
          <Header.Brand>
            <Header.BrandLogo>
              <NavLink to={orgHomeUrl(scope.org)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  WebApp Hosting
                </Typography>
              </NavLink>
            </Header.BrandLogo>
          </Header.Brand>
          <Header.Switchers showDivider={false}>
            <Box
              ref={orgCardRef}
              role="button"
              tabIndex={0}
              sx={{ position: 'relative', display: 'inline-flex', alignSelf: 'center', cursor: 'pointer' }}
              onClick={() => navigate(orgHomeUrl(scope.org))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(orgHomeUrl(scope.org));
                }
              }}>
              <ComplexSelect
                value={scope.org}
                open={false}
                onChange={() => {}}
                onOpen={() => {}}
                size="small"
                sx={{ minWidth: 180, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } }}
                IconComponent={
                  orgsData.length <= 1
                    ? () => null
                    : ({ ownerState: _ownerState, ...props }) => (
                        <span
                          {...props}
                          role="button"
                          tabIndex={0}
                          aria-label="Change organization"
                          style={{ position: 'absolute', top: 'auto', bottom: '0', right: '6px', display: 'flex', pointerEvents: 'all', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOrgMenuAnchor(orgCardRef.current);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setOrgMenuAnchor(orgCardRef.current);
                            }
                          }}>
                          <ChevronDown size={18} />
                        </span>
                      )
                }
                SelectDisplayProps={{ 'aria-label': 'Select organization' }}
                renderValue={() => <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: scope.org }} />}
                label="Organization">
                <ComplexSelect.MenuItem value={scope.org}>
                  <ComplexSelect.MenuItem.Text primary={scope.org} secondary="Organization" primaryTypographyProps={{ noWrap: true, title: scope.org }} />
                </ComplexSelect.MenuItem>
              </ComplexSelect>
            </Box>
            <Popover
              anchorEl={orgMenuAnchor}
              open={Boolean(orgMenuAnchor)}
              onClose={() => {
                setOrgMenuAnchor(null);
                setOrgSearch('');
              }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              TransitionProps={{ onEntered: () => orgSearchRef.current?.focus() }}
              PaperProps={{ sx: { width: 260, mt: 0.5 } }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Organization
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search"
                  inputRef={orgSearchRef}
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <Divider />
              {orgsData
                .filter((o) => !orgSearch.trim() || o.handle.toLowerCase().includes(orgSearch.trim().toLowerCase()))
                .map((o) => (
                  <MenuItem key={o.handle} selected={scope.org === o.handle} onClick={() => handleSwitchOrg(o.handle)}>
                    {o.handle}
                  </MenuItem>
                ))}
            </Popover>

            {hasProject(scope) && (
              <>
                <ChevronRight size={16} style={{ opacity: 0.5, alignSelf: 'center' }} />
                <Box
                  ref={projectCardRef}
                  role="button"
                  tabIndex={0}
                  sx={{ position: 'relative', display: 'inline-flex', alignSelf: 'center', cursor: 'pointer' }}
                  onClick={() => navigate(projectHomeUrl(scope.org, scope.project))}>
                  <ComplexSelect
                    value={scope.project}
                    open={false}
                    onChange={() => {}}
                    onOpen={() => {}}
                    size="small"
                    sx={{ minWidth: 160, maxWidth: 220, '& .MuiListItemText-root': { minWidth: 0, overflow: 'hidden' } }}
                    IconComponent={({ ownerState: _ownerState, ...props }) => (
                      <span
                        {...props}
                        role="button"
                        tabIndex={0}
                        aria-label="Change project"
                        style={{ position: 'absolute', top: 'auto', bottom: '0', right: '6px', display: 'flex', pointerEvents: 'all', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectMenuAnchor(projectCardRef.current);
                        }}>
                        <ChevronDown size={18} />
                      </span>
                    )}
                    SelectDisplayProps={{ 'aria-label': 'Select project' }}
                    renderValue={() => <ComplexSelect.MenuItem.Text primary={project?.name ?? scope.project} secondary="Project" primaryTypographyProps={{ noWrap: true, title: project?.name ?? scope.project }} />}
                    label="Project">
                    <ComplexSelect.MenuItem value={scope.project}>
                      <ComplexSelect.MenuItem.Text primary={project?.name ?? scope.project} secondary="Project" />
                    </ComplexSelect.MenuItem>
                  </ComplexSelect>
                </Box>
                <Popover
                  anchorEl={projectMenuAnchor}
                  open={Boolean(projectMenuAnchor)}
                  onClose={() => {
                    setProjectMenuAnchor(null);
                    setProjectSearch('');
                  }}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  TransitionProps={{ onEntered: () => projectSearchRef.current?.focus() }}
                  PaperProps={{ sx: { width: 260, mt: 0.5 } }}>
                  <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Project
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search"
                      inputRef={projectSearchRef}
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Search size={16} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>
                  <Divider />
                  {projects
                    .filter((p) => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.trim().toLowerCase()))
                    .map((p) => (
                      <MenuItem
                        key={p.id}
                        selected={scope.project === p.handler}
                        onClick={() => {
                          setProjectMenuAnchor(null);
                          setProjectSearch('');
                          navigate(projectHomeUrl(scope.org, p.handler));
                        }}>
                        {p.name}
                      </MenuItem>
                    ))}
                </Popover>
              </>
            )}
          </Header.Switchers>
          <Header.Spacer />
          <Header.Actions>
            {billingEnabled() && plan && (
              <Tooltip title="Web App Hosting plan">
                <Chip
                  label={plan}
                  color="warning"
                  size="medium"
                  sx={{ fontWeight: 500, mx: 0.75, cursor: window.API_CONFIG.billingConsoleUrl ? 'pointer' : 'default' }}
                  onClick={window.API_CONFIG.billingConsoleUrl ? () => window.open(window.API_CONFIG.billingConsoleUrl, '_blank', 'noopener') : undefined}
                />
              </Tooltip>
            )}
            <ColorSchemeToggle />
            <UserMenu>
              <UserMenu.Trigger name={displayName || username || 'User'} />
              <UserMenu.Header name={displayName || username || 'User'} email={username} role="Admin" />
              <UserMenu.Divider />
              <UserMenu.Logout icon={<LogOut size={18} />} label="Sign Out" onClick={() => setConfirmSignOutOpen(true)} />
            </UserMenu>
          </Header.Actions>
        </Header>
      </AppShell.Navbar>

      <AppShell.Sidebar>
        <Sidebar collapsed={shell.sidebarCollapsed} activeItem={activeNavId} expandedMenus={expandedMenus} onSelect={handleNavSelect} onToggleExpand={actions.toggleMenu}>
          <Sidebar.Nav>
            <Sidebar.Category key="overview">
              <Sidebar.Item id="overview">
                <Sidebar.ItemIcon>
                  <LayoutDashboard size={20} />
                </Sidebar.ItemIcon>
                <Sidebar.ItemLabel>Overview</Sidebar.ItemLabel>
              </Sidebar.Item>
              {hasWebApp(scope) && (
                <>
                  <Sidebar.Item id="build">
                    <Sidebar.ItemIcon>
                      <Hammer size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Build</Sidebar.ItemLabel>
                  </Sidebar.Item>
                  <Sidebar.Item id="deploy">
                    <Sidebar.ItemIcon>
                      <Rocket size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Deploy</Sidebar.ItemLabel>
                  </Sidebar.Item>
                  <Sidebar.Item id="observe">
                    <Sidebar.ItemIcon>
                      <Eye size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Observe</Sidebar.ItemLabel>
                    <Sidebar.Item id="metrics">
                      <Sidebar.ItemIcon>
                        <BarChart3 size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Metrics</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="runtime-logs">
                      <Sidebar.ItemIcon>
                        <ScrollText size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Runtime Logs</Sidebar.ItemLabel>
                    </Sidebar.Item>
                  </Sidebar.Item>
                  <Sidebar.Item id="devops">
                    <Sidebar.ItemIcon>
                      <SlidersHorizontal size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>DevOps</Sidebar.ItemLabel>
                    <Sidebar.Item id="runtime">
                      <Sidebar.ItemIcon>
                        <Server size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Runtime</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="containers">
                      <Sidebar.ItemIcon>
                        <Boxes size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Containers</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="configs">
                      <Sidebar.ItemIcon>
                        <KeyRound size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Configs &amp; Secrets</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="health-checks">
                      <Sidebar.ItemIcon>
                        <HeartPulse size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Health Checks</Sidebar.ItemLabel>
                    </Sidebar.Item>
                    <Sidebar.Item id="scaling">
                      <Sidebar.ItemIcon>
                        <SlidersHorizontal size={20} />
                      </Sidebar.ItemIcon>
                      <Sidebar.ItemLabel>Scaling</Sidebar.ItemLabel>
                    </Sidebar.Item>
                  </Sidebar.Item>
                  <Sidebar.Item id="settings">
                    <Sidebar.ItemIcon>
                      <Settings size={20} />
                    </Sidebar.ItemIcon>
                    <Sidebar.ItemLabel>Settings</Sidebar.ItemLabel>
                  </Sidebar.Item>
                </>
              )}
            </Sidebar.Category>
          </Sidebar.Nav>
        </Sidebar>
      </AppShell.Sidebar>

      <AppShell.Main>
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto', overflowX: 'auto' }}>
            <Outlet />
          </Box>
        </Box>
      </AppShell.Main>

      <AppShell.Footer>
        <Footer>
          <Footer.Link href={external.documentation} target="_blank" rel="noopener noreferrer">
            Documentation
          </Footer.Link>
          <Footer.Link href={external.wso2} target="_blank" rel="noopener noreferrer">
            WSO2
          </Footer.Link>
          <Footer.Copyright>&copy; {new Date().getFullYear()}, WSO2 LLC.</Footer.Copyright>
        </Footer>
      </AppShell.Footer>

      <Dialog open={confirmSignOutOpen} onClose={() => setConfirmSignOutOpen(false)}>
        <DialogTitle>Sign out?</DialogTitle>
        <DialogContent>
          <DialogContentText>You'll need to sign in again to access your organizations and web apps.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSignOutOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setConfirmSignOutOpen(false);
              void logout();
            }}>
            Sign Out
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
