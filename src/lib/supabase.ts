import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

// Support both Vite (import.meta.env) and Next.js (process.env)
const supabaseUrl = typeof window !== 'undefined' 
  ? (import.meta.env?.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
  
const supabaseAnonKey = typeof window !== 'undefined'
  ? (import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = process.env.NODE_ENV === 'production' && typeof window === 'undefined'
    ? 'Missing Supabase environment variables during build. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are passed as build args in docker-compose.yml'
    : 'Missing Supabase environment variables. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env file';
  throw new Error(errorMessage);
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Export the Supabase URL for use in other components
export { supabaseUrl };









