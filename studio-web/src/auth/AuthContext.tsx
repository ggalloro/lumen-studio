import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearSession, getStoredUser, getToken, setSession } from '../api/client';
import { identityApi, type User } from '../api/identity';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Reads the `exp` claim without verifying the signature (the backends do that). */
function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

function initialSession(): { token: string | null; user: User | null } {
  const token = getToken();
  if (!token || isExpired(token)) {
    clearSession();
    return { token: null, user: null };
  }
  return { token, user: getStoredUser<User>() };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState(initialSession);

  // Refresh the stored profile once per load; a 401 here redirects to /login.
  useEffect(() => {
    if (!session.token) return;
    identityApi
      .me()
      .then((user) => {
        setSession(session.token as string, user);
        setSessionState((s) => ({ ...s, user }));
      })
      .catch(() => {
        /* handled by the request wrapper or shown by pages */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await identityApi.login(email, password);
    setSession(token, user);
    setSessionState({ token, user });
    return user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionState({ token: null, user: null });
  }, []);

  const value = useMemo(
    () => ({ user: session.user, token: session.token, login, logout }),
    [session, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
