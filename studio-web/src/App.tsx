import { defaultTheme, Provider } from '@adobe/react-spectrum';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useHref, useNavigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { ThemeProvider, useTheme } from './lib/theme';
import { DirectoryProvider } from './lib/users';
import { AssetPage } from './pages/AssetPage';
import { BrandKitPage } from './pages/BrandKitPage';
import { CampaignPage } from './pages/CampaignPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReviewPage } from './pages/ReviewPage';

/** Spectrum provider wired to the router so Spectrum links navigate client side. */
export function SpectrumRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { colorScheme } = useTheme();
  return (
    <Provider
      theme={defaultTheme}
      colorScheme={colorScheme}
      router={{ navigate, useHref }}
      UNSAFE_className="app-provider"
      minHeight="100vh"
    >
      {children}
    </Provider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <DirectoryProvider>
              <AppShell />
            </DirectoryProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/assets/:id" element={<AssetPage />} />
        <Route path="/reviews/:id" element={<ReviewPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/:id" element={<CampaignPage />} />
        <Route path="/brand" element={<BrandKitPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SpectrumRoot>
            <AppRoutes />
          </SpectrumRoot>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
