import type {
  Asset,
  AssetDraft,
  Catalog,
  Category,
  Detail,
  Photo,
  Snapshot,
  Verification,
} from './models';

export interface PatrimonioRepository {
  create(draft: AssetDraft): Promise<Asset>;
  update(id: string, draft: AssetDraft, expectedUpdatedAt?: string): Promise<Asset>;
  archive(id: string, archived: boolean): Promise<void>;
  detail(id: string): Promise<Detail | undefined>;
  duplicates(draft: AssetDraft, exclude?: string): Promise<Asset[]>;
}
export interface CategoriaRepository {
  save(category: Category): Promise<void>;
}
export interface FotografiaRepository {
  get(id: string, thumbnail?: boolean): Promise<Blob | undefined>;
  add(id: string, photos: { arquivo: Blob; miniatura: Blob; descricao: string }[]): Promise<void>;
  remove(id: string): Promise<void>;
  setPrimary(id: string): Promise<void>;
  describe(id: string, description: string): Promise<void>;
}
export interface SecretariaRepository {
  list(): Promise<Catalog['departments']>;
}
export interface LocalStore {
  initialize(): Promise<void>;
  catalog(): Promise<Catalog>;
  subscribe(onChange: () => void, onError: (error: unknown) => void): () => void;
  snapshot(): Promise<Snapshot>;
  replace(snapshot: Snapshot, options?: { requireEmpty?: boolean }): Promise<void>;
  verify(verification: Omit<Verification, 'id'>): Promise<void>;
  seedDemo(): Promise<void>;
}
