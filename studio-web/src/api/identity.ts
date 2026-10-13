import { request, type ItemList } from './client';

const BASE = '/api/identity';

export type Role = 'designer' | 'reviewer' | 'brand_admin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  workspace_id: number;
  avatar_color: string;
}

export interface Workspace {
  id: number;
  name: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const identityApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>(`${BASE}/login`, {
      method: 'POST',
      body: { email, password },
      redirectOn401: false,
    }),
  me: () => request<User>(`${BASE}/me`),
  listUsers: () => request<ItemList<User>>(`${BASE}/users`),
  getUser: (id: number) => request<User>(`${BASE}/users/${id}`),
  getWorkspace: (id: number) => request<Workspace>(`${BASE}/workspaces/${id}`),
};

export const ROLE_LABELS: Record<Role, string> = {
  designer: 'Designer',
  reviewer: 'Reviewer',
  brand_admin: 'Brand admin',
};
