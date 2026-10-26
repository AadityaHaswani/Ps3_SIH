import React, { useEffect, useState, useCallback } from 'react';
import { User } from '@/types/models';
import { authApi } from '@/api/modules/auth.api';
import { tokenStore } from '@/api/client';
import { toast } from 'sonner';
import { AuthContext, AuthContextValue } from './authContextDef';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      tokenStore.clear();
    } finally {
      setUser(null);
      setPermissions([]);
      toast.info('You have been signed out.');
    }
  }, []);

  const loginSuccess = useCallback((userData: User, token: string, perms: string[]) => {
    tokenStore.set(token);
    setUser(userData);
    setPermissions(perms || userData.permissions || []);
  }, []);

  const reloadUser = useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setUser(data.user);
      setPermissions(data.permissions || data.user.permissions || []);
    } catch (err) {
      tokenStore.clear();
      setUser(null);
      setPermissions([]);
      throw err;
    }
  }, []);

  useEffect(() => {
    tokenStore.setSessionExpiredHandler(() => {
      setUser(null);
      setPermissions([]);
      toast.error('Your session has expired. Please sign in again.');
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        await authApi.refreshSession();
        const me = await authApi.getMe();
        if (isMounted) {
          setUser(me.user);
          setPermissions(me.permissions || me.user.permissions || []);
        }
      } catch {
        if (isMounted) {
          tokenStore.clear();
          setUser(null);
          setPermissions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const value: AuthContextValue = {
    user,
    permissions,
    isAuthenticated: !!user,
    isLoading,
    loginSuccess,
    logout,
    reloadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
