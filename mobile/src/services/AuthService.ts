// Auth service — mobile port. Login captures the access token from the
// body AND the wc_refresh cookie from Set-Cookie (see ApiClient.ts header
// comment for the live-API verification trail).
import { apiFetch, cookieFromResponse, extractErrorMessage } from './ApiClient';
import { API_V1_URL } from './config';
import type { LoginResponse, RegisterResponse, User } from '../types/api';

export interface SessionTokens {
  access: string;
  refresh: string;
}

/** Login; resolves the user plus the captured token pair. */
export async function login(credentials: {
  username: string;
  password: string;
}): Promise<{ user: User; tokens: SessionTokens | null }> {
  const response = await fetch(`${API_V1_URL}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as unknown;
    throw new Error(
      extractErrorMessage(errorData) || response.statusText || `HTTP ${response.status}`,
    );
  }
  const body = (await response.json()) as LoginResponse;
  const refresh = cookieFromResponse(response, 'wc_refresh');
  const access = body.access ?? null;
  const tokens = access && refresh ? { access, refresh } : null;
  return { user: body.user, tokens };
}

export const AuthService = {
  register: (userData: { username: string; email: string; password1: string; password2: string }) =>
    apiFetch<RegisterResponse>('/users/register/', {
      method: 'POST',
      body: JSON.stringify(userData),
      anonymous: true,
    }),
  getMe: () => apiFetch<User>('/users/me/'),
  changePassword: (passwordData: { new_password1: string; new_password2: string }) =>
    apiFetch<{ detail?: string }>('/users/password/change/', {
      method: 'POST',
      body: JSON.stringify(passwordData),
    }),
  logout: () => apiFetch<{ detail?: string }>('/auth/logout/', { method: 'POST' }),
  getSolvedIds: () => apiFetch<{ solved: number[]; attempted: number[] }>('/users/me/solved-ids/'),
};
