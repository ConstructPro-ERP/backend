function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getAuthServiceUrl(): string {
  const explicitUrl = process.env.AUTH_SERVICE_URL?.trim();
  if (explicitUrl) {
    return trimTrailingSlash(explicitUrl);
  }

  const port = process.env.AUTH_SERVICE_PORT?.trim() || '3333';
  return `http://localhost:${port}`;
}
