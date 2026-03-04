import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { authApi } from '../services/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await authApi.getMe();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Token validation failed:', error);
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const response = await authApi.login(email, password);
      const { token, user } = response;

      localStorage.setItem('token', token);
      setUser(user);
      setIsAuthenticated(true);

      return { success: true, role: user.role };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
  }, []);

  const isAdmin = useCallback(() => user?.role === 'admin', [user]);
  const isUser = useCallback(() => user?.role === 'user', [user]);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    isAdmin,
    isUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
