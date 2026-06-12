import { db, type BackupRecord } from '../db';
import { strToU8, zipSync, unzipSync, strFromU8, gzipSync, gunzipSync } from 'fflate';
import { format } from 'date-fns';

const MAX_BACKUPS = 30; // Keep last 30 backups
const AUTO_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export async function createBackup(userId: string, type: 'auto' | 'manual' = 'manual'): Promise<BackupRecord> {
  const tables = ['products', 'invoices', 'payments', 'profile', 'expenses', 'categories'];
  const exportData: any = {
    version: 1,
    timestamp: Date.now(),
    userId,
    tables: {}
  };

  let totalRecords = 0;
  for (const table of tables) {
    const records = await (db as any)[table].where('userId').equals(userId).toArray();
    exportData.tables[table] = records;
    totalRecords += records.length;
  }

  const jsonString = JSON.stringify(exportData);
  const data = strToU8(jsonString);
  const compressed = gzipSync(data);

  const filename = `quin_backup_${format(new Date(), 'yyyyMMdd_HHmmss')}_${type}.zlib`;
  
  const record: BackupRecord = {
    userId,
    date: Date.now(),
    data: compressed,
    filename,
    size: compressed.length,
    recordCount: totalRecords,
    type
  };

  const id = await db.backups.add(record);
  await manageRetention(userId);
  
  return { ...record, id: id as number };
}

export async function restoreFromBackup(backupId: number, userId: string) {
  const record = await db.backups.get(backupId);
  if (!record) throw new Error('Backup not found');

  const decompressed = gunzipSync(record.data);
  const jsonString = strFromU8(decompressed);
  const data = JSON.parse(jsonString);

  // Validate data
  if (!data.tables) throw new Error('Invalid backup format');

  const tables = Object.keys(data.tables);
  
  // Transactional import (as much as possible)
  await db.transaction('rw', [db.products, db.invoices, db.payments, db.profile, db.expenses, db.categories], async () => {
    for (const table of tables) {
      if ((db as any)[table]) {
        // Delete existing for this user
        const existingIds = await (db as any)[table].where('userId').equals(userId).primaryKeys();
        await (db as any)[table].bulkDelete(existingIds);
        
        // Add new
        const items = data.tables[table].map((item: any) => ({
          ...item,
          userId // Ensure userId is correct
        }));
        await (db as any)[table].bulkAdd(items);
      }
    }
  });

  return true;
}

export async function manageRetention(userId: string) {
  const backups = await db.backups
    .where('userId')
    .equals(userId)
    .sortBy('date');

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
    const ids = toDelete.map(b => b.id!);
    await db.backups.bulkDelete(ids);
  }
}

export async function checkAndRunAutoBackup(userId: string) {
  const lastAutoBackup = await db.backups
    .where({ userId, type: 'auto' })
    .reverse()
    .first();

  if (!lastAutoBackup || (Date.now() - lastAutoBackup.date > AUTO_BACKUP_INTERVAL)) {
    try {
      await createBackup(userId, 'auto');
      console.log('Auto backup completed');
    } catch (error) {
      console.error('Auto backup failed', error);
    }
  }
}

export function downloadBackupFile(record: BackupRecord) {
  const blob = new Blob([record.data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = record.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importFromFile(file: File, userId: string): Promise<BackupRecord> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const compressed = new Uint8Array(buffer);
        
        // Basic check if it's our format (gzip)
        let decompressed;
        try {
          decompressed = gunzipSync(compressed);
        } catch (err) {
          throw new Error('Not a valid backup file (compression failure)');
        }

        const jsonString = strFromU8(decompressed);
        const data = JSON.parse(jsonString);

        if (!data.tables) throw new Error('Invalid backup content');

        // Create a local record first so it can be previewed/restored
        const record: BackupRecord = {
          userId,
          date: Date.now(),
          data: compressed,
          filename: file.name,
          size: compressed.length,
          recordCount: (Object.values(data.tables) as any[]).reduce((acc: number, t: any) => acc + t.length, 0),
          type: 'manual'
        };

        const id = await db.backups.add(record);
        resolve({ ...record, id: id as number });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File reading failed'));
    reader.readAsArrayBuffer(file);
  });
}

// Compatibility exports for sync.tsx
export async function exportDatabase(userId: string): Promise<string> {
  const tables = ['products', 'invoices', 'payments', 'profile', 'expenses', 'categories'];
  const exportData: any = {
    version: 1,
    timestamp: Date.now(),
    userId,
    tables: {}
  };

  for (const table of tables) {
    const records = await (db as any)[table].where('userId').equals(userId).toArray();
    exportData.tables[table] = records;
  }

  return JSON.stringify(exportData);
}

export async function importDatabase(userId: string, jsonString: string) {
  const data = JSON.parse(jsonString);
  if (!data.tables) throw new Error('Invalid database format');

  const tables = Object.keys(data.tables);
  await db.transaction('rw', [db.products, db.invoices, db.payments, db.profile, db.expenses, db.categories], async () => {
    for (const table of tables) {
      if ((db as any)[table]) {
        const existingIds = await (db as any)[table].where('userId').equals(userId).primaryKeys();
        await (db as any)[table].bulkDelete(existingIds);
        
        const items = data.tables[table].map((item: any) => ({
          ...item,
          userId
        }));
        await (db as any)[table].bulkAdd(items);
      }
    }
  });
}
