import { CONDITION, FUEL, STATUS, type Category } from '../domain/models';
import { clearFilters, type Filters as FilterValues } from '../services/query';
import { Button } from './ui/button';
export function Filters({
  values,
  onChange,
  categories,
}: {
  values: FilterValues;
  onChange: (filters: FilterValues) => void;
  categories: Category[];
}) {
  const select = (
    key: keyof FilterValues,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <select value={values[key]} onChange={(e) => onChange({ ...values, [key]: e.target.value })}>
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const choices = [
    { value: 'sim', label: 'Com' },
    { value: 'nao', label: 'Sem' },
  ];
  return (
    <div className="filters-panel" aria-label="Filtros de patrimônios">
      {select(
        'categoria',
        'Categoria',
        categories.map((c) => ({ value: c.id, label: c.nome + (!c.ativa ? ' (inativa)' : '') })),
      )}
      {select(
        'situacao',
        'Situação',
        STATUS.map((v) => ({ value: v, label: v })),
      )}
      {select(
        'conservacao',
        'Conservação',
        CONDITION.map((v) => ({ value: v, label: v })),
      )}
      {select(
        'combustivel',
        'Combustível',
        FUEL.map((v) => ({ value: v, label: v })),
      )}
      {select('foto', 'Fotografia', choices)}
      {select('oficial', 'Patrimônio oficial', choices)}
      {select('verificacao', 'Verificação presencial', choices)}
      <Button variant="ghost" size="sm" onClick={() => onChange({ ...clearFilters })}>
        Limpar todos os filtros
      </Button>
    </div>
  );
}
