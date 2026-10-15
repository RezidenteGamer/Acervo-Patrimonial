import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Check, ChevronDown, LoaderCircle } from 'lucide-react';
import {
  assetDraftSchema,
  CONDITION,
  emptyDraft,
  FUEL,
  STATUS,
  type Asset,
  type AssetDraft,
} from '../domain/models';
import { useInventory } from '../hooks/useInventory';
import { repositories } from '../services';
import { Button } from './ui/button';
export function AssetForm({
  asset,
  department,
  onSaved,
  onCancel,
  quick = false,
}: {
  asset?: Asset;
  department: string;
  onSaved: (asset: Asset, another: boolean) => void;
  onCancel: () => void;
  quick?: boolean;
}) {
  const { catalog, run, dirty, notify } = useInventory();
  const [expanded, setExpanded] = useState(!quick);
  const [duplicates, setDuplicates] = useState<Asset[]>([]);
  const saveLock = useRef(false);
  const originalTimestamp = useRef(asset?.atualizadoEm);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<AssetDraft>({
    resolver: zodResolver(assetDraftSchema),
    defaultValues: asset ?? emptyDraft(department === 'todos' ? '' : department),
    shouldUnregister: false,
  });
  const category = catalog.categories.find((c) => c.id === watch('categoriaId'));
  const [official, serial, plate] = watch(['numeroPatrimonial', 'numeroSerie', 'placa']);
  useEffect(() => {
    dirty.current = isDirty;
    return () => {
      dirty.current = false;
    };
  }, [isDirty, dirty]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      repositories.assets
        .duplicates(
          { ...emptyDraft(), numeroPatrimonial: official, numeroSerie: serial, placa: plate },
          asset?.id,
        )
        .then((rows) => {
          if (alive) setDuplicates(rows);
        })
        .catch(() => {
          if (alive) notify('Não foi possível verificar duplicidades.', true);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [official, serial, plate, asset?.id, notify]);
  const save = (another = false) =>
    handleSubmit(async (values) => {
      if (saveLock.current) return;
      saveLock.current = true;
      await run(
        async () => {
          const saved = asset
            ? await repositories.assets.update(asset.id, values, originalTimestamp.current)
            : await repositories.assets.create(values);
          reset(another ? emptyDraft(saved.secretariaId) : saved);
          originalTimestamp.current = saved.atualizadoEm;
          dirty.current = false;
          onSaved(saved, another);
        },
        asset
          ? 'Alterações salvas.'
          : 'Patrimônio cadastrado. Você pode completar a ficha quando quiser.',
      );
      if (another) setTimeout(() => document.getElementById('field-nome')?.focus(), 0);
      saveLock.current = false;
    });
  const field = (key: FieldPath<AssetDraft>, label: string, numeric = false, hint?: string) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input
        id={`field-${key}`}
        aria-label={label}
        aria-describedby={errors[key] ? `error-${key}` : undefined}
        aria-required={key === 'nome'}
        type={numeric ? 'number' : 'text'}
        step={key === 'anoFabricacao' ? '1' : 'any'}
        min={numeric ? 0 : undefined}
        autoFocus={key === 'nome'}
        placeholder={hint}
        {...register(
          key,
          numeric ? { setValueAs: (value) => (value === '' ? undefined : Number(value)) } : {},
        )}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && (
        <small id={`error-${key}`} className="field-error">
          {errors[key]?.message}
        </small>
      )}
    </label>
  );
  const select = (key: FieldPath<AssetDraft>, label: string, options: string[]) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <select {...register(key)}>
        <option value="">Não informado</option>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="asset-form"
      onSubmit={save()}
      aria-label={asset ? 'Editar patrimônio' : 'Cadastrar patrimônio'}
    >
      <div className="form-primary">
        {field('nome', 'Nome do equipamento *', false, 'Ex.: Roçadeira Stihl FS 220')}
        <label className="field">
          <span>Secretaria {department === 'todos' ? '*' : ''}</span>
          <select
            {...register('secretariaId')}
            aria-label={department === 'todos' ? 'Secretaria *' : 'Secretaria'}
            aria-required
            aria-describedby={errors.secretariaId ? 'error-secretariaId' : undefined}
            aria-invalid={!!errors.secretariaId}
          >
            <option value="">Escolha a secretaria</option>
            {catalog.departments
              .filter((d) => d.ativa)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
          </select>
          {errors.secretariaId && (
            <small id="error-secretariaId" className="field-error">
              {errors.secretariaId.message}
            </small>
          )}
        </label>
      </div>
      {!expanded && (
        <>
          <p className="form-hint">
            <Check size={15} /> Só o nome é obrigatório. O código interno é gerado ao salvar.
          </p>
          <button
            type="button"
            className="text-button expand-fields"
            onClick={() => setExpanded(true)}
          >
            Adicionar mais informações <ChevronDown size={15} />
          </button>
        </>
      )}
      {expanded && (
        <>
          <div className="form-section-title">Identificação</div>
          <div className="form-grid">
            <label className="field">
              <span>Categoria</span>
              <select {...register('categoriaId')}>
                <option value="">Não informada</option>
                {catalog.categories
                  .filter((c) => c.ativa || c.id === asset?.categoriaId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {!c.ativa ? ' (inativa)' : ''}
                    </option>
                  ))}
              </select>
            </label>
            {field('numeroPatrimonial', 'Patrimônio oficial')}
            {field('numeroSerie', 'Número de série')}
            {field('fabricante', 'Marca / fabricante')}
            {field('modelo', 'Modelo')}
            {field('anoFabricacao', 'Ano de fabricação', true)}
          </div>
          <div className="form-section-title">Informações operacionais</div>
          <div className="form-grid">
            {select('situacao', 'Situação', STATUS)}
            {select('conservacao', 'Conservação', CONDITION)}
            {field('localizacao', 'Localização física')}
            {field('responsavel', 'Setor / equipe responsável')}
            {category && category.perfil !== 'geral' && select('combustivel', 'Combustível', FUEL)}
          </div>
          <details
            className="extra-fields"
            open={
              category?.perfil === 'veiculo' || category?.perfil === 'maquina' ? true : undefined
            }
          >
            <summary>
              Veículo, frota e medidores <span>Campos adicionais</span>
            </summary>
            <div className="form-grid">
              {field('placa', 'Placa')}
              {field('numeroFrota', 'Número de frota')}
              {field('chassi', 'Número de chassi')}
              {field('quilometragem', 'Quilometragem (km)', true)}
              {field('horimetro', 'Horímetro (h)', true)}
              {(!category || category.perfil === 'geral') &&
                select('combustivel', 'Combustível', FUEL)}
            </div>
          </details>
          <label className="field">
            <span>Descrição e observações</span>
            <textarea rows={3} maxLength={10000} {...register('observacoes')} />
          </label>
        </>
      )}
      {duplicates.length > 0 && (
        <div className="notice warning" role="status">
          <AlertTriangle size={18} />
          <div>
            <strong>Possível duplicidade</strong>
            <p>
              {duplicates.map((a) => `${a.nome} (${a.codigoInterno})`).join(', ')}. Confira os
              identificadores. Você pode salvar mesmo assim.
            </p>
          </div>
        </div>
      )}
      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <div>
          {!asset && (
            <Button variant="secondary" disabled={isSubmitting} onClick={() => void save(true)()}>
              Salvar e cadastrar outro
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {asset ? 'Salvar alterações' : 'Salvar patrimônio'}
          </Button>
        </div>
      </div>
    </form>
  );
}
