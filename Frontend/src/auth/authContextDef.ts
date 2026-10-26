import { createContext } from 'react';
import { User } from '@/types/models';

export interface AuthContextValue {
  user: User | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  loginSuccess: (userData: User, token: string, perms: string[]) => void;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
