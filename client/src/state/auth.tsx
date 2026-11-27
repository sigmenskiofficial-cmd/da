import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiLogin, apiLogout, apiMe, apiRegister, type User } from '../lib/api';

type AuthValue = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  register: (username: string, email: string, password: string) => Promise<{ user: User; note: string | null }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiMe();
      setUser(data.user);
      setIsAdmin(Boolean(data.isAdmin));
    } catch {
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiLogin(identifier, password);
    setUser(data.user);
    setIsAdmin(data.user.role === 'admin');
    return data.user;
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const data = await apiRegister(username, email, password);
    setUser(data.user);
    setIsAdmin(data.user.role === 'admin');
    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, isAdmin, loading, login, register, logout, refresh, setUser }),
    [user, isAdmin, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
