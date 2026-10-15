import { liveQuery } from 'dexie';
import { InventoryDB } from '../db/database';
import type {
  CategoriaRepository,
  FotografiaRepository,
  LocalStore,
  PatrimonioRepository,
  SecretariaRepository,
} from '../domain/contracts';
import {
  assetDraftSchema,
  categorySchema,
  emptyDraft,
  initialCategories,
  initialDepartments,
  verificationSchema,
  type Asset,
  type AssetDraft,
  type History,
  type Photo,
  type Snapshot,
} from '../domain/models';
import { normalize } from '../lib/utils';

export function createLocalRepositories(db: InventoryDB) {
  const now = () => new Date().toISOString();
  async function record(id: string, tipoEvento: History['tipoEvento'], resumo: string) {
    await db.history.add({
      id: crypto.randomUUID(),
      patrimonioId: id,
      tipoEvento,
      resumo,
      data: now(),
    });
    // Keep the latest 100 relevant events per asset, avoiding unbounded snapshots.
    const events = await db.history.where('patrimonioId').equals(id).sortBy('data');
    if (events.length > 100) await db.history.bulkDelete(events.slice(0, -100).map((e) => e.id));
  }
  async function requireAsset(id: string) {
    const asset = await db.assets.get(id);
    if (!asset) throw new Error('Patrimônio não encontrado. Atualize a listagem.');
    return asset;
  }
  async function validateReferences(draft: AssetDraft) {
    const department = await db.departments.get(draft.secretariaId);
    if (!department?.ativa) throw new Error('Selecione uma secretaria ativa.');
    if (draft.categoriaId && !(await db.categories.get(draft.categoriaId)))
      throw new Error('Categoria não encontrada.');
    return department;
  }
  const assets: PatrimonioRepository = {
    async create(input) {
      const draft = assetDraftSchema.parse(input);
      return db.transaction(
        'rw',
        [db.assets, db.departments, db.categories, db.counters, db.history],
        async () => {
          const department = await validateReferences(draft);
          const counter = (await db.counters.get(department.prefixo))?.valor ?? 0;
          const next = counter + 1;
          if (!Number.isSafeInteger(next))
            throw new Error('O limite de códigos desta secretaria foi atingido.');
          await db.counters.put({ prefixo: department.prefixo, valor: next });
          const timestamp = now();
          const asset: Asset = {
            ...draft,
            id: crypto.randomUUID(),
            codigoInterno: `${department.prefixo}-${String(next).padStart(6, '0')}`,
            criadoEm: timestamp,
            atualizadoEm: timestamp,
            fotoCount: 0,
          };
          await db.assets.add(asset);
          await record(asset.id, 'criação', 'Patrimônio cadastrado.');
          return asset;
        },
      );
    },
    async update(id, input, expectedUpdatedAt) {
      const draft = assetDraftSchema.parse(input);
      return db.transaction(
        'rw',
        [db.assets, db.departments, db.categories, db.history],
        async () => {
          const previous = await requireAsset(id);
          if (expectedUpdatedAt && previous.atualizadoEm !== expectedUpdatedAt)
            throw new Error(
              'Este patrimônio foi alterado em outra janela. Reabra a ficha antes de salvar.',
            );
          await validateReferences(draft);
          const changed = Object.keys(draft).filter(
            (key) => previous[key as keyof AssetDraft] !== draft[key as keyof AssetDraft],
          );
          if (!changed.length) return previous;
          const asset = { ...previous, ...draft, atualizadoEm: now() };
          await db.assets.put(asset);
          if (draft.secretariaId !== previous.secretariaId) {
            const oldDept = await db.departments.get(previous.secretariaId);
            const newDept = await db.departments.get(draft.secretariaId);
            await record(
              id,
              'transferência',
              `${oldDept?.nome} → ${newDept?.nome}. Código interno preservado.`,
            );
          }
          const labels: Record<string, string> = {
            nome: 'nome',
            numeroPatrimonial: 'patrimônio oficial',
            numeroSerie: 'série',
            secretariaId: 'secretaria',
            categoriaId: 'categoria',
            fabricante: 'fabricante',
            anoFabricacao: 'ano',
            numeroFrota: 'frota',
            quilometragem: 'quilometragem',
            horimetro: 'horímetro',
            conservacao: 'conservação',
            situacao: 'situação',
            localizacao: 'localização',
            responsavel: 'equipe',
            observacoes: 'observações',
          };
          const fields = changed
            .filter((key) => key !== 'secretariaId')
            .map(
              (key) =>
                `${labels[key] ?? key}: ${String(previous[key as keyof AssetDraft] ?? '—').slice(0, 100)} → ${String(draft[key as keyof AssetDraft] ?? '—').slice(0, 100)}`,
            );
          if (fields.length) await record(id, 'alteração', fields.join('; '));
          return asset;
        },
      );
    },
    async archive(id, archived) {
      await db.transaction('rw', [db.assets, db.history], async () => {
        await requireAsset(id);
        await db.assets.update(id, {
          arquivadoEm: archived ? now() : undefined,
          atualizadoEm: now(),
        });
        await record(
          id,
          archived ? 'arquivamento' : 'restauração',
          archived ? 'Retirado da listagem ativa.' : 'Devolvido à listagem ativa.',
        );
      });
    },
    async detail(id) {
      return db.transaction('r', [db.assets, db.photos, db.verifications, db.history], async () => {
        const asset = await db.assets.get(id);
        if (!asset) return undefined;
        return {
          asset,
          photos: (await db.photos.where('patrimonioId').equals(id).toArray())
            .sort(
              (a, b) =>
                Number(b.principal) - Number(a.principal) ||
                a.criadaEm.localeCompare(b.criadaEm) ||
                a.id.localeCompare(b.id),
            )
            .map(({ arquivo: _a, miniatura: _m, ...meta }) => meta),
          verifications: (
            await db.verifications.where('patrimonioId').equals(id).sortBy('data')
          ).reverse(),
          history: (await db.history.where('patrimonioId').equals(id).sortBy('data')).reverse(),
        };
      });
    },
    async duplicates(draft, exclude) {
      return (await db.assets.toArray()).filter(
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
      const photo = await db.photos.get(id);
      return thumbnail ? photo?.miniatura : photo?.arquivo;
    },
    async add(id, incoming) {
      if (!incoming.length) return;
      if (
        incoming.some(
          (p) =>
            !['image/jpeg', 'image/png', 'image/webp'].includes(p.arquivo.type) ||
            p.arquivo.size > 20 * 1024 * 1024,
        )
      )
        throw new Error('Fotografia inválida.');
      await db.transaction('rw', [db.assets, db.photos, db.history], async () => {
        const asset = await requireAsset(id);
        if (asset.fotoCount + incoming.length > 30)
          throw new Error('Limite de 30 fotografias por patrimônio.');
        const rows: Photo[] = incoming.map((p, i) => ({
          ...p,
          id: crypto.randomUUID(),
          patrimonioId: id,
          principal: asset.fotoCount === 0 && i === 0,
          criadaEm: now(),
        }));
        await db.photos.bulkAdd(rows);
        await db.assets.update(id, {
          fotoCount: asset.fotoCount + rows.length,
          fotoPrincipalId: asset.fotoPrincipalId ?? rows[0].id,
          atualizadoEm: now(),
        });
        await record(id, 'fotografia', `${rows.length} fotografia(s) adicionada(s).`);
      });
    },
    async remove(id) {
      await db.transaction('rw', [db.assets, db.photos, db.history], async () => {
        const photo = await db.photos.get(id);
        if (!photo) throw new Error('Fotografia não encontrada.');
        await db.photos.delete(id);
        const remaining = await db.photos
          .where('patrimonioId')
          .equals(photo.patrimonioId)
          .toArray();
        const main = remaining.find((p) => p.principal) ?? remaining[0];
        if (main) await db.photos.update(main.id, { principal: true });
        await db.assets.update(photo.patrimonioId, {
          fotoCount: remaining.length,
          fotoPrincipalId: main?.id,
          atualizadoEm: now(),
        });
        await record(photo.patrimonioId, 'fotografia', 'Fotografia removida.');
      });
    },
    async setPrimary(id) {
      await db.transaction('rw', [db.assets, db.photos, db.history], async () => {
        const photo = await db.photos.get(id);
        if (!photo) throw new Error('Fotografia não encontrada.');
        await db.photos
          .where('patrimonioId')
          .equals(photo.patrimonioId)
          .modify({ principal: false });
        await db.photos.update(id, { principal: true });
        await db.assets.update(photo.patrimonioId, { fotoPrincipalId: id, atualizadoEm: now() });
        await record(photo.patrimonioId, 'fotografia', 'Fotografia principal alterada.');
      });
    },
    async describe(id, description) {
      if (description.length > 500) throw new Error('Use até 500 caracteres na descrição.');
      await db.transaction('rw', [db.photos, db.assets, db.history], async () => {
        const photo = await db.photos.get(id);
        if (!photo) throw new Error('Fotografia não encontrada.');
        await db.photos.update(id, { descricao: description });
        await db.assets.update(photo.patrimonioId, { atualizadoEm: now() });
        await record(photo.patrimonioId, 'fotografia', 'Descrição de fotografia alterada.');
      });
    },
  };
  const categories: CategoriaRepository = {
    async save(category) {
      await db.categories.put(categorySchema.parse(category));
    },
  };
  const departments: SecretariaRepository = { list: () => db.departments.toArray() };
  const store: LocalStore = {
    async initialize() {
      await db.transaction('rw', [db.departments, db.categories], async () => {
        if (!(await db.departments.count())) await db.departments.bulkAdd(initialDepartments);
        if (!(await db.categories.count())) await db.categories.bulkAdd(initialCategories);
      });
    },
    async catalog() {
      return db.transaction('r', [db.assets, db.departments, db.categories], async () => ({
        assets: await db.assets.toArray(),
        departments: await db.departments.toArray(),
        categories: await db.categories.toArray(),
      }));
    },
    subscribe(onChange, onError) {
      const sub = liveQuery(async () =>
        Promise.all([
          db.assets.count(),
          db.departments.toArray(),
          db.categories.toArray(),
          db.photos.count(),
          db.verifications.count(),
          db.history.count(),
        ]),
      ).subscribe({ next: onChange, error: onError });
      return () => sub.unsubscribe();
    },
    async snapshot() {
      return db.transaction('r', db.tables, async () => ({
        assets: await db.assets.toArray(),
        departments: await db.departments.toArray(),
        categories: await db.categories.toArray(),
        photos: await db.photos.toArray(),
        verifications: await db.verifications.toArray(),
        history: await db.history.toArray(),
        counters: await db.counters.toArray(),
      }));
    },
    async replace(snapshot: Snapshot, options?: { requireEmpty?: boolean }) {
      await db.transaction('rw', db.tables, async () => {
        if (options?.requireEmpty && (await db.assets.count()))
          throw new Error('A importação exige uma base vazia.');
        const oldCounters = await db.counters.toArray();
        for (const table of db.tables) await table.clear();
        await db.assets.bulkAdd(snapshot.assets);
        await db.departments.bulkAdd(snapshot.departments);
        await db.categories.bulkAdd(snapshot.categories);
        await db.photos.bulkAdd(snapshot.photos);
        await db.verifications.bulkAdd(snapshot.verifications);
        await db.history.bulkAdd(snapshot.history);
        const counters = new Map(snapshot.counters.map((c) => [c.prefixo, c.valor]));
        for (const c of oldCounters)
          counters.set(c.prefixo, Math.max(c.valor, counters.get(c.prefixo) ?? 0));
        await db.counters.bulkPut([...counters].map(([prefixo, valor]) => ({ prefixo, valor })));
      });
    },
    async verify(input) {
      const verification = verificationSchema.parse({ ...input, id: crypto.randomUUID() });
      if (verification.data > new Date().toLocaleDateString('en-CA'))
        throw new Error('A data de verificação não pode estar no futuro.');
      await db.transaction('rw', [db.assets, db.verifications, db.history], async () => {
        const asset = await requireAsset(input.patrimonioId);
        await db.verifications.add(verification);
        await db.assets.update(asset.id, {
          verificadoEm: [asset.verificadoEm ?? '', verification.data].sort().at(-1),
          atualizadoEm: now(),
        });
        await record(
          asset.id,
          'verificação',
          `Existência física verificada em ${verification.data} por ${verification.responsavel}.`,
        );
      });
    },
    async seedDemo() {
      if (!import.meta.env.DEV)
        throw new Error('Demonstração disponível apenas em desenvolvimento.');
      await db.transaction('rw', db.tables, async () => {
        if (await db.assets.count())
          throw new Error('A demonstração exige uma base sem patrimônios, incluindo arquivados.');
        const examples = [
          ['Roçadeira Stihl FS 220', 'urbanismo', 'rocadeiras', 'Stihl', 'FS 220'],
          ['Soprador Stihl BR 420', 'urbanismo', 'rocadeiras', 'Stihl', 'BR 420'],
          ['Kombi Volkswagen', 'urbanismo', 'veiculos', 'Volkswagen', 'Kombi'],
          ['Caminhão basculante', 'interior', 'caminhoes', 'Mercedes-Benz', 'Atego'],
          ['Retroescavadeira', 'interior', 'maquinas', 'JCB', '3CX'],
          ['Escavadeira hidráulica', 'interior', 'maquinas', 'Caterpillar', '320'],
          ['Motosserra', 'urbanismo', 'ferramentas', '', ''],
          ['Motoniveladora', 'interior', 'maquinas', 'Caterpillar', '120K'],
          ['Rolo compactador', 'interior', 'maquinas', '', ''],
        ];
        for (const [
          i,
          [nome, secretariaId, categoriaId, fabricante, modelo],
        ] of examples.entries()) {
          await assets.create({
            ...emptyDraft(secretariaId),
            nome: `${nome} (DEMO)`,
            categoriaId,
            fabricante,
            modelo,
            situacao: i === 4 ? 'Em manutenção' : 'Em uso',
            numeroPatrimonial: i % 2 ? `DEMO-${100 + i}` : '',
            numeroSerie: i === 0 ? 'DEMO-S220' : '',
            placa: i === 2 ? 'ABC0D00' : '',
            numeroFrota: i > 2 ? `DEMO-${i}` : '',
            localizacao: i > 2 ? 'Pátio de máquinas — demonstração' : 'Almoxarifado — demonstração',
            combustivel: i > 2 ? 'Diesel S10' : '',
            observacoes: 'Registro fictício para avaliação. Não é cadastro oficial.',
          });
        }
        await assets.create({
          ...emptyDraft('urbanismo'),
          nome: 'Equipamento sem identificação (DEMO)',
        });
      });
    },
  };
  return { assets, photos, categories, departments, store };
}
