/**
 * Get the main domain (root domain) from the current hostname
 * Examples:
 * - app.jukobot.nl -> jukobot.nl
 * - app.jukobot.nl -> jukobot.nl
 * - jukobot.nl -> jukobot.nl
 * - localhost:3000 -> localhost:3000 (development)
 */
export function getMainDomain(): string {
  if (typeof window === 'undefined') {
    // Server-side: return empty string, will use relative paths
    return '';
  }

  const hostname = window.location.hostname;
  
  // Development - return as is
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return hostname + (window.location.port ? `:${window.location.port}` : '');
  }

  // Remove subdomain (e.g., app.jukobot.nl -> jukobot.nl)
  const parts = hostname.split('.');
  
  // If we have at least 2 parts (e.g., jukobot.nl), return last 2 parts
  // If we have 3+ parts (e.g., app.jukobot.nl), return last 2 parts
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  // Fallback: return hostname as is
  return hostname;
}

/**
 * Get the home URL (main domain root)
 */
export function getHomeUrl(): string {
  const mainDomain = getMainDomain();
  
  if (!mainDomain || mainDomain.includes('localhost')) {
    // Development or server-side: use relative path
    return '/';
  }

  // Production: use full URL with protocol
  return `${window.location.protocol}//${mainDomain}`;
}

