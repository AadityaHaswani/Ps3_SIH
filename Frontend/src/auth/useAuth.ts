import { useContext } from 'react';
import { AuthContext, AuthContextValue } from './authContextDef';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
