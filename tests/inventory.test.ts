import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { InventoryDB } from '../src/db/database';
import { createLocalRepositories } from '../src/repositories/local';
import { emptyDraft, type AssetDraft } from '../src/domain/models';
import { BackupService } from '../src/services/backup';
import { clearFilters, queryAssets } from '../src/services/query';
import { exportCSV } from '../src/services/csv';

let db: InventoryDB;
let repos: ReturnType<typeof createLocalRepositories>;
const draft = (name: string, extra: Partial<AssetDraft> = {}) => ({
  ...emptyDraft('urbanismo'),
  nome: name,
  ...extra,
});
const png = () =>
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLPsAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    { type: 'image/png' },
  );
beforeEach(async () => {
  db = new InventoryDB(`test-${crypto.randomUUID()}`);
  repos = createLocalRepositories(db);
  await repos.store.initialize();
});
afterEach(async () => {
  await db.delete();
});
describe('cadastro e integridade', () => {
  it('cadastra apenas com nome, gera UUID e código, sem opcionais', async () => {
    const a = await repos.assets.create(draft('  Roçadeira  '));
    expect(a.nome).toBe('Roçadeira');
    expect(a.id).toMatch(/^[\da-f-]{36}$/);
    expect(a.codigoInterno).toBe('URB-000001');
    expect(a.numeroPatrimonial).toBe('');
    expect(a.quilometragem).toBeUndefined();
    expect((await repos.assets.detail(a.id))?.history[0].tipoEvento).toBe('criação');
  });
  it.each(['', '  ', '\n\t'])('recusa nome inválido %j sem consumir código', async (name) => {
    await expect(repos.assets.create(draft(name))).rejects.toThrow();
    expect((await repos.assets.create(draft('Válido'))).codigoInterno).toBe('URB-000001');
  });
  it('gera códigos exclusivos em cadastros concorrentes e nunca reutiliza arquivados', async () => {
    const assets = await Promise.all(
      Array.from({ length: 25 }, (_, i) => repos.assets.create(draft(`Equipamento ${i}`))),
    );
    expect(new Set(assets.map((a) => a.codigoInterno)).size).toBe(25);
    await repos.assets.archive(assets[24].id, true);
    expect((await repos.assets.create(draft('Próximo'))).codigoInterno).toBe('URB-000026');
    expect(
      (await repos.assets.create(draft('Interior', { secretariaId: 'interior' }))).codigoInterno,
    ).toBe('INT-000001');
  });
  it('transferência preserva identificadores e registra origem/destino', async () => {
    const a = await repos.assets.create(draft('Caminhão'));
    const updated = await repos.assets.update(
      a.id,
      draft('Caminhão', { secretariaId: 'interior', numeroFrota: 'F-10' }),
    );
    expect(updated.id).toBe(a.id);
    expect(updated.codigoInterno).toBe(a.codigoInterno);
    expect(updated.secretariaId).toBe('interior');
    expect(
      (await repos.assets.detail(a.id))?.history.find((h) => h.tipoEvento === 'transferência')
        ?.resumo,
    ).toContain('Urbanismo → Interior');
  });
  it('edita informações opcionais sem alterar a criação e ignora propriedades técnicas recebidas', async () => {
    const a = await repos.assets.create(draft('Nome'));
    const updated = await repos.assets.update(a.id, {
      ...draft('Novo nome', { placa: 'ABC1234', quilometragem: 0 }),
      id: 'injetado',
      codigoInterno: 'ERR-000001',
    } as AssetDraft);
    expect(updated.nome).toBe('Novo nome');
    expect(updated.criadoEm).toBe(a.criadoEm);
    expect(updated.id).toBe(a.id);
    expect(updated.quilometragem).toBe(0);
    expect(updated.codigoInterno).toBe(a.codigoInterno);
  });
  it('alerta duplicidades sem bloquear o cadastro', async () => {
    await repos.assets.create(
      draft('Um', { numeroPatrimonial: '123', numeroSerie: 'S-1', placa: 'ABC-1234' }),
    );
    expect(await repos.assets.duplicates(draft('Outro', { numeroSerie: 's-1' }))).toHaveLength(1);
    expect(await repos.assets.duplicates(draft('Outro', { placa: 'ABC1234' }))).toHaveLength(1);
    await expect(
      repos.assets.create(draft('Outro', { numeroPatrimonial: '123' })),
    ).resolves.toBeDefined();
  });
  it('arquiva e restaura preservando fotos e dados', async () => {
    const a = await repos.assets.create(draft('Bem'));
    await repos.photos.add(a.id, [{ arquivo: png(), miniatura: png(), descricao: 'Plaqueta' }]);
    await repos.assets.archive(a.id, true);
    expect((await repos.assets.detail(a.id))?.asset.arquivadoEm).toBeTruthy();
    await repos.assets.archive(a.id, false);
    const detail = await repos.assets.detail(a.id);
    expect(detail?.asset.arquivadoEm).toBeUndefined();
    expect(detail?.photos).toHaveLength(1);
    expect(detail?.asset.codigoInterno).toBe(a.codigoInterno);
  });
  it('persiste após fechar e reabrir o IndexedDB', async () => {
    const a = await repos.assets.create(draft('Persistente'));
    db.close();
    await db.open();
    expect((await repos.assets.detail(a.id))?.asset.nome).toBe('Persistente');
  });
  it('desativa categoria sem apagar vínculos e permite renomear', async () => {
    const a = await repos.assets.create(draft('Carro', { categoriaId: 'veiculos' }));
    await repos.categories.save({
      id: 'veiculos',
      nome: 'Veículos',
      ativa: false,
      perfil: 'veiculo',
    });
    expect((await repos.store.catalog()).categories.find((c) => c.id === 'veiculos')?.ativa).toBe(
      false,
    );
    expect((await repos.assets.detail(a.id))?.asset.categoriaId).toBe('veiculos');
  });
  it('impede referência a secretaria inexistente e não altera a base', async () => {
    await expect(
      repos.assets.create(draft('Inválido', { secretariaId: 'ausente' })),
    ).rejects.toThrow('secretaria');
    expect((await repos.store.catalog()).assets).toHaveLength(0);
  });
});
describe('pesquisa e contexto', () => {
  it.each([
    'rocadeira',
    'URB-000001',
    'PAT-123',
    'SERIE-01',
    'ABC1234',
    'FROTA-9',
    'stihl',
    'FS 220',
    'deposito',
  ])('pesquisa por %s sem diferença de caixa/acentuação', async (search) => {
    await repos.assets.create(
      draft('Roçadeira', {
        numeroPatrimonial: 'PAT-123',
        numeroSerie: 'SERIE-01',
        placa: 'ABC1234',
        numeroFrota: 'FROTA-9',
        fabricante: 'Stihl',
        modelo: 'FS 220',
        localizacao: 'Depósito',
      }),
    );
    expect(
      queryAssets(
        (await repos.store.catalog()).assets,
        'urbanismo',
        false,
        search,
        clearFilters,
        'nome',
      ),
    ).toHaveLength(1);
  });
  it('combina filtros e alterna secretarias, todos e arquivo', async () => {
    await repos.assets.create(
      draft('A', {
        categoriaId: 'veiculos',
        situacao: 'Em uso',
        conservacao: 'Bom',
        combustivel: 'Flex',
      }),
    );
    await repos.assets.create(draft('B', { categoriaId: 'veiculos', situacao: 'Inativo' }));
    await repos.assets.create(draft('C', { secretariaId: 'interior' }));
    const rows = (await repos.store.catalog()).assets;
    expect(
      queryAssets(
        rows,
        'urbanismo',
        false,
        '',
        {
          ...clearFilters,
          categoria: 'veiculos',
          situacao: 'Em uso',
          conservacao: 'Bom',
          combustivel: 'Flex',
          foto: 'nao',
          oficial: 'nao',
          verificacao: 'nao',
        },
        'nome',
      ).map((a) => a.nome),
    ).toEqual(['A']);
    expect(queryAssets(rows, 'interior', false, '', clearFilters, 'nome')).toHaveLength(1);
    expect(queryAssets(rows, 'todos', false, '', clearFilters, 'nome')).toHaveLength(3);
    await repos.assets.archive(rows[0].id, true);
    expect(
      queryAssets((await repos.store.catalog()).assets, 'todos', true, '', clearFilters, 'nome'),
    ).toHaveLength(1);
  });
});
describe('fotografias e verificação', () => {
  it('adiciona fotos, troca principal, descreve e remove com integridade', async () => {
    const a = await repos.assets.create(draft('Foto'));
    await repos.photos.add(a.id, [
      { arquivo: png(), miniatura: png(), descricao: '' },
      { arquivo: png(), miniatura: png(), descricao: '' },
    ]);
    const detail = (await repos.assets.detail(a.id))!;
    expect(detail.asset.fotoCount).toBe(2);
    expect(detail.photos[0].principal).toBe(true);
    await repos.photos.setPrimary(detail.photos[1].id);
    await repos.photos.describe(detail.photos[1].id, 'Identificação');
    expect((await repos.assets.detail(a.id))?.asset.fotoPrincipalId).toBe(detail.photos[1].id);
    await repos.photos.remove(detail.photos[1].id);
    expect((await repos.assets.detail(a.id))?.asset.fotoPrincipalId).toBe(detail.photos[0].id);
    await repos.photos.remove(detail.photos[0].id);
    expect((await repos.assets.detail(a.id))?.asset.fotoCount).toBe(0);
    expect((await repos.assets.detail(a.id))?.asset.fotoPrincipalId).toBeUndefined();
  });
  it('verificação é independente de fotografias e data não pode ser futura', async () => {
    const a = await repos.assets.create(draft('Verificar'));
    await repos.photos.add(a.id, [{ arquivo: png(), miniatura: png(), descricao: '' }]);
    expect((await repos.assets.detail(a.id))?.asset.verificadoEm).toBeUndefined();
    await repos.store.verify({
      patrimonioId: a.id,
      data: '2025-01-10',
      responsavel: 'Ana',
      observacao: '',
    });
    await repos.store.verify({
      patrimonioId: a.id,
      data: '2024-01-10',
      responsavel: 'João',
      observacao: '',
    });
    expect((await repos.assets.detail(a.id))?.asset.verificadoEm).toBe('2025-01-10');
    await expect(
      repos.store.verify({
        patrimonioId: a.id,
        data: '2199-01-01',
        responsavel: 'Ana',
        observacao: '',
      }),
    ).rejects.toThrow('futuro');
    await expect(
      repos.store.verify({
        patrimonioId: a.id,
        data: '2025-02-31',
        responsavel: 'Ana',
        observacao: '',
      }),
    ).rejects.toThrow();
  });
  it('rejeita arquivo de imagem inválido e lote maior que 30 sem gravar parcialmente', async () => {
    const a = await repos.assets.create(draft('Imagem'));
    await expect(
      repos.photos.add(a.id, [
        { arquivo: new Blob(['x'], { type: 'text/html' }), miniatura: png(), descricao: '' },
      ]),
    ).rejects.toThrow();
    await expect(
      repos.photos.add(
        a.id,
        Array.from({ length: 31 }, () => ({ arquivo: png(), miniatura: png(), descricao: '' })),
      ),
    ).rejects.toThrow('30');
    expect((await repos.assets.detail(a.id))?.asset.fotoCount).toBe(0);
  });
});
describe('backup e restauração', () => {
  it('exporta e restaura todos os vínculos e bytes das fotografias; repetir não duplica e preserva contadores', async () => {
    const service = new BackupService(repos.store);
    const a = await repos.assets.create(draft('Original'));
    await repos.photos.add(a.id, [{ arquivo: png(), miniatura: png(), descricao: 'Série' }]);
    await repos.store.verify({
      patrimonioId: a.id,
      data: '2025-03-01',
      responsavel: 'Ana',
      observacao: 'Conferido',
    });
    const zip = await service.export();
    const validated = await service.inspect(zip);
    await repos.assets.create(draft('Posterior'));
    await service.restore(validated);
    await service.restore(await service.inspect(zip));
    const snapshot = await repos.store.snapshot();
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.photos).toHaveLength(1);
    expect(snapshot.verifications).toHaveLength(1);
    expect(snapshot.history).toHaveLength(3);
    expect(await snapshot.photos[0].arquivo.arrayBuffer()).toEqual(await png().arrayBuffer());
    expect(snapshot.photos[0].principal).toBe(true);
    expect((await repos.assets.create(draft('Novo'))).codigoInterno).toBe('URB-000003');
  });
  it.each(['version', 'duplicate', 'orphan', 'counter', 'image'])(
    'rejeita backup adulterado (%s) sem tocar nos dados atuais',
    async (kind) => {
      const a = await repos.assets.create(draft('Seguro'));
      await repos.photos.add(a.id, [{ arquivo: png(), miniatura: png(), descricao: '' }]);
      const service = new BackupService(repos.store);
      const zip = await JSZip.loadAsync(await (await service.export()).arrayBuffer());
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      if (kind === 'version') manifest.version = 99;
      if (kind === 'duplicate') manifest.assets.push(manifest.assets[0]);
      if (kind === 'orphan') manifest.photos[0].patrimonioId = crypto.randomUUID();
      if (kind === 'counter') manifest.counters[0].valor = 0;
      if (kind === 'image') zip.file(manifest.photos[0].arquivo.path, 'corrompido');
      zip.file('manifest.json', JSON.stringify(manifest));
      await expect(service.inspect(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow();
      expect((await repos.store.catalog()).assets[0].nome).toBe('Seguro');
    },
  );
  it('faz rollback integral se uma substituição falhar no banco', async () => {
    const a = await repos.assets.create(draft('Preservado'));
    const snapshot = await repos.store.snapshot();
    snapshot.assets.push({ ...a, id: crypto.randomUUID() });
    await expect(repos.store.replace(snapshot)).rejects.toThrow();
    expect((await repos.store.catalog()).assets).toHaveLength(1);
    expect((await repos.store.catalog()).assets[0].id).toBe(a.id);
  });
  it('recusa arquivo que não seja ZIP', async () => {
    await expect(new BackupService(repos.store).inspect(new Blob(['inválido']))).rejects.toThrow(
      'ZIP',
    );
  });
  it('exporta CSV com BOM, aspas, acentos e proteção de fórmulas', async () => {
    const a = await repos.assets.create(
      draft('=HYPERLINK("risco")', { observacoes: 'Linha 1\nLinha 2; "ação"' }),
    );
    const csv = exportCSV([a], await repos.store.catalog());
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const text = await csv.text();
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain('""ação""');
  });
});
