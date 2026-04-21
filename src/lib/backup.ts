import { db } from '../db';

export async function exportDatabase(userId: string) {
  const tables = ['products', 'invoices', 'payments', 'profile'];
  const data: any = {};

  for (const table of tables) {
    data[table] = await (db as any)[table].where('userId').equals(userId).toArray();
  }

  return JSON.stringify(data, null, 2);
}

export async function importDatabase(jsonString: string, userId: string) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Invalid JSON format');
  }

  const tables = ['products', 'invoices', 'payments', 'profile'];
  
  // Basic validation: check if it has the expected tables
  for (const table of tables) {
    if (!data.hasOwnProperty(table)) {
      throw new Error(`Missing table: ${table}`);
    }
  }

  for (const table of tables) {
    if (data[table]) {
      // Delete existing records for this user
      const existingIds = await (db as any)[table].where('userId').equals(userId).primaryKeys();
      await (db as any)[table].bulkDelete(existingIds);
      
      // Ensure all imported records have the correct userId
      const importedData = data[table].map((item: any) => ({
        ...item,
        userId
      }));
      await (db as any)[table].bulkAdd(importedData);
    }
  }
}

export function downloadBackup(jsonString: string) {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `quin_backup_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
