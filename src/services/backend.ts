import { createClient } from '@supabase/supabase-js';

export type DataBackend = 'local' | 'supabase';
export function readBackendConfig(env: Record<string, string | boolean | undefined>) {
  const mode = env.VITE_DATA_BACKEND || (env.PROD ? 'supabase' : 'local');
  if (mode !== 'local' && mode !== 'supabase')
    return { mode: 'supabase' as const, error: 'VITE_DATA_BACKEND deve ser local ou supabase.' };
  if (mode === 'local') return { mode: 'local' as const, error: '' };
  const url = String(env.VITE_SUPABASE_URL || '');
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) ||
    !key.startsWith('sb_publishable_') ||
    key.includes('REPLACE')
  ) {
    return {
      mode: 'supabase' as const,
      error:
        'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nas variáveis de ambiente e gere um novo deploy.',
    };
  }
  return { mode: 'supabase' as const, error: '', url, key };
}
const config = readBackendConfig(import.meta.env);
export const dataBackend: DataBackend = config.mode;
export const isCloud = dataBackend === 'supabase';
export const backendConfigurationError = config.error;
export const supabase =
  config.mode === 'supabase' && !config.error && config.url && config.key
    ? createClient(config.url, config.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
