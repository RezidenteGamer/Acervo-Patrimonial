// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assetSchema, emptyDraft, type Asset, type AssetDraft } from '../src/domain/models';

const ADMIN = '10000000-0000-4000-8000-000000000001';
const EDITOR = '10000000-0000-4000-8000-000000000002';
const OUTSIDER = '10000000-0000-4000-8000-000000000003';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,delete,update on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant execute on function storage.foldername(text) to authenticated;
  `);
  const migration = readFileSync('supabase/migrations/20261015150829_acervo_cloud.sql', 'utf8');
  try {
    await db.exec(migration);
  } catch (error) {
    const detail = error as {
      message: string;
      position?: string;
      internalQuery?: string;
      internalPosition?: string;
      where?: string;
    };
    const source = detail.internalQuery ?? migration;
    const position = Number(detail.internalPosition ?? detail.position);
    throw new Error(
      `${detail.message}; ${detail.where ?? ''}; position ${position}: ${source.slice(Math.max(0, position - 160), position + 160)}`,
    );
  }
  await db.query('insert into auth.users(id) values($1),($2),($3)', [ADMIN, EDITOR, OUTSIDER]);
  await db.query(
    "insert into public.acervo_members(user_id,role) values($1,'admin'),($2,'editor')",
    [ADMIN, EDITOR],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
async function asUser(id: string, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
beforeEach(async () => {
  await db.exec(
    'reset role; delete from public.acervo_photos; delete from public.acervo_verifications; delete from public.acervo_history; delete from public.acervo_assets; delete from public.acervo_counters; delete from storage.objects; update public.acervo_state set revision=0;',
  );
  await asUser(ADMIN);
});
async function command<T = unknown>(action: string, payload: unknown): Promise<T> {
  return (
    await db.query<{ result: T }>('select public.acervo_command($1,$2::jsonb) as result', [
      action,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
}
async function read<T = Record<string, unknown>>(
  scope: string,
  id: string | null = null,
): Promise<T> {
  return (
    await db.query<{ result: T }>('select public.acervo_read($1,$2::uuid) as result', [scope, id])
  ).rows[0].result;
}
async function create(name = 'Roçadeira', extra: Partial<AssetDraft> = {}) {
  return assetSchema.parse(
    await command('create', {
      id: crypto.randomUUID(),
      draft: { ...emptyDraft('urbanismo'), nome: name, ...extra },
    }),
  );
}
describe('PostgreSQL: schema, authorization and atomic commands', () => {
  it('recusa edição baseada em uma versão desatualizada', async () => {
    const a = await create();
    await expect(
      command('update', { id: a.id, draft: a, expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }),
    ).rejects.toThrow('outro dispositivo');
    expect((await read<{ asset: Asset }>('detail', a.id)).asset.nome).toBe(a.nome);
  });
  it('cadastra só com nome, gera código no servidor e retorna o contrato de domínio', async () => {
    const a = await create();
    expect(a.codigoInterno).toBe('URB-000001');
    expect(a.fotoCount).toBe(0);
    expect((await read<{ assets: Asset[] }>('catalog')).assets).toHaveLength(1);
  });
  it('repete um pedido com o mesmo UUID sem duplicar nem consumir outro código', async () => {
    const id = crypto.randomUUID();
    const draft = { nome: 'Ferramenta', secretariaId: 'urbanismo' };
    const a = await command('create', { id, draft });
    expect(await command('create', { id, draft })).toEqual(a);
    expect((await create()).codigoInterno).toBe('URB-000002');
  });
  it('rejeita cadastro inválido e referência ausente com rollback do contador', async () => {
    await expect(create('  ')).rejects.toThrow();
    await expect(create('Inválido', { categoriaId: 'ausente' })).rejects.toThrow();
    expect((await create()).codigoInterno).toBe('URB-000001');
  });
  it('preserva IDs/código na transferência e ignora campos técnicos forjados', async () => {
    const a = await create();
    const result = assetSchema.parse(
      await command('update', {
        id: a.id,
        draft: {
          ...a,
          secretariaId: 'interior',
          codigoInterno: 'INT-999999',
          id: crypto.randomUUID(),
        },
      }),
    );
    expect(result.id).toBe(a.id);
    expect(result.codigoInterno).toBe(a.codigoInterno);
    expect(result.secretariaId).toBe('interior');
    const detail = await read<{ history: { tipoEvento: string; actorId: string }[] }>(
      'detail',
      a.id,
    );
    expect(
      detail.history.some((h) => h.tipoEvento === 'transferência' && h.actorId === ADMIN),
    ).toBe(true);
  });
  it('não permite escrita direta, autoaprovação nem acesso a outro membro', async () => {
    const a = await create();
    await expect(
      db.query('update public.acervo_assets set data=$1 where id=$2', [{}, a.id]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query("insert into public.acervo_members(user_id,role) values($1,'admin')", [OUTSIDER]),
    ).rejects.toThrow('permission denied');
    expect((await db.query('select * from public.acervo_members')).rows).toHaveLength(1);
  });
  it('recusa conta sem autorização e visitante anônimo', async () => {
    await create();
    await asUser(OUTSIDER);
    expect((await db.query('select * from public.acervo_assets')).rows).toHaveLength(0);
    await expect(create()).rejects.toThrow('autorizado');
    await expect(read('catalog')).rejects.toThrow('autorizado');
    await asUser('', 'anon');
    await expect(read('catalog')).rejects.toThrow('permission denied');
  });
  it('editores podem cadastrar, mas não restaurar a base', async () => {
    await asUser(EDITOR);
    await create();
    await expect(command('restore', {})).rejects.toThrow('administradores');
  });
  it('verifica existência física, valida data e registra identidade autenticada no histórico', async () => {
    const a = await create();
    await expect(
      command('verify', { id: a.id, verification: { data: '2025-02-31', responsavel: 'Ana' } }),
    ).rejects.toThrow();
    await expect(
      command('verify', { id: a.id, verification: { data: '2199-01-01', responsavel: 'Ana' } }),
    ).rejects.toThrow('futuro');
    await expect(command('verify', { id: a.id, verification: {} })).rejects.toThrow(
      'data e o responsável',
    );
    await command('verify', { id: a.id, verification: { data: '2025-01-01', responsavel: 'Ana' } });
    expect((await read<{ asset: Asset }>('detail', a.id)).asset.verificadoEm).toBe('2025-01-01');
  });
  it('arquiva e restaura sem reutilizar códigos', async () => {
    const a = await create();
    await command('archive', { id: a.id, archived: true });
    expect((await read<{ asset: Asset }>('detail', a.id)).asset.arquivadoEm).toBeTruthy();
    await command('archive', { id: a.id, archived: false });
    expect((await read<{ asset: Asset }>('detail', a.id)).asset.arquivadoEm).toBeUndefined();
    expect((await create()).codigoInterno).toBe('URB-000002');
  });
  it('Storage privado: somente membros, uploads próprios e sem remoção de fotos referenciadas', async () => {
    const a = await create();
    const id = crypto.randomUUID();
    const path = `${ADMIN}/batch/${id}`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('acervo-photos',$1),('acervo-photos',$2)",
      [`${path}/image`, `${path}/thumb`],
    );
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values('acervo-photos',$1)", [
        `${OUTSIDER}/image`,
      ]),
    ).rejects.toThrow('row-level security');
    await command('photo_add', {
      id: a.id,
      photos: [
        { id, filePath: `${path}/image`, thumbPath: `${path}/thumb`, descricao: 'Plaqueta' },
      ],
    });
    expect((await read<{ asset: Asset }>('detail', a.id)).asset.fotoCount).toBe(1);
    expect(
      (await db.query('delete from storage.objects where name=$1 returning id', [`${path}/image`]))
        .rows,
    ).toHaveLength(0);
    await asUser(OUTSIDER);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await asUser(ADMIN);
    await command('photo_remove', { id });
    expect((await db.query('delete from storage.objects returning id')).rows).toHaveLength(2);
  });
  it('restauração é atômica, não duplica, preserva contadores e recusa revisão desatualizada', async () => {
    const a = await create();
    const { revision: _r, ...snapshot } = await read<{ revision: number; assets: Asset[] }>(
      'snapshot',
    );
    await create('Posterior');
    await expect(command('restore', { expectedRevision: _r, snapshot })).rejects.toThrow('mudou');
    let revision = (await read<{ revision: number }>('snapshot')).revision;
    await command('restore', { expectedRevision: revision, snapshot });
    revision = (await read<{ revision: number }>('snapshot')).revision;
    await command('restore', { expectedRevision: revision, snapshot });
    expect((await read<{ assets: Asset[] }>('catalog')).assets).toHaveLength(1);
    expect((await create()).codigoInterno).toBe('URB-000003');
    const current = await read<{ revision: number }>('snapshot');
    await expect(
      command('restore', {
        expectedRevision: current.revision,
        snapshot: { ...snapshot, assets: [a, { ...a, id: crypto.randomUUID() }] },
      }),
    ).rejects.toThrow('duplicate key');
    expect((await read<{ assets: Asset[] }>('catalog')).assets).toHaveLength(2);
  });
  it('migração local exige base vazia e backup não pode perder referência de foto', async () => {
    await create();
    const { revision, ...snapshot } = await read<{ revision: number; assets: Asset[] }>('snapshot');
    await expect(
      command('restore', { expectedRevision: revision, requireEmpty: true, snapshot }),
    ).rejects.toThrow('vazia');
    snapshot.assets[0].fotoCount = 1;
    await expect(command('restore', { expectedRevision: revision, snapshot })).rejects.toThrow(
      'fotografias inconsistentes',
    );
    expect((await read<{ assets: Asset[] }>('catalog')).assets[0].fotoCount).toBe(0);
  });
});
