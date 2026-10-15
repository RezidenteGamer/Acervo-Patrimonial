import Dexie, { type Table } from 'dexie';
import type {
  Asset,
  Category,
  Counter,
  Department,
  History,
  Photo,
  Verification,
} from '../domain/models';

export class InventoryDB extends Dexie {
  assets!: Table<Asset, string>;
  departments!: Table<Department, string>;
  categories!: Table<Category, string>;
  photos!: Table<Photo, string>;
  verifications!: Table<Verification, string>;
  history!: Table<History, string>;
  counters!: Table<Counter, string>;
  constructor(name = 'acervo-francisco-beltrao') {
    super(name);
    // Version 1 is the initial schema. Future changes must add version(n).upgrade().
    this.version(1).stores({
      assets: 'id,&codigoInterno,secretariaId,categoriaId,nome,atualizadoEm,arquivadoEm',
      departments: 'id,&prefixo',
      categories: 'id',
      photos: 'id,patrimonioId',
      verifications: 'id,patrimonioId,data',
      history: 'id,patrimonioId,data',
      counters: 'prefixo',
    });
  }
}
