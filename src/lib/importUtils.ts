import JSZip from 'jszip';
import Papa from 'papaparse';
import initSqlJs from 'sql.js';
import { type Product, type Invoice, type Payment, type Expense } from '../db';
import { getInvoices, getPayments, getExpenses, getInventoryProducts } from './firestore';

export interface ImportSummary {
  products: { total: number; imported: number; skipped: number; duplicates: number };
  customers: { total: number; imported: number; skipped: number; duplicates: number };
  transactions: { total: number; imported: number; skipped: number; duplicates: number };
}

export interface ImportData {
  products: Partial<Product>[];
  customers: { name: string; phone: string; address?: string; balance?: number }[];
  transactions: Partial<Invoice>[];
  payments: Partial<Payment>[];
}

export async function backupData(userId: string) {
  try {
    const [invoices, payments, expenses, products] = await Promise.all([
      getInvoices(userId),
      getPayments(userId),
      getExpenses(userId),
      getInventoryProducts(userId)
    ]);

    const backup = {
      version: '1.0',
      timestamp: Date.now(),
      userId,
      data: {
        invoices,
        payments,
        expenses,
        products
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quin_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Backup failed:', error);
    throw new Error('Failed to create backup before import.');
  }
}

export async function detectDuplicates(userId: string, data: ImportData) {
  const [existingProducts, existingInvoices] = await Promise.all([
    getInventoryProducts(userId),
    getInvoices(userId)
  ]);

  const productNames = new Set(existingProducts.map(p => p.name.toLowerCase()));
  const customerMobiles = new Set(existingInvoices.map(i => i.customerMobile || ''));

  const filteredProducts = data.products.filter(p => !productNames.has(p.name?.toLowerCase() || ''));
  const filteredCustomers = data.customers.filter(c => !customerMobiles.has(c.phone || ''));

  return {
    products: filteredProducts,
    customers: filteredCustomers,
    transactions: data.transactions, // Transactions are usually unique by invoice number
    payments: data.payments,
    duplicatesCount: (data.products.length - filteredProducts.length) + (data.customers.length - filteredCustomers.length)
  };
}

export async function detectAndParseFile(file: File): Promise<ImportData> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  if (extension === 'zip' || extension === 'vyapar' || extension === 'mbk') {
    return parseZipBackup(file);
  } else if (extension === 'json') {
    return parseJsonBackup(file);
  } else if (extension === 'csv') {
    return parseCsvExport(file);
  } else if (extension === 'db' || extension === 'sqlite') {
    return parseSqliteBackup(file);
  }
  
  throw new Error('Unsupported file format. Please upload a JSON, CSV, or ZIP backup file.');
}

async function parseZipBackup(file: File): Promise<ImportData> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  
  // Look for common backup files inside the zip
  const jsonFile = Object.values(contents.files).find(f => f.name.endsWith('.json'));
  const sqliteFile = Object.values(contents.files).find(f => f.name.endsWith('.db') || f.name.endsWith('.sqlite'));
  
  if (jsonFile) {
    const jsonText = await jsonFile.async('text');
    return mapJsonToQuin(JSON.parse(jsonText));
  } else if (sqliteFile) {
    const buffer = await sqliteFile.async('arraybuffer');
    return parseSqliteBuffer(buffer);
  }
  
  throw new Error('No valid data found inside the ZIP file.');
}

async function parseJsonBackup(file: File): Promise<ImportData> {
  const text = await file.text();
  return mapJsonToQuin(JSON.parse(text));
}

async function parseCsvExport(file: File): Promise<ImportData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        resolve(mapCsvToQuin(results.data));
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

async function parseSqliteBackup(file: File): Promise<ImportData> {
  const buffer = await file.arrayBuffer();
  return parseSqliteBuffer(buffer);
}

async function parseSqliteBuffer(buffer: ArrayBuffer): Promise<ImportData> {
  const SQL = await initSqlJs({
    locateFile: file => `https://sql.js.org/dist/${file}`
  });
  const db = new SQL.Database(new Uint8Array(buffer));
  
  const data: ImportData = {
    products: [],
    customers: [],
    transactions: [],
    payments: []
  };

  try {
    // Attempt to read Vyapar-like tables
    const productRows = db.exec("SELECT * FROM Item");
    if (productRows.length > 0) {
      const columns = productRows[0].columns;
      productRows[0].values.forEach(row => {
        const item: any = {};
        columns.forEach((col, i) => item[col] = row[i]);
        data.products.push({
          name: item.itemName || item.Name,
          price: item.salePrice || item.SalePrice || 0,
          costPrice: item.purchasePrice || item.PurchasePrice || 0,
          stock: item.openingStock || item.OpeningStock || 0,
          primaryUnit: item.unit || item.Unit || 'Unit',
          sku: item.itemCode || item.ItemCode || ''
        });
      });
    }

    const customerRows = db.exec("SELECT * FROM Party");
    if (customerRows.length > 0) {
      const columns = customerRows[0].columns;
      customerRows[0].values.forEach(row => {
        const party: any = {};
        columns.forEach((col, i) => party[col] = row[i]);
        data.customers.push({
          name: party.partyName || party.Name,
          phone: party.contactNumber || party.Mobile || '',
          address: party.address || party.Address || '',
          balance: party.openingBalance || party.OpeningBalance || 0
        });
      });
    }
  } catch (e) {
    console.warn('SQLite parsing failed or tables not found:', e);
  }

  return data;
}

function mapJsonToQuin(json: any): ImportData {
  // Handle Vyapar JSON structure
  if (json.Items || json.Parties || json.Transactions) {
    return {
      products: (json.Items || []).map((item: any) => ({
        name: item.itemName,
        price: item.salePrice || 0,
        costPrice: item.purchasePrice || 0,
        stock: item.openingStock || 0,
        primaryUnit: item.unit || 'Unit',
        sku: item.itemCode || ''
      })),
      customers: (json.Parties || []).map((p: any) => ({
        name: p.partyName,
        phone: p.contactNumber || '',
        address: p.address || '',
        balance: p.openingBalance || 0
      })),
      transactions: (json.Transactions || []).map((t: any) => ({
        customerName: t.partyName,
        total: t.totalAmount || 0,
        date: t.date ? new Date(t.date).getTime() : Date.now(),
        invoiceNumber: t.invoiceNumber || ''
      })),
      payments: []
    };
  }

  // Handle MyBillBook structure
  if (json.items || json.customers || json.invoices) {
    return {
      products: (json.items || []).map((item: any) => ({
        name: item.name,
        price: item.selling_price || 0,
        costPrice: item.purchase_price || 0,
        stock: item.stock_quantity || 0,
        primaryUnit: item.unit || 'Unit'
      })),
      customers: (json.customers || []).map((c: any) => ({
        name: c.name,
        phone: c.mobile || '',
        address: c.address || '',
        balance: c.balance || 0
      })),
      transactions: (json.invoices || []).map((inv: any) => ({
        customerName: inv.customer_name,
        total: inv.total || 0,
        date: inv.created_at ? new Date(inv.created_at).getTime() : Date.now(),
        invoiceNumber: inv.invoice_number || ''
      })),
      payments: []
    };
  }

  return { products: [], customers: [], transactions: [], payments: [] };
}

function mapCsvToQuin(rows: any[]): ImportData {
  const data: ImportData = {
    products: [],
    customers: [],
    transactions: [],
    payments: []
  };

  rows.forEach(row => {
    // Heuristic detection based on column names
    const keys = Object.keys(row).map(k => k.toLowerCase());
    
    if (keys.includes('item name') || keys.includes('product name')) {
      data.products.push({
        name: row['Item Name'] || row['Product Name'] || row['name'],
        price: parseFloat(row['Sale Price'] || row['Price'] || row['price'] || '0'),
        costPrice: parseFloat(row['Purchase Price'] || row['Cost Price'] || row['cost_price'] || '0'),
        stock: parseFloat(row['Stock'] || row['Quantity'] || row['stock'] || '0'),
        primaryUnit: row['Unit'] || row['unit'] || 'Unit'
      });
    } else if (keys.includes('party name') || keys.includes('customer name')) {
      data.customers.push({
        name: row['Party Name'] || row['Customer Name'] || row['name'],
        phone: row['Contact Number'] || row['Mobile'] || row['phone'] || '',
        address: row['Address'] || row['address'] || '',
        balance: parseFloat(row['Opening Balance'] || row['Balance'] || '0')
      });
    }
  });

  return data;
}
