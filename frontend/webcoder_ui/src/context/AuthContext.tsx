import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthService } from '../services/ApiService';
import { User } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (access: string, refresh: string, userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState<string | null>(localStorage.getItem('refreshToken'));
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  useEffect(() => {
    const fetchUserOnLoad = async () => {
      if (token && !user) {
        try {
          console.log("AuthContext: Attempting to fetch user details on load...");
          const fetchedUser = await AuthService.getMe();
          if (fetchedUser) {
            setUser(fetchedUser as User);
            localStorage.setItem('user', JSON.stringify(fetchedUser));
            console.log("AuthContext: User details fetched and set on load:", fetchedUser);
          } else {
            console.warn("AuthContext: getMe returned no user data despite valid token on load.");
          }
        } catch (error) {
          console.error("AuthContext: Failed to fetch user details on load, logging out.", error);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setToken(null);
          setRefreshToken(null);
          setUser(null);
        }
      }
    };
    fetchUserOnLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = (access: string, refresh: string, userData: User) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access);
    setRefreshToken(refresh);
    setUser(userData);
    console.log("AuthContext: User logged in and data set:", userData);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    console.log("AuthContext: User logged out.");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, refreshToken, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
