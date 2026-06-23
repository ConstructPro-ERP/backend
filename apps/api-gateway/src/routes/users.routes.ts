// Minimal user route map used for documentation/config in the gateway.
// Consumers can import `userRoutes` to discover available user endpoints.

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL ?? 'http://localhost:3334';

export const userRoutes = [
  {
    method: 'GET',
    path: '/users',
    description: 'Admin-only: proxy to User Service — list all users',
    target: `${USER_SERVICE_URL}/users`,
    roles: ['Admin'],
  },
  {
    method: 'POST',
    path: '/users',
    description: 'Admin-only: proxy to User Service — create a new user',
    target: `${USER_SERVICE_URL}/users`,
    roles: ['Admin'],
  },
  {
    method: 'GET',
    path: '/users/:id',
    description: 'Protected proxy: fetch a single user by ID',
    target: `${USER_SERVICE_URL}/users/:id`,
    roles: ['Admin', 'Sales Manager', 'Project Manager', 'Accountant'],
  },
  {
    method: 'PATCH',
    path: '/users/:id',
    description:
      'Admin-only: proxy to User Service — update user fields (role, status, email, etc.)',
    target: `${USER_SERVICE_URL}/users/:id`,
    roles: ['Admin'],
  },
  {
    method: 'PATCH',
    path: '/users/:id/profile',
    description:
      'Protected proxy: any authenticated user may update their own profile (name, avatar)',
    target: `${USER_SERVICE_URL}/users/:id/profile`,
    roles: [], // JwtAuthGuard only — no role restriction
  },
  {
    method: 'DELETE',
    path: '/users/:id',
    description:
      'Admin-only: proxy to User Service — deactivate (soft-delete) a user',
    target: `${USER_SERVICE_URL}/users/:id`,
    roles: ['Admin'],
  },
];

export type UserRoute = (typeof userRoutes)[number];