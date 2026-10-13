import type { Role } from '../api/identity';

/** Users the identity service creates on an empty database (see docs/api.md). */
export interface SeedUser {
  name: string;
  email: string;
  role: Role;
  avatar_color: string;
}

export const SEED_USERS: SeedUser[] = [
  { name: 'Leo Park', email: 'leo@northwind.example', role: 'designer', avatar_color: '#E8590C' },
  { name: 'Ana Ruiz', email: 'ana@northwind.example', role: 'designer', avatar_color: '#2F9E44' },
  { name: 'Maya Okafor', email: 'maya@northwind.example', role: 'reviewer', avatar_color: '#1C7ED6' },
  { name: 'Sam Whitfield', email: 'sam@northwind.example', role: 'reviewer', avatar_color: '#AE3EC9' },
  {
    name: 'Priya Natarajan',
    email: 'priya@northwind.example',
    role: 'brand_admin',
    avatar_color: '#C92A2A',
  },
];

export const SEED_PASSWORD = 'lumen-demo';
