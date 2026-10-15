import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  Database,
  Download,
  FlaskConical,
  FolderTree,
  HardDrive,
  Plus,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useInventory } from '../hooks/useInventory';
import { localRepositories, repositories } from '../services';
import { isCloud } from '../services/backend';
import { useAuth } from '../components/AuthGate';
import { backupService } from '../services/backup-instance';
import type { Category, Snapshot } from '../domain/models';
import { download, errorMessage } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
function CategoryRow({ category }: { category: Category }) {
  const { run } = useInventory();
  const [name, setName] = useState(category.nome);
  const [profile, setProfile] = useState(category.perfil);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(category.nome);
    setProfile(category.perfil);
  }, [category]);
  async function save(next: Category) {
    setBusy(true);
    await run(() => repositories.categories.save(next), 'Categoria atualizada.');
    setBusy(false);
  }
  return (
    <div className="category-row">
      <input
        aria-label={`Nome da categoria ${category.nome}`}
        value={name}
        maxLength={500}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        aria-label={`Perfil da categoria ${category.nome}`}
        value={profile}
        onChange={(e) => setProfile(e.target.value as Category['perfil'])}
      >
        <option value="geral">Geral</option>
        <option value="veiculo">Veículo</option>
        <option value="maquina">Máquina pesada</option>
        <option value="portatil">Equipamento portátil</option>
      </select>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || !name.trim() || (name === category.nome && profile === category.perfil)}
        onClick={() => void save({ ...category, nome: name.trim(), perfil: profile })}
      >
        <Check size={14} />
        Salvar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void save({ ...category, ativa: !category.ativa })}
      >
        {category.ativa ? 'Desativar' : 'Reativar'}
      </Button>
    </div>
  );
}
export default function Settings() {
  const { catalog, run, notify, dirty } = useInventory();
  const { email, role } = useAuth();
  const canRestore = !isCloud || role === 'admin';
  const [localCount, setLocalCount] = useState(0);
  const [pendingLocal, setPendingLocal] = useState(false);
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<Snapshot>();
  const [categoryName, setCategoryName] = useState('');
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>(
    {},
  );
  const restoreInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isCloud) {
      localRepositories.store
        .catalog()
        .then((c) => setLocalCount(c.assets.length))
        .catch(() => {});
      return;
    }
    Promise.all([navigator.storage?.estimate(), navigator.storage?.persisted()])
      .then(([estimate, persisted]) => setStorage({ ...estimate, persisted }))
      .catch(() => {});
  }, [catalog.assets.length]);
  async function exportBackup() {
    if (busy) return;
    setBusy('export');
    try {
      const blob = await backupService.export();
      download(blob, `acervo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
      notify('Backup gerado. Guarde o arquivo ZIP em outro dispositivo.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy('');
    }
  }
  async function inspect(file?: File) {
    if (!file || busy) return;
    setBusy('inspect');
    setPendingLocal(false);
    try {
      setPending(await backupService.inspect(file));
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy('');
      if (restoreInput.current) restoreInput.current.value = '';
    }
  }
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE TRABALHO</div>
          <h1>Configurações</h1>
          <p>Cuide dos seus dados e organize seu inventário.</p>
        </div>
      </div>
      <div className="notice warning">
        <AlertTriangle size={21} />
        <div>
          <strong>
            {isCloud
              ? 'Inventário compartilhado na nuvem'
              : 'Seus dados ficam somente neste navegador'}
          </strong>
          <p>
            {isCloud ? (
              'Cadastros e fotografias são armazenados no Supabase. Apenas contas autorizadas acessam esta base. A lista é atualizada a cada 30 segundos e ao retornar à janela. A operação na nuvem precisa de internet. Continue exportando backups regularmente.'
            ) : (
              <>
                Limpar os dados do site, trocar de navegador ou ter um problema no dispositivo pode
                apagar os registros. Exporte backups regularmente e guarde uma cópia em outro local.
                Esta versão não possui autenticação nem sincronização entre computadores.
              </>
            )}
          </p>
        </div>
      </div>
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon">
            <Database size={22} />
          </div>
          <div>
            <h2>Backup e restauração</h2>
            <p>Uma cópia completa, com fotografias, verificações e histórico.</p>
          </div>
        </div>
        <div className="backup-options">
          <div>
            <Download size={23} />
            <h3>Proteger meu inventário</h3>
            <p>
              Exporte um ZIP versionado com todos os registros, inclusive os arquivados e as
              imagens. Limite de 500 MB por backup.
            </p>
            <Button disabled={!!busy} onClick={() => void exportBackup()}>
              <Download size={16} />
              {busy === 'export' ? 'Gerando backup…' : 'Exportar backup completo'}
            </Button>
          </div>
          <div>
            <ArchiveRestore size={23} />
            <h3>Restaurar uma cópia</h3>
            <p>
              O arquivo será validado antes de substituir a base inteira. A restauração não mescla
              registros e não cria duplicatas.{' '}
              {isCloud &&
                'Na nuvem, a substituição afeta todas as contas e exige um administrador.'}
            </p>
            <Button
              variant="secondary"
              disabled={!!busy || !canRestore}
              onClick={() => restoreInput.current?.click()}
            >
              <Upload size={16} />
              {busy === 'inspect' ? 'Validando arquivo…' : 'Selecionar backup ZIP'}
            </Button>
            <input
              className="sr-only"
              type="file"
              accept=".zip,application/zip"
              ref={restoreInput}
              onChange={(e) => void inspect(e.target.files?.[0])}
              aria-label="Selecionar backup para restauração"
            />
          </div>
        </div>
      </section>
      {isCloud && (
        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2>Conta e dados locais</h2>
              <p>
                {email} · {role === 'admin' ? 'Administrador' : 'Editor'}
              </p>
            </div>
          </div>
          <p className="form-hint">
            {localCount} patrimônio(s) encontrado(s) neste navegador. Os dados locais foram
            preservados. Para transferir dados de outro navegador, exporte o backup lá e restaure
            aqui.
          </p>
          <Button
            variant="secondary"
            disabled={!!busy || !canRestore || !localCount || catalog.assets.length > 0}
            onClick={async () => {
              if (busy) return;
              setBusy('local');
              try {
                setPending(await localRepositories.store.snapshot());
                setPendingLocal(true);
              } catch (error) {
                notify(errorMessage(error), true);
              } finally {
                setBusy('');
              }
            }}
          >
            <Upload size={16} />
            Migrar base local para nuvem vazia
          </Button>
          <p className="form-hint">
            A migração preserva IDs, códigos, fotos e histórico e mantém uma cópia local. Só
            funciona se a base em nuvem estiver vazia.
          </p>
        </section>
      )}
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon">
            <FolderTree size={22} />
          </div>
          <div>
            <h2>Categorias</h2>
            <p>
              Nomes editáveis, identificadores estáveis. Desativar preserva os vínculos existentes.
            </p>
          </div>
        </div>
        <div className="category-list">
          {catalog.categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </div>
        <form
          className="add-category"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!categoryName.trim() || busy) return;
            setBusy('category');
            const ok = await run(
              () =>
                repositories.categories.save({
                  id: crypto.randomUUID(),
                  nome: categoryName.trim(),
                  ativa: true,
                  perfil: 'geral',
                }),
              'Categoria criada.',
            );
            if (ok) setCategoryName('');
            setBusy('');
          }}
        >
          <input
            aria-label="Nome da nova categoria"
            placeholder="Nome da nova categoria"
            value={categoryName}
            required
            maxLength={500}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <Button variant="secondary" type="submit" disabled={!!busy}>
            <Plus size={16} />
            Criar categoria
          </Button>
        </form>
      </section>
      {!isCloud && (
        <section className="settings-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <HardDrive size={22} />
            </div>
            <div>
              <h2>Armazenamento local</h2>
              <p>
                {storage.usage !== undefined
                  ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB utilizados${storage.quota ? ` de aproximadamente ${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB disponíveis para este site` : ''}.`
                  : 'A estimativa de espaço não está disponível neste navegador.'}
              </p>
            </div>
          </div>
          <div className="storage-actions">
            <span>
              <ShieldCheck size={17} />
              {storage.persisted
                ? 'Armazenamento persistente concedido pelo navegador.'
                : 'Você pode solicitar proteção contra limpeza automática do navegador.'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={storage.persisted || !navigator.storage?.persist}
              onClick={async () => {
                try {
                  const persisted = await navigator.storage.persist();
                  setStorage((s) => ({ ...s, persisted }));
                  notify(
                    persisted
                      ? 'Proteção de armazenamento concedida. Continue fazendo backups.'
                      : 'O navegador não concedeu a proteção. Continue fazendo backups.',
                  );
                } catch (e) {
                  notify(errorMessage(e), true);
                }
              }}
            >
              Solicitar persistência
            </Button>
          </div>
          <p className="form-hint">
            Mantenha o mesmo endereço (protocolo, host e porta) ao abrir o sistema. Cada endereço e
            perfil do navegador tem sua própria base.
          </p>
        </section>
      )}
      {import.meta.env.DEV && !isCloud && (
        <section className="settings-card demo-card">
          <div className="settings-card-heading">
            <div className="settings-icon">
              <FlaskConical size={22} />
            </div>
            <div>
              <h2>Ambiente de demonstração</h2>
              <p>
                Somente em desenvolvimento. Os exemplos são fictícios e identificados como DEMO.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!!busy || catalog.assets.length > 0}
            onClick={async () => {
              if (!window.confirm('Inserir registros fictícios de demonstração nesta base vazia?'))
                return;
              setBusy('demo');
              await run(() => repositories.store.seedDemo(), 'Exemplos de demonstração inseridos.');
              setBusy('');
            }}
          >
            <Plus size={16} />
            Carregar exemplos em base vazia
          </Button>
          {catalog.assets.length > 0 && (
            <p className="form-hint">
              A demonstração não pode ser carregada porque já existem patrimônios.
            </p>
          )}
        </section>
      )}
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && busy !== 'restore') setPending(undefined);
        }}
        title="Substituir todo o inventário?"
        description="O arquivo foi validado. Revise a substituição antes de continuar."
      >
        <div className="restore-summary">
          <strong>{pending?.assets.length ?? 0} patrimônios</strong>
          <span>
            {pending?.photos.length ?? 0} fotografias · {pending?.verifications.length ?? 0}{' '}
            verificações
          </span>
          <p>
            {isCloud
              ? 'Todos os dados da base compartilhada na nuvem serão substituídos para todas as contas. As fotos serão enviadas e verificadas antes da troca. Exporte um backup atual antes de continuar.'
              : 'Todos os dados atuais deste navegador serão substituídos. Exporte um backup da base atual antes de continuar, caso precise preservá-la.'}
          </p>
        </div>
        <div className="end-actions">
          <Button variant="secondary" disabled={!!busy} onClick={() => setPending(undefined)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!!busy || !canRestore}
            onClick={async () => {
              if (!pending || busy) return;
              setBusy('restore');
              const ok = await run(
                () =>
                  pendingLocal
                    ? repositories.store.replace(pending, { requireEmpty: true })
                    : backupService.restore(pending),
                'Backup restaurado integralmente.',
              );
              dirty.current = false;
              if (ok) setPending(undefined);
              setBusy('');
            }}
          >
            {busy === 'restore' ? 'Restaurando…' : 'Substituir dados e restaurar'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
