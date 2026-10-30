import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { ApiError, authApi, setAccessToken, setRefreshHandler } from './api';
import { cancelScheduledReminders } from './notifications';
import { storage, storageKeys } from './storage';
import type { AuthResponse, User } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signInPatient: (email: string, password: string) => Promise<User>;
  registerPatient: Parameters<typeof authApi.register>[0] extends never
    ? never
    : (payload: Parameters<typeof authApi.register>[0]) => Promise<User>;
  signInCaregiver: (code: string) => Promise<User>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readCachedUser(): Promise<User | null> {
  const raw = await storage.getItem(storageKeys.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    queryClient.clear();
    await Promise.all([
      storage.removeItem(storageKeys.accessToken),
      storage.removeItem(storageKeys.refreshToken),
      storage.removeItem(storageKeys.user),
    ]);
    await cancelScheduledReminders();
  }, [queryClient]);

  const persistSession = useCallback(
    async (auth: AuthResponse, clearCache = false) => {
      if (clearCache) queryClient.clear();
      setAccessToken(auth.access_token);
      setUser(auth.user);
      setStatus('authenticated');
      await Promise.all([
        storage.setItem(storageKeys.accessToken, auth.access_token),
        storage.setItem(storageKeys.refreshToken, auth.refresh_token),
        storage.setItem(storageKeys.user, JSON.stringify(auth.user)),
      ]);
    },
    [queryClient],
  );

  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (refreshPromise.current) return refreshPromise.current;

    const promise = (async () => {
      const refreshToken = await storage.getItem(storageKeys.refreshToken);
      if (!refreshToken) return null;
      try {
        const auth = await authApi.refresh(refreshToken);
        await persistSession(auth);
        return auth.access_token;
      } catch {
        await clearSession();
        return null;
      } finally {
        refreshPromise.current = null;
      }
    })();

    refreshPromise.current = promise;
    return promise;
  }, [clearSession, persistSession]);

  useEffect(() => {
    setRefreshHandler(refreshSession);
    return () => setRefreshHandler(null);
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [storedAccess, refreshToken, cachedUser] = await Promise.all([
        storage.getItem(storageKeys.accessToken),
        storage.getItem(storageKeys.refreshToken),
        readCachedUser(),
      ]);

      if (cancelled) return;
      if (!refreshToken) {
        setStatus('unauthenticated');
        return;
      }

      setAccessToken(storedAccess);
      if (cachedUser) {
        setUser(cachedUser);
        setStatus('authenticated');
      }

      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
        await storage.setItem(storageKeys.user, JSON.stringify(me));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          const refreshed = await refreshSession();
          if (!refreshed) return;
          try {
            const me = await authApi.me();
            if (cancelled) return;
            setUser(me);
            setStatus('authenticated');
            await storage.setItem(storageKeys.user, JSON.stringify(me));
          } catch {
            await clearSession();
          }
        } else if (!cachedUser) {
          // Network failure without a cached profile: ask the user to sign in.
          setStatus('unauthenticated');
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSession]);

  const signInPatient = useCallback(
    async (email: string, password: string) => {
      const auth = await authApi.login(email, password);
      await persistSession(auth, true);
      return auth.user;
    },
    [persistSession],
  );

  const registerPatient = useCallback(
    async (payload: Parameters<typeof authApi.register>[0]) => {
      const auth = await authApi.register(payload);
      await persistSession(auth, true);
      return auth.user;
    },
    [persistSession],
  );

  const signInCaregiver = useCallback(
    async (code: string) => {
      const auth = await authApi.caregiverLogin(code);
      await persistSession(auth, true);
      return auth.user;
    },
    [persistSession],
  );

  const signOut = useCallback(async () => {
    const refreshToken = await storage.getItem(storageKeys.refreshToken);
    if (refreshToken) {
      // Revoke server-side in the background. Local sign-out must not wait for
      // the network or appear stuck when the API is slow/unreachable.
      void authApi.logout(refreshToken).catch(() => undefined);
    }
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
      setStatus('authenticated');
      await storage.setItem(storageKeys.user, JSON.stringify(me));
      return me;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signInPatient,
      registerPatient,
      signInCaregiver,
      signOut,
      refreshUser,
    }),
    [
      status,
      user,
      signInPatient,
      registerPatient,
      signInCaregiver,
      signOut,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
