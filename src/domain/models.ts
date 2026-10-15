import { z } from 'zod';

const text = z.string().max(500);
const optionalNumber = z.number().finite().nonnegative().optional();
export const assetDraftSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do equipamento.').max(180),
  secretariaId: z.string().min(1, 'Escolha a secretaria de destino.'),
  numeroPatrimonial: text,
  numeroSerie: text,
  categoriaId: text,
  fabricante: text,
  modelo: text,
  anoFabricacao: z.number().int().min(1800).max(2200).optional(),
  combustivel: text,
  placa: text,
  numeroFrota: text,
  chassi: text,
  quilometragem: optionalNumber,
  horimetro: optionalNumber,
  conservacao: text,
  situacao: text,
  localizacao: text,
  responsavel: text,
  observacoes: z.string().max(10000),
});
export type AssetDraft = z.infer<typeof assetDraftSchema>;
export const assetSchema = assetDraftSchema.extend({
  id: z.uuid(),
  codigoInterno: z
    .string()
    .max(30)
    .regex(/^[A-Z]{2,8}-\d{6,}$/),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
  arquivadoEm: z.iso.datetime().optional(),
  fotoPrincipalId: z.uuid().optional(),
  fotoCount: z.number().int().nonnegative(),
  verificadoEm: z.string().optional(),
});
export type Asset = z.infer<typeof assetSchema>;
export const departmentSchema = z.object({
  id: z.string().min(1),
  nome: text.min(1),
  prefixo: z.string().regex(/^[A-Z]{2,8}$/),
  ativa: z.boolean(),
});
export type Department = z.infer<typeof departmentSchema>;
export const categorySchema = z.object({
  id: z.string().min(1),
  nome: text.trim().min(1),
  ativa: z.boolean(),
  perfil: z.enum(['geral', 'veiculo', 'maquina', 'portatil']),
});
export type Category = z.infer<typeof categorySchema>;
export const verificationSchema = z.object({
  id: z.uuid(),
  patrimonioId: z.uuid(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const date = new Date(`${v}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
    }, 'Data inválida'),
  responsavel: text.trim().min(1),
  observacao: z.string().max(3000),
});
export type Verification = z.infer<typeof verificationSchema>;
export const historySchema = z.object({
  id: z.uuid(),
  actorId: z.uuid().optional(),
  patrimonioId: z.uuid(),
  tipoEvento: z.enum([
    'criação',
    'alteração',
    'transferência',
    'arquivamento',
    'restauração',
    'verificação',
    'fotografia',
  ]),
  resumo: z.string().max(5000),
  data: z.iso.datetime(),
});
export type History = z.infer<typeof historySchema>;
export interface Photo {
  id: string;
  patrimonioId: string;
  arquivo: Blob;
  miniatura: Blob;
  descricao: string;
  principal: boolean;
  criadaEm: string;
}
export type PhotoMeta = Omit<Photo, 'arquivo' | 'miniatura'>;
export interface Counter {
  prefixo: string;
  valor: number;
}
export interface Snapshot {
  assets: Asset[];
  departments: Department[];
  categories: Category[];
  photos: Photo[];
  verifications: Verification[];
  history: History[];
  counters: Counter[];
}
export interface Catalog {
  assets: Asset[];
  departments: Department[];
  categories: Category[];
}
export interface Detail {
  asset: Asset;
  photos: PhotoMeta[];
  verifications: Verification[];
  history: History[];
}
export const emptyDraft = (secretariaId = ''): AssetDraft => ({
  nome: '',
  secretariaId,
  numeroPatrimonial: '',
  numeroSerie: '',
  categoriaId: '',
  fabricante: '',
  modelo: '',
  combustivel: '',
  placa: '',
  numeroFrota: '',
  chassi: '',
  conservacao: '',
  situacao: '',
  localizacao: '',
  responsavel: '',
  observacoes: '',
});
export const FUEL = [
  'Gasolina',
  'Etanol',
  'Flex',
  'Diesel S10',
  'Diesel S500',
  'Mistura gasolina/óleo 2T',
  'Elétrico',
  'Bateria',
  'Não se aplica',
  'Outro',
];
export const STATUS = ['Em uso', 'Em manutenção', 'Inativo', 'Emprestado', 'Baixado'];
export const CONDITION = ['Ótimo', 'Bom', 'Regular', 'Ruim', 'Inservível'];
export const initialDepartments: Department[] = [
  { id: 'urbanismo', nome: 'Urbanismo', prefixo: 'URB', ativa: true },
  { id: 'interior', nome: 'Interior', prefixo: 'INT', ativa: true },
];
export const initialCategories: Category[] = [
  ['veiculos', 'Veículos leves e utilitários', 'veiculo'],
  ['caminhoes', 'Caminhões', 'veiculo'],
  ['maquinas', 'Máquinas pesadas', 'maquina'],
  ['rocadeiras', 'Roçadeiras e sopradores', 'portatil'],
  ['ferramentas', 'Ferramentas', 'geral'],
  ['eletricos', 'Equipamentos elétricos', 'geral'],
  ['informatica', 'Informática e eletrônicos', 'geral'],
  ['mobiliario', 'Mobiliário', 'geral'],
  ['outros', 'Outros', 'geral'],
].map(([id, nome, perfil]) => ({ id, nome, ativa: true, perfil: perfil as Category['perfil'] }));
