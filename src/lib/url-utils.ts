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

/**
 * Get the auth URL (app subdomain auth page)
 */
export function getAuthUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: use relative path
    return '/auth';
  }

  const hostname = window.location.hostname;
  
  // Development - ALWAYS use relative path for localhost to prevent blocked redirects
  // Check for localhost, 127.0.0.1, or any local development domain
  if (hostname === 'localhost' || 
      hostname === '127.0.0.1' || 
      hostname.includes('localhost') ||
      hostname.includes('127.0.0.1') ||
      hostname.includes('.local')) {
    return '/auth';
  }

  // Check if we're already on app subdomain
  if (hostname.startsWith('app.')) {
    return '/auth';
  }

  // On main domain - redirect to app subdomain (production only)
  const mainDomain = getMainDomain();
  return `${window.location.protocol}//app.${mainDomain}/auth`;
}

