import { describe, expect, it } from 'vitest';
import { readBackendConfig } from '../src/services/backend';
describe('seleção explícita e segura do armazenamento', () => {
  it('mantém desenvolvimento local e falha fechada em produção sem configuração', () => {
    expect(readBackendConfig({ PROD: false }).mode).toBe('local');
    expect(readBackendConfig({ PROD: true }).error).toContain('Configure');
  });
  it('aceita somente URL Supabase e chave publicável; nunca uma secret/service_role', () => {
    const base = { PROD: true, VITE_SUPABASE_URL: 'https://sivtgmclfgebjippxgxp.supabase.co' };
    expect(
      readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' }).error,
    ).toBeTruthy();
    expect(
      readBackendConfig({ ...base, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).error,
    ).toBe('');
    expect(readBackendConfig({ ...base, VITE_DATA_BACKEND: 'invalid' }).error).toBeTruthy();
  });
});
