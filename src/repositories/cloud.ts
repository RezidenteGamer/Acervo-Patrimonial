import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  CategoriaRepository,
  FotografiaRepository,
  LocalStore,
  PatrimonioRepository,
  SecretariaRepository,
} from '../domain/contracts';
import {
  assetDraftSchema,
  assetSchema,
  categorySchema,
  departmentSchema,
  historySchema,
  verificationSchema,
  type Photo,
  type Snapshot,
} from '../domain/models';
import { normalize } from '../lib/utils';

const photoMetaSchema = z.object({
  id: z.uuid(),
  patrimonioId: z.uuid(),
  descricao: z.string().max(500),
  principal: z.boolean(),
  criadaEm: z.iso.datetime(),
});
const storedPhotoSchema = photoMetaSchema.extend({
  filePath: z.string().min(1),
  thumbPath: z.string().min(1),
});
const catalogSchema = z.object({
  assets: z.array(assetSchema),
  departments: z.array(departmentSchema),
  categories: z.array(categorySchema),
});
const detailSchema = z.object({
  asset: assetSchema,
  photos: z.array(photoMetaSchema),
  verifications: z.array(verificationSchema),
  history: z.array(historySchema),
});
const snapshotSchema = catalogSchema.extend({
  photos: z.array(storedPhotoSchema),
  verifications: z.array(verificationSchema),
  history: z.array(historySchema),
  counters: z.array(z.object({ prefixo: z.string(), valor: z.number().int().nonnegative() })),
  revision: z.number().int().nonnegative(),
});
const BUCKET = 'acervo-photos';
export function createCloudRepositories(client: SupabaseClient) {
  const listeners = new Set<() => void>();
  const pendingCreates = new Map<string, string>();
  const emit = () => listeners.forEach((listener) => listener());
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      if (error.code === '42501')
        throw new Error('Sua conta não tem permissão para esta operação.');
      if (error.code === '23503')
        throw new Error('Secretaria, categoria ou patrimônio não encontrado. Atualize a lista.');
      if (error.code === '23505')
        throw new Error('Já existe um registro com este identificador. Atualize a lista.');
      if (!error.code || /fetch|network|failed to fetch/i.test(error.message))
        throw new Error(
          'Não foi possível confirmar a operação na nuvem. Confira a conexão e atualize a lista antes de repetir.',
        );
      throw new Error(error.message || 'Não foi possível concluir a operação no Supabase.');
    }
    return data as unknown;
  }
  async function command(action: string, payload: Record<string, unknown>) {
    const result = await rpc('acervo_command', { action, payload });
    emit();
    return result;
  }
  const rawSnapshot = async () =>
    snapshotSchema.parse(await rpc('acervo_read', { scope: 'snapshot' }));
  async function readPhoto(id: string) {
    const { data, error } = await client
      .from('acervo_photos')
      .select('data,file_path,thumb_path')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error('Não foi possível consultar a fotografia.');
    return data
      ? storedPhotoSchema.parse({
          ...data.data,
          filePath: data.file_path,
          thumbPath: data.thumb_path,
        })
      : undefined;
  }
  async function downloadPath(path: string) {
    const { data, error } = await client.storage.from(BUCKET).download(path);
    if (error || !data)
      throw new Error('Não foi possível carregar uma fotografia do armazenamento privado.');
    return data;
  }
  async function cleanup(paths: string[]) {
    // Storage RLS prevents deleting files referenced by committed metadata.
    // Best effort: failure leaves an orphan, never a broken committed photo.
    for (let i = 0; i < paths.length; i += 100) {
      try {
        await client.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      } catch {
        /* Retain for administrative cleanup. */
      }
    }
  }
  async function uploadPhotos(photos: Photo[], uploaded: string[]) {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Entre novamente para enviar fotografias.');
    const batch = crypto.randomUUID();
    const result = [];
    for (const photo of photos) {
      const base = `${data.user.id}/${batch}/${photo.id}`;
      for (const [suffix, blob] of [
        ['image', photo.arquivo],
        ['thumb', photo.miniatura],
      ] as const) {
        const path = `${base}/${suffix}`;
        const { error } = await client.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '3600' });
        if (error)
          throw new Error('Falha no envio de fotografias. Nenhum registro incompleto foi salvo.');
        uploaded.push(path);
      }
      const { arquivo: _a, miniatura: _m, ...meta } = photo;
      result.push({ ...meta, filePath: `${base}/image`, thumbPath: `${base}/thumb` });
    }
    return result;
  }
  const assets: PatrimonioRepository = {
    async create(input) {
      const draft = assetDraftSchema.parse(input);
      const fingerprint = JSON.stringify(draft);
      if (pendingCreates.size > 100) pendingCreates.delete(pendingCreates.keys().next().value!);
      const id = pendingCreates.get(fingerprint) ?? crypto.randomUUID();
      pendingCreates.set(fingerprint, id);
      const result = assetSchema.parse(await command('create', { id, draft }));
      pendingCreates.delete(fingerprint);
      return result;
    },
    async update(id, input, expectedUpdatedAt) {
      return assetSchema.parse(
        await command('update', { id, draft: assetDraftSchema.parse(input), expectedUpdatedAt }),
      );
    },
    async archive(id, archived) {
      await command('archive', { id, archived });
    },
    async detail(id) {
      const result = await rpc('acervo_read', { scope: 'detail', asset_id: id });
      return result ? detailSchema.parse(result) : undefined;
    },
    async duplicates(draft, exclude) {
      if (![draft.numeroPatrimonial, draft.numeroSerie, draft.placa].some((v) => v.trim()))
        return [];
      const catalog = catalogSchema.parse(await rpc('acervo_read', { scope: 'catalog' }));
      return catalog.assets.filter(
        (a) =>
          a.id !== exclude &&
          ((draft.numeroPatrimonial.trim() &&
            normalize(a.numeroPatrimonial) === normalize(draft.numeroPatrimonial)) ||
            (draft.numeroSerie.trim() &&
              normalize(a.numeroSerie) === normalize(draft.numeroSerie)) ||
            (draft.placa.trim() &&
              normalize(a.placa).replace(/\W/g, '') === normalize(draft.placa).replace(/\W/g, ''))),
      );
    },
  };
  const photos: FotografiaRepository = {
    async get(id, thumbnail = false) {
      const photo = await readPhoto(id);
      return photo ? downloadPath(thumbnail ? photo.thumbPath : photo.filePath) : undefined;
    },
    async add(id, input) {
      if (!input.length) return;
      if (
        input.length > 30 ||
        input.some(
          (p) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(p.arquivo.type) ||
            p.arquivo.size > 20 * 1024 * 1024,
        )
      )
        throw new Error('Selecione até 30 fotografias válidas de até 20 MB.');
      const uploaded: string[] = [];
      try {
        const rows = await uploadPhotos(
          input.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
            patrimonioId: id,
            principal: false,
            criadaEm: new Date().toISOString(),
          })),
          uploaded,
        );
        await command('photo_add', { id, photos: rows });
      } catch (error) {
        await cleanup(uploaded);
        throw error;
      }
    },
    async remove(id) {
      const photo = await readPhoto(id);
      await command('photo_remove', { id });
      if (photo) await cleanup([photo.filePath, photo.thumbPath]);
    },
    async setPrimary(id) {
      await command('photo_primary', { id });
    },
    async describe(id, description) {
      if (description.length > 500) throw new Error('Use até 500 caracteres.');
      await command('photo_describe', { id, description });
    },
  };
  const categories: CategoriaRepository = {
    async save(category) {
      await command('category', { category: categorySchema.parse(category) });
    },
  };
  const departments: SecretariaRepository = {
    async list() {
      return catalogSchema.parse(await rpc('acervo_read', { scope: 'catalog' })).departments;
    },
  };
  const store: LocalStore = {
    async initialize() {
      const role = await rpc('acervo_access');
      if (role !== 'admin' && role !== 'editor')
        throw new Error('Sua conta não tem acesso autorizado ao Acervo.');
    },
    async catalog() {
      return catalogSchema.parse(await rpc('acervo_read', { scope: 'catalog' }));
    },
    subscribe(onChange, _onError) {
      listeners.add(onChange);
      const refresh = () => {
        if (document.visibilityState !== 'hidden') onChange();
      };
      const timer = setInterval(refresh, 30000);
      window.addEventListener('focus', refresh);
      window.addEventListener('online', refresh);
      return () => {
        listeners.delete(onChange);
        clearInterval(timer);
        window.removeEventListener('focus', refresh);
        window.removeEventListener('online', refresh);
      };
    },
    async snapshot() {
      const raw = await rawSnapshot();
      const photos: Photo[] = [];
      for (const p of raw.photos) {
        const { filePath, thumbPath, ...meta } = p;
        photos.push({
          ...meta,
          arquivo: await downloadPath(filePath),
          miniatura: await downloadPath(thumbPath),
        });
      }
      // Refuse a backup if other edits occurred while images were downloading.
      const { data, error } = await client
        .from('acervo_state')
        .select('revision')
        .eq('id', 1)
        .single();
      if (error || data?.revision !== raw.revision)
        throw new Error('O inventário mudou durante o backup. Tente exportar novamente.');
      return { ...raw, photos };
    },
    async replace(snapshot: Snapshot, options?: { requireEmpty?: boolean }) {
      const previous = await rawSnapshot();
      const uploaded: string[] = [];
      try {
        const mappedPhotos = await uploadPhotos(snapshot.photos, uploaded);
        await command('restore', {
          expectedRevision: previous.revision,
          requireEmpty: !!options?.requireEmpty,
          snapshot: {
            assets: snapshot.assets,
            departments: snapshot.departments,
            categories: snapshot.categories,
            photos: mappedPhotos,
            verifications: snapshot.verifications,
            history: snapshot.history,
            counters: snapshot.counters,
          },
        });
      } catch (error) {
        await cleanup(uploaded);
        throw error;
      }
      await cleanup(previous.photos.flatMap((p) => [p.filePath, p.thumbPath]));
    },
    async verify(verification) {
      const parsed = verificationSchema.parse({ ...verification, id: crypto.randomUUID() });
      await command('verify', { id: verification.patrimonioId, verification: parsed });
    },
    async seedDemo() {
      throw new Error(
        'Dados demonstrativos só estão disponíveis no modo local de desenvolvimento.',
      );
    },
  };
  return { assets, photos, categories, departments, store };
}
