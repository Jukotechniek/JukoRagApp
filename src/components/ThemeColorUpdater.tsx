'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ThemeColorUpdater() {
  const { theme, systemTheme } = useTheme();
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    // Update theme-color meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const color = resolvedTheme === 'dark' ? '#1a1d26' : '#ffffff';
    
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }

    // Also update manifest theme-color if possible (for PWA)
    // Note: manifest.json is static, but we can update the meta tag which browsers use
  }, [resolvedTheme]);

  return null;
}

