import { OxygenUIThemeProvider, AcrylicOrangeTheme } from '@wso2/oxygen-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { loadConfig } from './config/runtimeConfig';
import { AccessControlProvider } from './contexts/AccessControlContext';
import './index.css';

const queryClient = new QueryClient();

// Load runtime configuration before rendering the app
loadConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <OxygenUIThemeProvider themes={[{ key: 'acrylicOrange', label: 'Acrylic Orange Theme', theme: AcrylicOrangeTheme }]} initialTheme="acrylicOrange">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <AccessControlProvider>
                <App />
              </AccessControlProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </OxygenUIThemeProvider>
    </StrictMode>,
  );
});
