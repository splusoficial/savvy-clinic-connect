import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readAuthBackup, persistAuthBackup, clearAuthBackup } from '@/lib/auth-persist';

interface AuthContextType {
  isAuthenticated: boolean;
  authInitialized: boolean;
  clinicName: string;
  whatsappConnected: boolean;
  showNotificationBanner: boolean;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  dismissNotificationBanner: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showNotificationBanner, setShowNotificationBanner] = useState(true);
  const [clinicName, setClinicName] = useState<string>('');
  const [authInitialized, setAuthInitialized] = useState(false);
  const whatsappConnected = Math.random() > 0.5; // Simula conexão aleatória
  useEffect(() => {
    // Banner persisted setting
    const savedBanner = localStorage.getItem('secretaria-plus-banner');
    if (savedBanner === 'dismissed') {
      setShowNotificationBanner(false);
    }

    // IMPORTANT: Set listener first, then get initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      const user = session?.user as any;
      if (user) {
        const raw = user.user_metadata?.name || user.user_metadata?.full_name || user.email || 'Usuário';
        const formatted = String(raw).replace(/[._-]/g, ' ').trim();
        setClinicName(formatted);
      } else {
        setClinicName('');
      }
      if (session) setAuthInitialized(true);
      // Persist backup of tokens after auth changes (defer to avoid deadlocks)
      setTimeout(async () => {
        try {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s) await persistAuthBackup(s);
        } catch {}
      }, 0);
    });

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsAuthenticated(true);
          const user = session?.user as any;
          if (user) {
            const raw = user.user_metadata?.name || user.user_metadata?.full_name || user.email || 'Usuário';
            const formatted = String(raw).replace(/[._-]/g, ' ').trim();
            setClinicName(formatted);
          }
          setAuthInitialized(true);
          return;
        }
        const backup = await readAuthBackup();
        if (backup?.access_token && backup?.refresh_token) {
          await supabase.auth.setSession({ access_token: backup.access_token, refresh_token: backup.refresh_token });
        }
        const { data: { session: s2 } } = await supabase.auth.getSession();
        setIsAuthenticated(!!s2);
        const user2 = s2?.user as any;
        if (user2) {
          const raw = user2.user_metadata?.name || user2.user_metadata?.full_name || user2.email || 'Usuário';
          const formatted = String(raw).replace(/[._-]/g, ' ').trim();
          setClinicName(formatted);
        } else {
          setClinicName('');
        }
      } catch (e) {
        console.warn('Auth init failed', e);
      } finally {
        setAuthInitialized(true);
      }
    })();

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Legacy no-op login to keep type compatibility (not used anymore)
  const login = (_email: string, _password: string) => {
    console.warn('Login via tela foi desativado. Use o magic link.');
    return false;
  };

  const logout = () => {
    supabase.auth.signOut();
    setIsAuthenticated(false);
    clearAuthBackup();
  };

  const dismissNotificationBanner = () => {
    setShowNotificationBanner(false);
    localStorage.setItem('secretaria-plus-banner', 'dismissed');
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        authInitialized,
        clinicName,
        whatsappConnected,
        showNotificationBanner,
        login,
        logout,
        dismissNotificationBanner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};