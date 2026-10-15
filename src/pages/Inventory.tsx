import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowRight,
  Camera,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileQuestion,
  LayoutList,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useDetail, useInventory } from '../hooks/useInventory';
import type { Asset } from '../domain/models';
import {
  clearFilters,
  queryAssets,
  type Filters as FilterValues,
  type Sort,
} from '../services/query';
import { exportCSV } from '../services/csv';
import { download } from '../lib/utils';
import { AssetDetail, StatusBadge } from '../components/AssetDetail';
import { AssetIcon } from '../components/AssetIcon';
import { AssetForm } from '../components/AssetForm';
import { Filters } from '../components/Filters';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { isCloud } from '../services/backend';
export default function Inventory() {
  const { catalog, loading, error, dirty, notify } = useInventory();
  const [params, setParams] = useSearchParams();
  const department = params.get('secretaria') || 'urbanismo';
  const selected = params.get('item') || undefined;
  const archived = params.get('arquivo') === 'sim';
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<FilterValues>({ ...clearFilters });
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<Sort>('nome');
  const [newAsset, setNewAsset] = useState(false);
  const [page, setPage] = useState(1);
  const list = useRef<HTMLDivElement>(null);
  const { detail, loading: detailLoading } = useDetail(selected);
  useEffect(() => {
    if (!detail || params.has('secretaria')) return;
    const next = new URLSearchParams(params);
    next.set('secretaria', detail.asset.secretariaId);
    if (detail.asset.arquivadoEm) next.set('arquivo', 'sim');
    setParams(next, { replace: true });
  }, [detail, params, setParams]);
  const rows = useMemo(
    () => queryAssets(catalog.assets, department, archived, deferredSearch, filters, sort),
    [catalog.assets, department, archived, deferredSearch, filters, sort],
  );
  const contextRows = catalog.assets.filter(
    (a) =>
      (department === 'todos' || a.secretariaId === department) && !!a.arquivadoEm === archived,
  );
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const changeFilters = (next: FilterValues) => {
    setFilters(next);
    setPage(1);
  };
  const selectAsset = (asset?: Asset) => {
    const next = new URLSearchParams(params);
    if (asset) next.set('item', asset.id);
    else next.delete('item');
    setParams(next);
  };
  const closeNew = (open: boolean) => {
    if (!open && dirty.current && !window.confirm('Descartar o cadastro não salvo?')) return;
    dirty.current = false;
    setNewAsset(open);
  };
  const openNew = () => {
    if (dirty.current) {
      if (!window.confirm('Descartar as alterações da ficha antes de iniciar outro cadastro?'))
        return;
      dirty.current = false;
    }
    if (selected) selectAsset();
    setNewAsset(true);
  };
  const selectSaved = (asset: Asset) => {
    const next = new URLSearchParams(params);
    next.set('item', asset.id);
    if (asset.arquivadoEm) next.set('arquivo', 'sim');
    else next.delete('arquivo');
    if (department !== 'todos' && asset.secretariaId !== department)
      next.set('secretaria', asset.secretariaId);
    setParams(next);
  };
  const stats = [
    {
      label: 'Total de patrimônios',
      value: contextRows.length,
      icon: Package,
      className: 'blue',
      active: !activeFilterCount,
      apply: () => changeFilters({ ...clearFilters }),
    },
    {
      label: 'Em uso',
      value: contextRows.filter((a) => a.situacao === 'Em uso').length,
      icon: CheckCheck,
      className: 'green',
      active: filters.situacao === 'Em uso',
      apply: () =>
        changeFilters({ ...filters, situacao: filters.situacao === 'Em uso' ? '' : 'Em uso' }),
    },
    {
      label: 'Sem patrimônio oficial',
      value: contextRows.filter((a) => !a.numeroPatrimonial.trim()).length,
      icon: FileQuestion,
      className: 'amber',
      active: filters.oficial === 'nao',
      apply: () => changeFilters({ ...filters, oficial: filters.oficial === 'nao' ? '' : 'nao' }),
    },
    {
      label: 'Sem fotografia',
      value: contextRows.filter((a) => !a.fotoCount).length,
      icon: Camera,
      className: 'purple',
      active: filters.foto === 'nao',
      apply: () => changeFilters({ ...filters, foto: filters.foto === 'nao' ? '' : 'nao' }),
    },
    {
      label: 'Sem verificação',
      value: contextRows.filter((a) => !a.verificadoEm).length,
      icon: ClipboardCheck,
      className: 'slate',
      active: filters.verificacao === 'nao',
      apply: () =>
        changeFilters({ ...filters, verificacao: filters.verificacao === 'nao' ? '' : 'nao' }),
    },
  ];
  const pages = Math.max(1, Math.ceil(rows.length / 60));
  const safePage = Math.min(page, pages);
  if (error)
    return (
      <div className="fatal-error" role="alert">
        <h2>Não foi possível abrir o inventário</h2>
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    );
  return (
    <div className={`inventory-page ${selected ? 'has-selection' : ''}`}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PREFEITURA DE FRANCISCO BELTRÃO</div>
          <h1>
            {archived ? 'Patrimônios arquivados' : 'Inventário patrimonial'}
            <span className="version-tag">{isCloud ? 'NUVEM' : 'LOCAL'}</span>
          </h1>
          <p>
            {archived
              ? 'Registros preservados, prontos para serem restaurados.'
              : 'Cada equipamento no seu lugar. Cada informação ao seu alcance.'}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus size={18} />
          Novo patrimônio
        </Button>
      </div>
      <div className="stats-grid">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={s.apply}
            className={`stat-card ${s.active ? 'stat-active' : ''}`}
            aria-pressed={s.active}
          >
            <div className="stat-top">
              <span>{s.label}</span>
              <s.icon size={17} className={s.className} />
            </div>
            <strong>{loading ? '—' : s.value.toLocaleString('pt-BR')}</strong>
            <span className="stat-bottom">
              {department === 'todos'
                ? 'Todas as secretarias'
                : catalog.departments.find((d) => d.id === department)?.nome ||
                  'Secretaria selecionada'}
              <ArrowRight size={13} />
            </span>
          </button>
        ))}
      </div>
      <section className="workspace-section">
        <div className="workspace-topline">
          <div>
            <LayoutList size={17} />
            <h2>{archived ? 'Arquivo de equipamentos' : 'Todos os equipamentos'}</h2>
            <span className="count-pill">{rows.length}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              download(
                exportCSV(rows, catalog),
                `patrimonios-${new Date().toLocaleDateString('en-CA')}.csv`,
              );
              notify(`${rows.length} registro(s) exportado(s) para CSV.`);
            }}
          >
            <Download size={15} />
            Exportar CSV
          </Button>
        </div>
        <div className="search-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Pesquisar patrimônios"
              placeholder="Buscar por nome, código, patrimônio, série, placa ou frota…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                aria-label="Limpar pesquisa"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
              >
                <X size={15} />
              </button>
            )}
            <kbd>/</kbd>
          </div>
          <Button
            variant="secondary"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={16} />
            Filtros
            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
          </Button>
          <label className="sort-field">
            <ArrowDownUp size={15} />
            <span className="sr-only">Ordenação</span>
            <select
              aria-label="Ordenação"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                setPage(1);
              }}
            >
              <option value="nome">Nome A–Z</option>
              <option value="nome-desc">Nome Z–A</option>
              <option value="recente">Mais recentes</option>
              <option value="antigo">Mais antigos</option>
              <option value="atualizado">Última atualização</option>
              <option value="codigo">Código interno</option>
            </select>
          </label>
        </div>
        {showFilters && (
          <Filters values={filters} onChange={changeFilters} categories={catalog.categories} />
        )}
        {activeFilterCount > 0 && !showFilters && (
          <div className="active-filters">
            {activeFilterCount} filtro(s) aplicado(s)
            <button onClick={() => changeFilters({ ...clearFilters })}>
              Limpar filtros <X size={12} />
            </button>
          </div>
        )}
        <div className={`inventory-workspace ${selected ? 'split' : ''}`}>
          <div className="list-column">
            <div className="list-column-head">
              <span>EQUIPAMENTO</span>
              <span className="list-category-head">CATEGORIA</span>
              <span className="list-status-head">SITUAÇÃO</span>
            </div>
            <div
              ref={list}
              className="asset-list"
              role="list"
              aria-label="Lista de patrimônios"
              aria-busy={loading}
            >
              {loading ? (
                <div className="list-loading">Carregando seu inventário…</div>
              ) : rows.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    {search || activeFilterCount ? (
                      <Search size={29} strokeWidth={1.4} />
                    ) : (
                      <Package size={32} strokeWidth={1.4} />
                    )}
                  </div>
                  <h3>
                    {search || activeFilterCount
                      ? 'Nenhum equipamento encontrado'
                      : archived
                        ? 'Seu arquivo está vazio'
                        : 'O primeiro registro é o começo'}
                  </h3>
                  <p>
                    {search || activeFilterCount
                      ? 'Tente outro termo ou ajuste os filtros da pesquisa.'
                      : archived
                        ? 'Patrimônios arquivados aparecerão aqui, com todos os dados preservados.'
                        : 'Cadastre um equipamento usando só o nome. As outras informações podem vir depois.'}
                  </p>
                  {search || activeFilterCount ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('');
                        changeFilters({ ...clearFilters });
                      }}
                    >
                      Limpar pesquisa e filtros
                    </Button>
                  ) : (
                    !archived && (
                      <Button onClick={openNew}>
                        <Plus size={16} />
                        Cadastrar primeiro patrimônio
                      </Button>
                    )
                  )}
                  <small>
                    {isCloud
                      ? 'Seus dados ficam no espaço de trabalho compartilhado.'
                      : 'Seus dados ficam neste navegador.'}
                  </small>
                </div>
              ) : (
                rows.slice((safePage - 1) * 60, safePage * 60).map((a) => (
                  <div role="listitem" key={a.id}>
                    <button
                      className={`asset-row ${a.id === selected ? 'selected' : ''}`}
                      onClick={() => selectAsset(a)}
                      aria-current={a.id === selected ? 'true' : undefined}
                    >
                      <AssetIcon asset={a} />
                      <div className="asset-row-info">
                        <strong>{a.nome}</strong>
                        <div>
                          <span className="code">{a.codigoInterno}</span>
                          {a.numeroPatrimonial && <span>Pat. {a.numeroPatrimonial}</span>}
                          {department === 'todos' && (
                            <span>
                              {catalog.departments.find((d) => d.id === a.secretariaId)?.nome}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="row-category">
                        {catalog.categories.find((c) => c.id === a.categoriaId)?.nome || (
                          <span className="muted">Sem categoria</span>
                        )}
                      </span>
                      <span className="row-status">
                        <StatusBadge value={a.situacao} />
                      </span>
                      <ChevronRight className="row-arrow" size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="list-footer">
              <span>
                {rows.length
                  ? `${(safePage - 1) * 60 + 1}–${Math.min(safePage * 60, rows.length)} de ${rows.length} equipamentos`
                  : '0 equipamentos'}
              </span>
              {pages > 1 && (
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Página anterior"
                    disabled={safePage === 1}
                    onClick={() => {
                      setPage(safePage - 1);
                      list.current?.scrollTo(0, 0);
                    }}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span>
                    {safePage}/{pages}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Próxima página"
                    disabled={safePage === pages}
                    onClick={() => {
                      setPage(safePage + 1);
                      list.current?.scrollTo(0, 0);
                    }}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
              <span className="list-footer-note">
                <span className="local-dot" />
                {isCloud ? 'Salvo na nuvem' : 'Armazenamento local'}
              </span>
            </div>
          </div>
          {selected && (
            <div className="detail-column">
              {detail ? (
                <AssetDetail
                  key={detail.asset.id}
                  detail={detail}
                  onClose={() => selectAsset()}
                  onSaved={selectSaved}
                />
              ) : (
                <div className="detail-placeholder">
                  <p>
                    {detailLoading
                      ? 'Abrindo ficha…'
                      : 'Patrimônio não encontrado neste navegador.'}
                  </p>
                  <Button variant="secondary" onClick={() => selectAsset()}>
                    Voltar à lista
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      <div className="page-footnote">
        <ShieldNote />
        Inventário operacional · Os registros não substituem o sistema patrimonial oficial.
      </div>
      <Dialog
        open={newAsset}
        onOpenChange={closeNew}
        title="Novo patrimônio"
        description="Comece pelo essencial. Complete a ficha no seu ritmo."
        wide
      >
        <AssetForm
          key={newAsset ? 'open' : 'closed'}
          department={department}
          quick
          onCancel={() => closeNew(false)}
          onSaved={(a, another) => {
            if (!another) {
              setNewAsset(false);
              selectSaved(a);
            }
          }}
        />
      </Dialog>
    </div>
  );
}
function ShieldNote() {
  return <ClipboardCheck size={14} />;
}
