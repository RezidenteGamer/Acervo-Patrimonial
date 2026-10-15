import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createCloudRepositories } from '../src/repositories/cloud';
import { emptyDraft, type Snapshot } from '../src/domain/models';

const ID = '10000000-0000-4000-8000-000000000001';
const asset = {
  ...emptyDraft('urbanismo'),
  id: ID,
  nome: 'Bem',
  codigoInterno: 'URB-000001',
  fotoCount: 0,
  criadoEm: '2026-01-01T00:00:00.000Z',
  atualizadoEm: '2026-01-01T00:00:00.000Z',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const client = () =>
  createClient('https://sivtgmclfgebjippxgxp.supabase.co', 'sb_publishable_test_only', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('contrato do adaptador Supabase', () => {
  it('reutiliza UUID após falha de rede para permitir criação idempotente', async () => {
    const ids: string[] = [];
    let fail = true;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      ids.push(body.payload.id);
      if (fail) {
        fail = false;
        return json({ message: 'network failed' }, 503);
      }
      return json({ ...asset, id: body.payload.id });
    });
    const repos = createCloudRepositories(client());
    const draft = { ...emptyDraft('urbanismo'), nome: 'Bem' };
    await expect(repos.assets.create(draft)).rejects.toThrow('confirmar');
    await expect(repos.assets.create(draft)).resolves.toMatchObject({
      codigoInterno: 'URB-000001',
    });
    expect(ids[0]).toBe(ids[1]);
  });
  it('descarta campos técnicos recebidos e valida respostas antes de chegar à interface', async () => {
    vi.mocked(fetch).mockResolvedValue(json(asset));
    const repos = createCloudRepositories(client());
    await repos.assets.update(ID, { ...asset, nome: 'Editado' });
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(sent.payload.draft.id).toBeUndefined();
    expect(sent.payload.draft.codigoInterno).toBeUndefined();
    vi.mocked(fetch).mockResolvedValue(json({ id: 'inválido' }));
    await expect(repos.assets.detail(ID)).rejects.toThrow();
  });
  it('não confirma metadados quando um upload falha e limpa os arquivos já enviados', async () => {
    const api = client();
    vi.spyOn(api.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: ID,
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });
    const calls: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const value = String(url);
      calls.push(`${init?.method} ${value}`);
      if (init?.method === 'DELETE') return json([]);
      if (value.endsWith('/thumb')) return json({ message: 'falha de upload' }, 500);
      return json({ Key: 'uploaded', Id: ID });
    });
    const repos = createCloudRepositories(api);
    const image = new Blob(['test'], { type: 'image/jpeg' });
    await expect(
      repos.photos.add(ID, [{ arquivo: image, miniatura: image, descricao: '' }]),
    ).rejects.toThrow('envio');
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(true);
    expect(calls.some((c) => c.includes('acervo_command'))).toBe(false);
  });
  it('restauração envia uma revisão esperada e impede migração sobre base ocupada no servidor', async () => {
    const api = client();
    vi.spyOn(api.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: ID,
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });
    const snapshot: Snapshot = {
      assets: [],
      departments: [],
      categories: [],
      photos: [],
      verifications: [],
      history: [],
      counters: [],
    };
    let payload: Record<string, unknown> = {};
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.scope === 'snapshot') return json({ ...snapshot, revision: 17 });
      payload = body.payload;
      return json({});
    });
    await createCloudRepositories(api).store.replace(snapshot, { requireEmpty: true });
    expect(payload.expectedRevision).toBe(17);
    expect(payload.requireEmpty).toBe(true);
  });
});
