// Minimal auth route map used for documentation/config in the gateway.
// Consumers can import `authRoutes` to discover available auth endpoints.
import { getAuthServiceUrl } from '../auth-service-url';

const authServiceUrl = getAuthServiceUrl();

export const authRoutes = [
  {
    method: 'POST',
    path: '/auth/login',
    description: 'Proxy: forwards credentials to Auth Service login endpoint',
    target: `${authServiceUrl}/auth/login`,
  },
  {
    method: 'POST',
    path: '/auth/register',
    description:
      'Proxy: forwards registration data to Auth Service register endpoint',
    target: `${authServiceUrl}/auth/register`,
  },
  {
    method: 'GET',
    path: '/auth/me',
    description:
      'Protected proxy: validates token with Auth Service and returns current user info',
    target: `${authServiceUrl}/auth/me`,
  },
  {
    method: 'GET',
    path: '/auth/admin',
    description: 'Example admin-only route proxied to gateway controller',
    target: `${authServiceUrl}/auth/admin`,
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    description:
      'Proxy: forwards refresh token to Auth Service to get a new token pair',
    target: `${authServiceUrl}/auth/refresh`,
  },
  {
    method: 'GET',
    path: '/auth/google',
    description: 'Initiates Google OAuth2 consent flow',
    target: `${authServiceUrl}/auth/google`,
  },
  {
    method: 'GET',
    path: '/auth/google/callback',
    description: 'Google OAuth2 callback issues JWT and redirects to frontend',
    target: `${authServiceUrl}/auth/google/callback`,
  },
] as const;

export type AuthRoute = (typeof authRoutes)[number];
