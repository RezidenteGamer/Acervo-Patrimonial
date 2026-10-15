import { useEffect } from 'react';
import {
  Archive,
  ArrowUpRight,
  Building2,
  CircleHelp,
  Database,
  LayoutGrid,
  LogOut,
  Package,
  Settings2,
} from 'lucide-react';
import {
  Link,
  Outlet,
  useBlocker,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useInventory } from './hooks/useInventory';
import { Button } from './components/ui/button';
import { isCloud } from './services/backend';
import { useAuth } from './components/AuthGate';
export default function App() {
  const { catalog, dirty, run } = useInventory();
  const { signOut, email } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const department = params.get('secretaria') || 'urbanismo';
  const settings = location.pathname === '/configuracoes';
  const archived = params.get('arquivo') === 'sim';
  const blocker = useBlocker(() => dirty.current);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Há alterações não salvas. Descartar e continuar?')) {
        dirty.current = false;
        blocker.proceed();
      } else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
      ) {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Pesquisar patrimônios"]',
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const query = `?secretaria=${encodeURIComponent(department)}`;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to={'/' + query} className="brand">
          <div className="brand-symbol">
            <Package size={25} strokeWidth={1.7} />
          </div>
          <span>
            acervo<span>INVENTÁRIO PATRIMONIAL</span>
          </span>
        </Link>
        <div className="sidebar-section-label">ESPAÇO DE TRABALHO</div>
        <nav aria-label="Navegação principal">
          <Link
            className={!settings && !archived ? 'nav-item active' : 'nav-item'}
            to={'/' + query}
          >
            <LayoutGrid size={18} />
            Inventário
            <span>
              {
                catalog.assets.filter(
                  (a) =>
                    !a.arquivadoEm && (department === 'todos' || a.secretariaId === department),
                ).length
              }
            </span>
          </Link>
          <Link
            className={!settings && archived ? 'nav-item active' : 'nav-item'}
            to={'/' + query + '&arquivo=sim'}
          >
            <Archive size={18} />
            Arquivados
          </Link>
          <Link className={settings ? 'nav-item active' : 'nav-item'} to={'/configuracoes' + query}>
            <Settings2 size={18} />
            Configurações
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-info">
            <div>
              <Database size={17} />
              <strong>Seu inventário, aqui.</strong>
            </div>
            <p>
              {isCloud
                ? 'Inventário salvo na nuvem e compartilhado com as contas autorizadas.'
                : 'Os dados são salvos neste navegador. Mantenha seu backup em dia.'}
            </p>
            <Link to={'/configuracoes' + query}>
              Gerenciar backups <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="municipal-signature">
            <Building2 size={18} />
            <div>
              Francisco Beltrão<span>Gestão do patrimônio municipal</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Espaço de trabalho</span>
            <span>/</span>
            <strong>{settings ? 'Configurações' : archived ? 'Arquivados' : 'Inventário'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-status">
              <i />
              {isCloud ? 'Conectado à nuvem' : 'Dados neste dispositivo'}
            </span>
            <label className="department-select">
              <Building2 size={16} />
              <span className="sr-only">Secretaria selecionada</span>
              <select
                aria-label="Secretaria selecionada"
                value={department}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  next.set('secretaria', e.target.value);
                  next.delete('item');
                  setParams(next);
                }}
              >
                <option value="todos">Todas as secretarias</option>
                {catalog.departments
                  .filter((d) => d.ativa)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      Secretaria de {d.nome}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Ajuda sobre armazenamento e backup"
              onClick={() => navigate('/configuracoes' + query)}
            >
              <CircleHelp size={19} />
            </Button>
            {isCloud && (
              <Button
                variant="ghost"
                size="icon"
                className="signout-button"
                aria-label="Sair da conta"
                title={email}
                onClick={() => {
                  if (
                    dirty.current &&
                    !window.confirm('Descartar as alterações não salvas e sair da conta?')
                  )
                    return;
                  void run(async () => {
                    await signOut();
                    dirty.current = false;
                  });
                }}
              >
                <LogOut size={18} />
              </Button>
            )}
          </div>
        </header>
        <main>
          <Outlet />
        </main>
        <nav className="mobile-nav" aria-label="Navegação em celular">
          <Link to={'/' + query} className={!settings && !archived ? 'active' : ''}>
            <LayoutGrid size={18} />
            Inventário
          </Link>
          <Link to={'/' + query + '&arquivo=sim'} className={!settings && archived ? 'active' : ''}>
            <Archive size={18} />
            Arquivados
          </Link>
          <Link to={'/configuracoes' + query} className={settings ? 'active' : ''}>
            <Settings2 size={18} />
            Ajustes
          </Link>
        </nav>
      </div>
    </div>
  );
}
