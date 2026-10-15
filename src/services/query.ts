import type { Asset } from '../domain/models';
import { normalize } from '../lib/utils';
export interface Filters {
  categoria: string;
  situacao: string;
  conservacao: string;
  combustivel: string;
  foto: string;
  oficial: string;
  verificacao: string;
}
export const clearFilters: Filters = {
  categoria: '',
  situacao: '',
  conservacao: '',
  combustivel: '',
  foto: '',
  oficial: '',
  verificacao: '',
};
export type Sort = 'nome' | 'nome-desc' | 'recente' | 'antigo' | 'atualizado' | 'codigo';
const presence = (filter: string, exists: boolean) =>
  !filter || (filter === 'sim' ? exists : !exists);
export function queryAssets(
  assets: Asset[],
  department: string,
  archived: boolean,
  search: string,
  filters: Filters,
  sort: Sort,
) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  const result = assets.filter(
    (a) =>
      (department === 'todos' || a.secretariaId === department) &&
      !!a.arquivadoEm === archived &&
      (!filters.categoria || a.categoriaId === filters.categoria) &&
      (!filters.situacao || a.situacao === filters.situacao) &&
      (!filters.conservacao || a.conservacao === filters.conservacao) &&
      (!filters.combustivel || a.combustivel === filters.combustivel) &&
      presence(filters.foto, a.fotoCount > 0) &&
      presence(filters.oficial, !!a.numeroPatrimonial.trim()) &&
      presence(filters.verificacao, !!a.verificadoEm) &&
      (!terms.length ||
        (() => {
          const hay = normalize(
            [
              a.nome,
              a.codigoInterno,
              a.numeroPatrimonial,
              a.numeroSerie,
              a.placa,
              a.numeroFrota,
              a.fabricante,
              a.modelo,
              a.localizacao,
            ].join(' '),
          );
          return terms.every((t) => hay.includes(t));
        })()),
  );
  return result.sort((a, b) => {
    switch (sort) {
      case 'nome-desc':
        return b.nome.localeCompare(a.nome, 'pt-BR');
      case 'recente':
        return (
          b.criadoEm.localeCompare(a.criadoEm) || b.codigoInterno.localeCompare(a.codigoInterno)
        );
      case 'antigo':
        return (
          a.criadoEm.localeCompare(b.criadoEm) || a.codigoInterno.localeCompare(b.codigoInterno)
        );
      case 'atualizado':
        return b.atualizadoEm.localeCompare(a.atualizadoEm);
      case 'codigo':
        return a.codigoInterno.localeCompare(b.codigoInterno, 'pt-BR', { numeric: true });
      default:
        return a.nome.localeCompare(b.nome, 'pt-BR');
    }
  });
}
