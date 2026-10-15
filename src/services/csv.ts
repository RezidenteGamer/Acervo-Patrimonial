import type { Asset, Catalog } from '../domain/models';
export function exportCSV(assets: Asset[], catalog: Catalog): Blob {
  const columns: [string, (a: Asset) => unknown][] = [
    ['Identificador', (a) => a.id],
    ['Código interno', (a) => a.codigoInterno],
    ['Nome', (a) => a.nome],
    ['Secretaria', (a) => catalog.departments.find((d) => d.id === a.secretariaId)?.nome],
    ['Categoria', (a) => catalog.categories.find((c) => c.id === a.categoriaId)?.nome],
    ...Object.entries({
      numeroPatrimonial: 'Patrimônio oficial',
      numeroSerie: 'Número de série',
      fabricante: 'Fabricante',
      modelo: 'Modelo',
      anoFabricacao: 'Ano',
      combustivel: 'Combustível',
      placa: 'Placa',
      numeroFrota: 'Frota',
      chassi: 'Chassi',
      quilometragem: 'Quilometragem',
      horimetro: 'Horímetro',
      conservacao: 'Conservação',
      situacao: 'Situação',
      localizacao: 'Localização',
      responsavel: 'Equipe responsável',
      observacoes: 'Observações',
      criadoEm: 'Criado em',
      atualizadoEm: 'Atualizado em',
      arquivadoEm: 'Arquivado em',
      verificadoEm: 'Verificação física',
      fotoCount: 'Fotografias',
    }).map(
      ([key, label]) =>
        [label, (a: Asset) => a[key as keyof Asset]] as [string, (a: Asset) => unknown],
    ),
  ];
  // Neutralize spreadsheet formulas, including leading whitespace/control characters.
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return new Blob(
    [
      '\uFEFF' +
        [
          columns.map(([name]) => cell(name)).join(';'),
          ...assets.map((a) => columns.map(([, get]) => cell(get(a))).join(';')),
        ].join('\r\n'),
    ],
    { type: 'text/csv;charset=utf-8' },
  );
}
