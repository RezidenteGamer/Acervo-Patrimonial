import { InventoryDB } from '../db/database';
import { createLocalRepositories } from '../repositories/local';
import { createCloudRepositories } from '../repositories/cloud';
import { isCloud, supabase } from './backend';
export const localRepositories = createLocalRepositories(new InventoryDB());
export const repositories =
  isCloud && supabase ? createCloudRepositories(supabase) : localRepositories;
