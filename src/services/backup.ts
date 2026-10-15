import JSZip from 'jszip';
import { z } from 'zod';
import {
  assetSchema,
  categorySchema,
  departmentSchema,
  historySchema,
  verificationSchema,
  type Snapshot,
} from '../domain/models';
import type { LocalStore } from '../domain/contracts';
import { imageSignature } from './images';

const LIMIT = 500 * 1024 * 1024;
const fileSchema = z.object({
  path: z.string(),
  size: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
const photoSchema = z.object({
  id: z.uuid(),
  patrimonioId: z.uuid(),
  descricao: z.string().max(500),
  principal: z.boolean(),
  criadaEm: z.iso.datetime(),
  arquivo: fileSchema,
  miniatura: fileSchema,
});
const manifestSchema = z.object({
  format: z.literal('acervo-backup'),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  assets: z.array(assetSchema).max(100000),
  departments: z.array(departmentSchema).min(1).max(1000),
  categories: z.array(categorySchema).min(1).max(10000),
  photos: z.array(photoSchema).max(10000),
  verifications: z.array(verificationSchema).max(100000),
  history: z.array(historySchema).max(1000000),
  counters: z.array(
    z.object({
      prefixo: z.string().regex(/^[A-Z]{2,8}$/),
      valor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  ),
});
async function checksum(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
function unique(values: string[], description: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`Backup inválido: ${description} duplicados.`);
}
function validateRelations(data: z.infer<typeof manifestSchema>) {
  for (const [name, rows] of Object.entries({
    patrimônios: data.assets,
    secretarias: data.departments,
    categorias: data.categories,
    fotografias: data.photos,
    verificações: data.verifications,
    eventos: data.history,
  }))
    unique(
      rows.map((r) => r.id),
      name,
    );
  unique(
    data.assets.map((a) => a.codigoInterno),
    'códigos internos',
  );
  unique(
    data.departments.map((d) => d.prefixo),
    'prefixos',
  );
  unique(
    data.counters.map((c) => c.prefixo),
    'contadores',
  );
  const ids = new Set(data.assets.map((a) => a.id));
  const deps = new Set(data.departments.map((d) => d.id));
  const cats = new Set(data.categories.map((c) => c.id));
  if (
    [...data.photos, ...data.verifications, ...data.history].some(
      (row) => !ids.has(row.patrimonioId),
    )
  )
    throw new Error('Backup inválido: há registros sem patrimônio vinculado.');
  function group<T extends { patrimonioId: string }>(rows: T[]) {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const values = map.get(row.patrimonioId) ?? [];
      values.push(row);
      map.set(row.patrimonioId, values);
    }
    return map;
  }
  const photosByAsset = group(data.photos);
  const checksByAsset = group(data.verifications);
  for (const a of data.assets) {
    if (!deps.has(a.secretariaId) || (a.categoriaId && !cats.has(a.categoriaId)))
      throw new Error('Backup inválido: secretaria ou categoria não encontrada.');
    const photos = photosByAsset.get(a.id) ?? [];
    if (
      photos.length !== a.fotoCount ||
      photos.length > 30 ||
      (photos.length > 0 &&
        (photos.filter((p) => p.principal).length !== 1 ||
          !photos.some((p) => p.principal && p.id === a.fotoPrincipalId))) ||
      (!photos.length && a.fotoPrincipalId)
    )
      throw new Error('Backup inválido: vínculo de fotografias inconsistente.');
    const latest = (checksByAsset.get(a.id) ?? [])
      .map((v) => v.data)
      .sort()
      .at(-1);
    if (latest !== a.verificadoEm)
      throw new Error('Backup inválido: verificação física inconsistente.');
    const [prefixo, code] = a.codigoInterno.split('-');
    if (!data.counters.some((c) => c.prefixo === prefixo && c.valor >= Number(code)))
      throw new Error('Backup inválido: contador de códigos inconsistente.');
  }
  unique(
    data.photos.flatMap((p) => [p.arquivo.path, p.miniatura.path]),
    'arquivos de imagens',
  );
  for (const p of data.photos) {
    if (p.arquivo.path !== `photos/${p.id}/image` || p.miniatura.path !== `photos/${p.id}/thumb`)
      throw new Error('Backup inválido: caminho de imagem inesperado.');
  }
}
export class BackupService {
  constructor(private store: LocalStore) {}
  async export(): Promise<Blob> {
    const snapshot = await this.store.snapshot();
    const zip = new JSZip();
    let total = 0;
    const photos = [];
    for (const p of snapshot.photos) {
      const files = [];
      for (const [suffix, blob] of [
        ['image', p.arquivo],
        ['thumb', p.miniatura],
      ] as const) {
        total += blob.size;
        if (total > LIMIT) throw new Error('Esta versão suporta backups de até 500 MB.');
        const bytes = await blob.arrayBuffer();
        const path = `photos/${p.id}/${suffix}`;
        zip.file(path, bytes);
        files.push({ path, size: blob.size, type: blob.type, sha256: await checksum(bytes) });
      }
      const { arquivo: _a, miniatura: _m, ...meta } = p;
      photos.push({ ...meta, arquivo: files[0], miniatura: files[1] });
    }
    const manifest = manifestSchema.parse({
      ...snapshot,
      photos,
      format: 'acervo-backup',
      version: 1,
      createdAt: new Date().toISOString(),
    });
    validateRelations(manifest);
    zip.file('manifest.json', JSON.stringify(manifest));
    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 3 },
    });
  }
  async inspect(file: Blob): Promise<Snapshot> {
    if (file.size > LIMIT) throw new Error('O backup excede o limite de 500 MB.');
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
      throw new Error('Arquivo inválido. Selecione um backup ZIP gerado pelo Acervo.');
    }
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    if (entries.length > 20001) throw new Error('O backup contém arquivos demais.');
    let unpacked = 0;
    for (const entry of entries) {
      const metadata = entry as unknown as { _data?: { uncompressedSize?: number } };
      const size = metadata._data?.uncompressedSize;
      if (typeof size !== 'number' || size > 25 * 1024 * 1024)
        throw new Error('O backup contém um arquivo excessivamente grande.');
      unpacked += size;
      if (unpacked > LIMIT) throw new Error('O conteúdo descompactado excede 500 MB.');
    }
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('Manifesto não encontrado no backup.');
    let raw: unknown;
    try {
      raw = JSON.parse(await manifestFile.async('string'));
    } catch {
      throw new Error('O manifesto do backup está corrompido.');
    }
    if (typeof raw !== 'object' || !raw || !('version' in raw) || raw.version !== 1)
      throw new Error('Versão de backup incompatível. Esta aplicação aceita a versão 1.');
    const result = manifestSchema.safeParse(raw);
    if (!result.success)
      throw new Error('O backup contém dados inválidos ou campos obrigatórios ausentes.');
    const data = result.data;
    validateRelations(data);
    if (entries.length !== 1 + data.photos.length * 2)
      throw new Error('O backup contém arquivos ausentes ou inesperados.');
    async function read(ref: z.infer<typeof fileSchema>) {
      const entry = zip.file(ref.path);
      if (!entry) throw new Error(`Fotografia ausente: ${ref.path}`);
      const bytes = await entry.async('arraybuffer');
      if (bytes.byteLength !== ref.size || (await checksum(bytes)) !== ref.sha256)
        throw new Error('Uma fotografia está corrompida. Nenhum dado foi substituído.');
      const blob = new Blob([bytes], { type: ref.type });
      if (!(await imageSignature(blob)))
        throw new Error('Formato de fotografia inválido no backup.');
      return blob;
    }
    const photos = [];
    for (const p of data.photos)
      photos.push({ ...p, arquivo: await read(p.arquivo), miniatura: await read(p.miniatura) });
    return {
      assets: data.assets,
      departments: data.departments,
      categories: data.categories,
      photos,
      verifications: data.verifications,
      history: data.history,
      counters: data.counters,
    };
  }
  async restore(snapshot: Snapshot) {
    await this.store.replace(snapshot);
  }
}
