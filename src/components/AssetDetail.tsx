import { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CalendarCheck2,
  Check,
  Clock3,
  MapPin,
  Pencil,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Asset, Detail } from '../domain/models';
import { useInventory } from '../hooks/useInventory';
import { repositories } from '../services';
import { formatDate } from '../lib/utils';
import { AssetForm } from './AssetForm';
import { PhotoGallery } from './PhotoGallery';
import { Button } from './ui/button';
export function StatusBadge({ value }: { value: string }) {
  return value ? (
    <span
      className={`status-badge ${value === 'Em uso' ? 'status-green' : value === 'Em manutenção' ? 'status-amber' : 'status-neutral'}`}
    >
      <i />
      {value}
    </span>
  ) : null;
}
function InfoSection({ title, rows }: { title: string; rows: [string, unknown][] }) {
  const filled = rows.filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== '',
  );
  return (
    <section className="info-section">
      <h3>{title}</h3>
      {filled.length ? (
        <dl className="info-grid">
          {filled.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">Informações ainda não preenchidas.</p>
      )}
    </section>
  );
}
function VerificationForm({ id, onSaved }: { id: string; onSaved: () => void }) {
  const { run } = useInventory();
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  return (
    <form
      className="verification-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        setBusy(true);
        const ok = await run(
          () =>
            repositories.store.verify({
              patrimonioId: id,
              data: String(data.get('data')),
              responsavel: String(data.get('responsavel')).trim(),
              observacao: String(data.get('observacao')).trim(),
            }),
          'Verificação presencial registrada.',
        );
        setBusy(false);
        if (ok) onSaved();
      }}
    >
      <div className="form-grid">
        <label className="field">
          <span>Data da verificação *</span>
          <input type="date" name="data" required max={today} defaultValue={today} />
        </label>
        <label className="field">
          <span>Responsável *</span>
          <input name="responsavel" required maxLength={500} placeholder="Nome de quem verificou" />
        </label>
      </div>
      <label className="field">
        <span>Observação</span>
        <textarea name="observacao" maxLength={3000} rows={2} />
      </label>
      <p className="form-hint">
        O nome informado é um registro em texto livre, sem autenticação de identidade.
      </p>
      <div className="end-actions">
        <Button variant="ghost" disabled={busy} onClick={onSaved}>
          Cancelar
        </Button>
        <Button disabled={busy} type="submit">
          <Check size={15} />
          Registrar verificação
        </Button>
      </div>
    </form>
  );
}
export function AssetDetail({
  detail,
  onClose,
  onSaved,
}: {
  detail: Detail;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}) {
  const { asset: a } = detail;
  const { catalog, dirty, run } = useInventory();
  const [editing, setEditing] = useState(false);
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const department = catalog.departments.find((d) => d.id === a.secretariaId);
  const cancel = () => {
    if (dirty.current && !window.confirm('Descartar as alterações não salvas?')) return;
    dirty.current = false;
    setEditing(false);
  };
  return (
    <article className="detail-panel" aria-label="Ficha do patrimônio">
      <header className="detail-header">
        <div className="detail-topline">
          <span className="eyebrow">FICHA DO PATRIMÔNIO</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar ficha e voltar à lista"
          >
            <X className="desktop-close" size={19} />
            <ArrowLeft className="mobile-back" size={20} />
          </Button>
        </div>
        <h2>{a.nome}</h2>
        <div className="detail-subtitle">
          <span className="code">{a.codigoInterno}</span>
          <span className="separator-dot">·</span>
          <span>{department?.nome}</span>
          <StatusBadge value={a.situacao} />
          {a.arquivadoEm && <span className="archive-label">Arquivado</span>}
        </div>
        <div className="detail-heading-actions">
          <span>
            <MapPin size={14} />
            {a.localizacao || 'Localização não informada'}
          </span>
          {!editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} />
              Editar ficha
            </Button>
          )}
        </div>
      </header>
      <div className="detail-body">
        {editing ? (
          <>
            <div className="edit-banner">
              <Pencil size={16} />
              Editando a ficha <span>Salve para confirmar suas alterações.</span>
            </div>
            <AssetForm
              asset={a}
              department={a.secretariaId}
              onCancel={cancel}
              onSaved={(saved) => {
                setEditing(false);
                onSaved(saved);
              }}
            />
          </>
        ) : (
          <>
            <PhotoGallery asset={a} photos={detail.photos} />
            <InfoSection
              title="Identificação"
              rows={[
                ['Patrimônio oficial', a.numeroPatrimonial],
                ['Número de série', a.numeroSerie],
                ['Categoria', catalog.categories.find((c) => c.id === a.categoriaId)?.nome],
                ['Marca / fabricante', a.fabricante],
                ['Modelo', a.modelo],
                ['Ano de fabricação', a.anoFabricacao],
              ]}
            />
            <InfoSection
              title="Informações operacionais"
              rows={[
                ['Combustível', a.combustivel],
                ['Número de frota', a.numeroFrota],
                ['Placa', a.placa],
                ['Chassi', a.chassi],
                [
                  'Quilometragem',
                  a.quilometragem === undefined
                    ? undefined
                    : `${a.quilometragem.toLocaleString('pt-BR')} km`,
                ],
                [
                  'Horímetro',
                  a.horimetro === undefined
                    ? undefined
                    : `${a.horimetro.toLocaleString('pt-BR')} h`,
                ],
                ['Conservação', a.conservacao],
                ['Localização', a.localizacao],
                ['Setor / equipe', a.responsavel],
              ]}
            />
            {a.observacoes && (
              <section className="info-section">
                <h3>Observações</h3>
                <p className="notes">{a.observacoes}</p>
              </section>
            )}
            <section className="verification-section">
              <div className="verification-summary">
                <div className={`verification-icon ${a.verificadoEm ? 'verified' : ''}`}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3>
                    {a.verificadoEm ? 'Existência física verificada' : 'Sem verificação presencial'}
                  </h3>
                  <p>
                    {a.verificadoEm
                      ? `${formatDate(a.verificadoEm)} · ${detail.verifications[0]?.responsavel}`
                      : 'O cadastro e as fotos não substituem a conferência física.'}
                  </p>
                </div>
              </div>
              {!verify && (
                <Button variant="secondary" size="sm" onClick={() => setVerify(true)}>
                  <CalendarCheck2 size={15} />
                  Registrar verificação
                </Button>
              )}
              {verify && <VerificationForm id={a.id} onSaved={() => setVerify(false)} />}
              {detail.verifications.length > 0 && (
                <details className="verification-history">
                  <summary>Ver registros de verificação ({detail.verifications.length})</summary>
                  {detail.verifications.map((v) => (
                    <div key={v.id}>
                      <strong>
                        {formatDate(v.data)} · {v.responsavel}
                      </strong>
                      {v.observacao && <p>{v.observacao}</p>}
                    </div>
                  ))}
                </details>
              )}
            </section>
            <section className="info-section history-section">
              <details>
                <summary>
                  <Clock3 size={16} />
                  Histórico de alterações <span>{detail.history.length}</span>
                </summary>
                <ol>
                  {detail.history.map((h) => (
                    <li key={h.id}>
                      <i />
                      <div>
                        <strong>
                          {h.tipoEvento.charAt(0).toUpperCase() + h.tipoEvento.slice(1)}
                        </strong>
                        <time>{formatDate(h.data)}</time>
                        <p>{h.resumo}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
            <footer className="detail-footer">
              <div>
                <span>Cadastrado em {formatDate(a.criadoEm)}</span>
                <span>Atualizado em {formatDate(a.atualizadoEm)}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      a.arquivadoEm
                        ? 'Restaurar este patrimônio à lista ativa?'
                        : 'Arquivar este patrimônio? Seus dados e fotografias serão preservados.',
                    )
                  )
                    return;
                  setBusy(true);
                  await run(
                    () => repositories.assets.archive(a.id, !a.arquivadoEm),
                    a.arquivadoEm ? 'Patrimônio restaurado.' : 'Patrimônio arquivado.',
                  );
                  setBusy(false);
                }}
              >
                {a.arquivadoEm ? <RotateCcw size={15} /> : <Archive size={15} />}
                {a.arquivadoEm ? 'Restaurar patrimônio' : 'Arquivar patrimônio'}
              </Button>
            </footer>
          </>
        )}
      </div>
    </article>
  );
}
