// Minimal auth route map used for documentation/config in the gateway.
// Consumers can import `authRoutes` to discover available auth endpoints.

export const authRoutes = [
  {
    method: 'POST',
    path: '/auth/login',
    description: 'Proxy: forwards credentials to Auth Service login endpoint',
    target: 'http://localhost:3333/auth/login',
  },
  {
    method: 'POST',
    path: '/auth/register',
    description:
      'Proxy: forwards registration data to Auth Service register endpoint',
    target: 'http://localhost:3333/auth/register',
  },
  {
    method: 'GET',
    path: '/auth/me',
    description:
      'Protected proxy: validates token with Auth Service and returns current user info',
    target: 'http://localhost:3333/auth/me',
  },
  {
    method: 'GET',
    path: '/auth/admin',
    description: 'Example admin-only route proxied to gateway controller',
    target: 'http://localhost:3333/auth/admin',
  },
  // Append to authRoutes array:
  {
    method: 'GET',
    path: '/auth/google',
    description: 'Initiates Google OAuth2 consent flow',
    target: `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333'}/auth/google`,
  },
  {
    method: 'GET',
    path: '/auth/google/callback',
    description:
      'Google OAuth2 callback — issues JWT and redirects to frontend',
    target: `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333'}/auth/google/callback`,
  },
];

export type AuthRoute = (typeof authRoutes)[number];
