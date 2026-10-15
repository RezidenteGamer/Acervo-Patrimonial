import { BackupService } from './backup';
import { repositories } from './index';
export const backupService = new BackupService(repositories.store);
