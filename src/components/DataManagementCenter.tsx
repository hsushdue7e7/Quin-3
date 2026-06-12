import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, Database, Download, FileUp, Trash2, Shield, ShieldCheck, 
  RefreshCw, CheckCircle2, AlertTriangle, FileText, HardDrive, LogOut, 
  Loader2, Key, Users, BookOpen, AlertCircle, FileSpreadsheet, Lock, Activity, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type BackupRecord, type Product, type Invoice, type Payment, type Expense } from '../db';
import { createBackup, restoreFromBackup, downloadBackupFile, importFromFile, checkAndRunAutoBackup } from '../lib/backup';
import { deleteBusinessData, logActivity } from '../lib/firestore';
import { auth, db as firestoreDb } from '../lib/firebase';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { cn } from '../lib/utils';

interface DataManagementCenterProps {
  ownerId: string;
  onLogout: () => void;
  userEmail: string;
  onActionCompleted?: () => void;
}

export function DataManagementCenter({ ownerId, onLogout, userEmail, onActionCompleted }: DataManagementCenterProps) {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'backup' | 'export' | 'security' | 'deletion'>('backup');

  // Loaders & Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Backup & Recovery States
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([]);
  const [lastBackupDate, setLastBackupDate] = useState<number | null>(null);
  const [backupHistoryLoading, setBackupHistoryLoading] = useState(true);
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export States
  const [selectedExportType, setSelectedExportType] = useState<'sales' | 'quotes' | 'customers' | 'inventory' | 'all'>('all');
  const [exportFormat, setExportFormat] = useState<'json' | 'xlsx' | 'csv'>('json');

  // Deletion Flow States
  const [deletionStep, setDeletionStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [deletionChallenge, setDeletionChallenge] = useState('');
  const [deletionAuthEmail, setDeletionAuthEmail] = useState('');
  const [deletionAuthPassword, setDeletionAuthPassword] = useState('');
  const [deletionProgress, setDeletionProgress] = useState(0);
  const [deletionStats, setDeletionStats] = useState({
    totalSalesCount: 0,
    totalSalesValue: 0,
    totalQuotesCount: 0,
    totalQuotesValue: 0,
    totalProductsCount: 0,
    totalCustomersCount: 0,
    totalExpensesCount: 0,
    totalPaymentsCount: 0,
    totalTransactionsCount: 0
  });
  const [showDeletionConfirmModal, setShowDeletionConfirmModal] = useState(false);
  const [deletionReport, setDeletionReport] = useState<{
    status: 'success' | 'failed';
    recordsCleared: number;
    backupSaved: boolean;
    backupFilename: string;
  } | null>(null);

  // Confirmation Modals
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<'current' | 'all' | null>(null);

  // Load Backups and calculate last backup date
  useEffect(() => {
    loadBackupHistory();
    fetchBusinessStatistics();
  }, [ownerId]);

  const showToast = (message: string, type: 'success' | 'error') => {
    if (type === 'success') {
      setSuccessMessage(message);
      setErrorMessage(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    } else {
      setErrorMessage(message);
      setSuccessMessage(null);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const loadBackupHistory = async () => {
    setBackupHistoryLoading(true);
    try {
      // Load from IndexedDB Dexie Tab
      const records = await db.backups
        .where('userId')
        .equals(ownerId)
        .reverse()
        .sortBy('date');
      setBackupRecords(records);

      if (records.length > 0) {
        setLastBackupDate(records[0].date);
      } else {
        setLastBackupDate(null);
      }
    } catch (err) {
      console.error('Error loading backup record list:', err);
      showToast('Could not load backup history.', 'error');
    } finally {
      setBackupHistoryLoading(false);
    }
  };

  const fetchBusinessStatistics = async () => {
    try {
      // Gather local data for stats preview in deletion flow
      const [localProducts, localInvoices, localPayments, localExpenses] = await Promise.all([
        db.products.where('userId').equals(ownerId).toArray(),
        db.invoices.where('userId').equals(ownerId).toArray(),
        db.payments.where('userId').equals(ownerId).toArray(),
        db.expenses.where('userId').equals(ownerId).toArray()
      ]);

      const sales = localInvoices.filter(inv => !inv.type || inv.type === 'invoice');
      const quotes = localInvoices.filter(inv => inv.type === 'quotation');
      
      const salesSum = sales.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const quotesSum = quotes.reduce((sum, inv) => sum + (inv.total || 0), 0);

      // Unique customers derived from bills
      const uniqueCustomers = new Set(localInvoices.map(inv => inv.customerMobile || inv.customerName));

      setDeletionStats({
        totalSalesCount: sales.length,
        totalSalesValue: salesSum,
        totalQuotesCount: quotes.length,
        totalQuotesValue: quotesSum,
        totalProductsCount: localProducts.length,
        totalCustomersCount: uniqueCustomers.size,
        totalExpensesCount: localExpenses.length,
        totalPaymentsCount: localPayments.length,
        totalTransactionsCount: localInvoices.length + localPayments.length + localExpenses.length
      });
    } catch (err) {
      console.error('Error compiling statistics for deletion flow:', err);
    }
  };

  // 1. BACKUP & RESTORE ACTIONS
  const handleTriggerManualBackup = async () => {
    setActionLoading('backup-create');
    try {
      const backupRec = await createBackup(ownerId, 'manual');
      
      // Audit Log
      await logActivity({
        userId: ownerId,
        staffId: ownerId,
        staffName: userEmail.split('@')[0],
        action: 'Manual local backup created',
        details: `Backup: ${backupRec.filename}, containing ${backupRec.recordCount} entries.`,
        type: 'security',
        timestamp: Date.now()
      });

      showToast('Local SQLite Backup file successfully compiled and stored in IndexedDB.', 'success');
      await loadBackupHistory();
    } catch (err) {
      console.error('Backup failure:', err);
      showToast('Failed to create local data snapshot.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackupDownload = async (record: BackupRecord) => {
    try {
      downloadBackupFile(record);
      showToast('Backup archive download started successfully.', 'success');
    } catch (err) {
      showToast('Failed to trigger file download.', 'error');
    }
  };

  const handleBackupRestore = async (id: number) => {
    setActionLoading(`restore-${id}`);
    try {
      await restoreFromBackup(id, ownerId);

      // Audit Log
      await logActivity({
        userId: ownerId,
        staffId: ownerId,
        staffName: userEmail.split('@')[0],
        action: 'Database Restored from Local Backup',
        details: `Restored backup ID ${id} to replace offline profile.`,
        type: 'security',
        timestamp: Date.now()
      });

      showToast('Data snapshot successfully restored! Refreshing cache...', 'success');
      setConfirmRestoreId(null);
      if (onActionCompleted) onActionCompleted();
      
      // Full screen refresh to reload context safely
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('Restore failure:', err);
      showToast('Failed to clean table database state and restore backup.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackupDelete = async (id: number) => {
    try {
      await db.backups.delete(id);
      showToast('Backup record removed from search list.', 'success');
      await loadBackupHistory();
    } catch (err) {
      showToast('Failed to discard backup row.', 'error');
    }
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionLoading('backup-import');
    try {
      const isZlib = file.name.endsWith('.zlib');
      const isJson = file.name.endsWith('.json');

      if (!isZlib && !isJson) {
        throw new Error('Unsupported format. Please select a .zlib compressed backup or a plain .json backup.');
      }

      if (isZlib) {
        // Handle compressed .zlib formats
        await importFromFile(file, ownerId);
      } else {
        // Plain .json parsing and storage
        const fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.onerror = () => reject(new Error('Failed to read backup file.'));
          reader.readAsText(file);
        });

        const parsed = JSON.parse(fileContent);
        if (!parsed.tables || typeof parsed.tables !== 'object') {
          throw new Error('Corrupted or invalid backup contents inside the JSON file.');
        }

        const rawString = JSON.stringify(parsed);
        const fflateModule = await import('fflate');
        const compressedData = fflateModule.gzipSync(fflateModule.strToU8(rawString));

        const recordCount = Object.values(parsed.tables || {}).reduce((acc: number, val: any) => acc + (Array.isArray(val) ? val.length : 0), 0) as number;

        const record: BackupRecord = {
          userId: ownerId,
          date: Date.now(),
          data: compressedData,
          filename: file.name,
          size: compressedData.length,
          recordCount,
          type: 'manual'
        };

        await db.backups.add(record);
      }

      showToast('Backup file successfully parsed, decrypted, and imported to history.', 'success');
      await loadBackupHistory();
    } catch (err: any) {
      console.error('Import failed:', err);
      showToast(err.message || 'Import failed. Corrupted or invalid backup file.', 'error');
    } finally {
      setActionLoading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 2. EXPORT ACTIONS
  const handleExportData = async () => {
    setActionLoading('export-data');
    try {
      // Gather current local business states
      const [allProducts, allInvoices, allPayments, allExpenses, currentProfile] = await Promise.all([
        db.products.where('userId').equals(ownerId).toArray(),
        db.invoices.where('userId').equals(ownerId).toArray(),
        db.payments.where('userId').equals(ownerId).toArray(),
        db.expenses.where('userId').equals(ownerId).toArray(),
        db.profile.where('userId').equals(ownerId).first()
      ]);

      const sales = allInvoices.filter(inv => !inv.type || inv.type === 'invoice');
      const quotations = allInvoices.filter(inv => inv.type === 'quotation');

      // Unique customers derived from invoices and payments
      const customersMap = new Map();
      allInvoices.forEach(inv => {
        const key = `${inv.customerName}_${inv.customerMobile || ''}`;
        if (!customersMap.has(key)) {
          customersMap.set(key, {
            customerName: inv.customerName,
            customerMobile: inv.customerMobile || 'N/A',
            customerAddress: inv.customerAddress || 'N/A',
            customerGstin: inv.customerGstin || 'N/A',
            lastTransactionDate: format(inv.date, 'yyyy-MM-dd')
          });
        }
      });
      const customers = Array.from(customersMap.values());

      let payload: any = {};
      let filenamePrefix = 'quin_business_data';

      // Narrow down requested dataset
      if (selectedExportType === 'sales') {
        payload = sales;
        filenamePrefix = 'quin_sales';
      } else if (selectedExportType === 'quotes') {
        payload = quotations;
        filenamePrefix = 'quin_quotations';
      } else if (selectedExportType === 'customers') {
        payload = customers;
        filenamePrefix = 'quin_customers';
      } else if (selectedExportType === 'inventory') {
        payload = allProducts;
        filenamePrefix = 'quin_inventory';
      } else {
        // 'all' option bundles everything together
        payload = {
          profile: currentProfile || {},
          inventory: allProducts,
          sales: sales,
          quotations: quotations,
          payments: allPayments,
          expenses: allExpenses,
          timestamp: Date.now(),
          ownerId
        };
      }

      const timestampText = format(new Date(), 'yyyyMMdd_HHmmss');
      const filename = `${filenamePrefix}_${timestampText}.${exportFormat}`;

      // Perform conversion based on format
      if (exportFormat === 'json') {
        const dataStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        triggerBlobDownload(blob, filename);
      } else if (exportFormat === 'csv') {
        let csvContent = '';
        if (selectedExportType === 'all') {
          // Bundled exports in CSV are represented by writing multiple sections/tables with spacers
          csvContent += `=== COMPLETE BUSINESS EXPORT ===\nExport Date,${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}\nUser ID,${ownerId}\n\n`;
          csvContent += `== INVENTORY PRODUCTS ==\n` + Papa.unparse(allProducts) + `\n\n`;
          csvContent += `== SALES INVOICES ==\n` + Papa.unparse(sales) + `\n\n`;
          csvContent += `== QUOTATIONS ==\n` + Papa.unparse(quotations) + `\n\n`;
          csvContent += `== TRANSACTIONS PAYMENTS ==\n` + Papa.unparse(allPayments) + `\n\n`;
          csvContent += `== EXPENSES ==\n` + Papa.unparse(allExpenses) + `\n\n`;
        } else {
          csvContent = Papa.unparse(payload);
        }
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        triggerBlobDownload(blob, filename);
      } else if (exportFormat === 'xlsx') {
        // Native spreadsheet creation using XLSX package
        const wb = XLSX.utils.book_new();

        if (selectedExportType === 'all') {
          // Multipane book
          const wsProfile = XLSX.utils.json_to_sheet([currentProfile || {}]);
          XLSX.utils.book_append_sheet(wb, wsProfile, 'Profile');

          const wsInventory = XLSX.utils.json_to_sheet(allProducts);
          XLSX.utils.book_append_sheet(wb, wsInventory, 'Inventory');

          const wsSales = XLSX.utils.json_to_sheet(sales);
          XLSX.utils.book_append_sheet(wb, wsSales, 'Sales Invoices');

          const wsQuotes = XLSX.utils.json_to_sheet(quotations);
          XLSX.utils.book_append_sheet(wb, wsQuotes, 'Quotations');

          const wsPayments = XLSX.utils.json_to_sheet(allPayments);
          XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments Received');

          const wsExpenses = XLSX.utils.json_to_sheet(allExpenses);
          XLSX.utils.book_append_sheet(wb, wsExpenses, 'Business Expenses');
        } else {
          const wsSheet = XLSX.utils.json_to_sheet(Array.isArray(payload) ? payload : [payload]);
          XLSX.utils.book_append_sheet(wb, wsSheet, selectedExportType.toUpperCase());
        }

        XLSX.writeFile(wb, filename);
      }

      // Audit Log export activity
      await logActivity({
        userId: ownerId,
        staffId: ownerId,
        staffName: userEmail.split('@')[0],
        action: 'Data Export Triggered',
        details: `Exported ${selectedExportType} dataset as ${exportFormat.toUpperCase()}.`,
        type: 'other',
        timestamp: Date.now()
      });

      showToast(`Exported ${selectedExportType} successfully. Raw file downloaded.`, 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Could not compile dataset for download.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. ACCOUNT & SECURITY ACTIONS
  const handleSignoutProcess = async (logoutScope: 'current' | 'all') => {
    setActionLoading('security-scope');
    try {
      if (logoutScope === 'all') {
        const sessionsRef = collection(firestoreDb, 'userSessions');
        const q = query(sessionsRef, where('userId', '==', ownerId));
        const querySnapshot = await getDocs(q);
        const deletePromises = querySnapshot.docs.map(sessionDoc => deleteDoc(sessionDoc.ref));
        await Promise.all(deletePromises);
      }

      // Log activity before session clears
      try {
        await logActivity({
          userId: ownerId,
          staffId: ownerId,
          staffName: userEmail.split('@')[0],
          action: logoutScope === 'all' ? 'Logged out everywhere' : 'Logged out current device',
          details: `Cleared keys and signed out from session.`,
          type: 'security',
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('Logging session out failed to submit online trace. Proceeding...', e);
      }

      // Completely wipe local cache to satisfy security specs
      await Promise.all([
        db.profile.clear(),
        db.products.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.users.clear(),
        db.expenses.clear(),
        db.backups.clear()
      ]);

      localStorage.clear();
      sessionStorage.clear();
      showToast('Sessions destroyed. Signing out...', 'success');

      setTimeout(async () => {
        await auth.signOut();
        onLogout();
      }, 1000);
    } catch (err) {
      console.error('Logout process met an error:', err);
      showToast('Failed to invalidate all devices successfully. Clearing local state...', 'error');
      // local fail-safe signout
      localStorage.clear();
      sessionStorage.clear();
      await auth.signOut();
      onLogout();
    } finally {
      setActionLoading(null);
      setShowLogoutConfirm(null);
    }
  };

  // 4. DELETE ACCOUNT & BUSINESS DATA ASSISTANT
  const startBusinessDeletionFlow = async () => {
    // Compile and lock stats right away
    await fetchBusinessStatistics();
    setDeletionStep(1);
    setDeletionChallenge('');
    setDeletionAuthEmail('');
    setDeletionAuthPassword('');
    setDeletionProgress(0);
    setDeletionReport(null);
    setShowDeletionConfirmModal(true);
  };

  const handleProgressIncrement = (target: number, duration: number): Promise<void> => {
    return new Promise((resolve) => {
      let start = deletionProgress;
      const stepTime = Math.abs(Math.floor(duration / (target - start)));
      const timer = setInterval(() => {
        start += 1;
        setDeletionProgress(start);
        if (start >= target) {
          clearInterval(timer);
          resolve();
        }
      }, stepTime || 10);
    });
  };

  const executeDataDeletionChallenge = async () => {
    setDeletionStep(6);
    setDeletionProgress(5);
    
    let isBackupSuccessful = false;
    let backupFilename = '';

    try {
      // Step 2 (Automated pre-deletion backup)
      await handleProgressIncrement(30, 800);
      try {
        const backupRec = await createBackup(ownerId, 'auto');
        isBackupSuccessful = true;
        backupFilename = backupRec.filename;
        console.log('Pre-deletion automated backup succeeded:', backupRec.filename);
      } catch (backupErr) {
        console.error('Warn: Automatic pre-deletion backup failed, proceeding with deletion:', backupErr);
      }

      // Step 3 & 4 (Execution of deep remote Firestore deletion)
      await handleProgressIncrement(40, 500);
      await deleteBusinessData(ownerId);
      
      await handleProgressIncrement(85, 1200);

      // Step 5 (Delete local tables DB)
      await Promise.all([
        db.profile.clear(),
        db.products.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.users.clear(),
        db.expenses.clear(),
        db.backups.clear()
      ]);

      await handleProgressIncrement(100, 300);

      const clearedCount = deletionStats.totalProductsCount + 
                           deletionStats.totalSalesCount + 
                           deletionStats.totalQuotesCount + 
                           deletionStats.totalPaymentsCount + 
                           deletionStats.totalExpensesCount;

      setDeletionReport({
        status: 'success',
        recordsCleared: clearedCount,
        backupSaved: isBackupSuccessful,
        backupFilename: backupFilename
      });

      // Show toast
      showToast('Deletion successful. All your client records have been permanently purged.', 'success');

      // Clear sessions
      localStorage.clear();
      sessionStorage.clear();

    } catch (err: any) {
      console.error('Wipe operation fails:', err);
      setDeletionReport({
        status: 'failed',
        recordsCleared: 0,
        backupSaved: isBackupSuccessful,
        backupFilename: backupFilename
      });
      showToast(err.message || 'Wipe transaction failed or rolled back.', 'error');
    }
  };

  const calculateBackupStatus = () => {
    if (!lastBackupDate) return { badge: 'No Backups', color: 'bg-rose-500 text-white', text: 'You have not created any data snapshots yet. Create one to protect your records.' };
    const diff = Date.now() - lastBackupDate;
    const hours = diff / (1000 * 60 * 60);

    if (hours < 24) {
      return { badge: 'Up to Date', color: 'bg-emerald-500 text-white', text: `Last backup was executed ${Math.round(hours)} hours ago. Your system configuration is secure.` };
    } else if (hours < 72) {
      return { badge: 'Outdated', color: 'bg-amber-500 text-slate-800', text: `Last backup was executed ${Math.floor(hours / 24)} days ago. We suggest creating a backup now.` };
    } else {
      return { badge: 'Critical', color: 'bg-rose-500 text-white', text: `Attention: No backups has been taken in ${Math.floor(hours / 24)} days. Data is at risk of browser cache clearance!` };
    }
  };

  const backupStatus = calculateBackupStatus();

  return (
    <div id="data-management-center" className="max-w-6xl mx-auto space-y-6">
      {/* Alert Banner / Header */}
      <div className="bg-slate-900 text-white rounded-[2rem] p-6 md:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Database size={240} className="stroke-[1px]" />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-indigo-400 font-bold tracking-widest text-[11px] uppercase mb-2">
            <Shield size={14} /> Production Storage Engine
          </div>
          <h1 className="text-2xl md:text-3.5xl font-black text-white hover:tracking-tight transition-all tracking-tight leading-none">
            Data Management Center
          </h1>
          <p className="text-slate-400 font-medium text-sm md:text-base mt-2 max-w-2xl leading-relaxed">
            Validate offline backups, export complete sheets, invalidate unauthorized sessions, or manage data clearance cleanly from a centralized interface.
          </p>
        </div>
      </div>

      {/* Main Grid: Tabs on Left/Top, Panels on Right */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Tab Menu */}
        <div className="lg:w-64 shrink-0 space-y-2 flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible pb-3 lg:pb-0 scrollbar-none gap-2 lg:gap-0 border-b lg:border-b-0 border-slate-200">
          <button
            onClick={() => setActiveTab('backup')}
            className={cn(
              "w-full text-left py-3.5 px-5 rounded-2xl font-bold flex items-center gap-3 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]",
              activeTab === 'backup' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
            )}
          >
            <Database size={18} />
            Backup & Restore
          </button>
          
          <button
            onClick={() => setActiveTab('export')}
            className={cn(
              "w-full text-left py-3.5 px-5 rounded-2xl font-bold flex items-center gap-3 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]",
              activeTab === 'export' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
            )}
          >
            <Download size={18} />
            Data Export
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "w-full text-left py-3.5 px-5 rounded-2xl font-bold flex items-center gap-3 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]",
              activeTab === 'security' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
            )}
          >
            <Key size={18} />
            Account & Security
          </button>

          <button
            onClick={() => setActiveTab('deletion')}
            className={cn(
              "w-full text-left py-3.5 px-5 rounded-2xl font-bold flex items-center gap-3 transition-all cursor-pointer whitespace-nowrap active:scale-[0.98]",
              activeTab === 'deletion' 
                ? "bg-rose-50 text-rose-700 border border-rose-200 shadow-sm shadow-rose-100" 
                : "bg-white border border-slate-200 hover:bg-rose-50/50 hover:text-rose-600 hover:border-rose-100 text-slate-700"
            )}
          >
            <Trash2 size={18} />
            Delete Data
          </button>
        </div>

        {/* Action Panel Container */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {/* 1. BACKUP & RESTORE TAB */}
            {activeTab === 'backup' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Status Indicator Card */}
                <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className={cn("px-3 py-1 text-xs font-black rounded-full uppercase tracking-wider", backupStatus.color)}>
                        {backupStatus.badge}
                      </span>
                      {lastBackupDate && (
                        <span className="text-slate-500 text-xs font-bold font-mono">
                          Last Saved: {format(lastBackupDate, 'dd MMM yyyy HH:mm')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg md:text-xl tracking-tight leading-none">
                      Daily Automated Safeguard Engine
                    </h3>
                    <p className="text-slate-500 font-medium text-xs leading-relaxed max-w-lg">
                      {backupStatus.text}
                    </p>
                  </div>

                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!!actionLoading}
                      className="flex-1 md:flex-none uppercase tracking-wider text-xs py-3 px-5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all select-none active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Upload plain or compressed JSON snapshot"
                    >
                      <FileUp size={16} /> Insert File
                    </button>
                    <button
                      onClick={handleTriggerManualBackup}
                      disabled={!!actionLoading}
                      className="flex-1 md:flex-none uppercase tracking-wider text-xs py-3 px-5 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-100 select-none active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading === 'backup-create' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Database size={16} />
                      )}
                      Snap Data
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".zlib,.json"
                      onChange={handleImportBackupFile}
                    />
                  </div>
                </div>

                {/* History list */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden p-6 md:p-8 space-y-6">
                  <div>
                    <h3 className="text-base font-black text-slate-900 group">
                      Backup History Snapshot Registry
                    </h3>
                    <p className="text-xs text-slate-400 font-semibold mt-1">
                      History tracks your manual compilations and daily runs up to 30 snapshots with recovery indicators.
                    </p>
                  </div>

                  <AnimatePresence>
                    {backupHistoryLoading ? (
                      <div className="py-20 text-center">
                        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading Snapshots...</p>
                      </div>
                    ) : backupRecords.length === 0 ? (
                      <div className="py-16 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                        <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <h4 className="font-bold text-slate-700 text-sm">Registry is completely empty</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                          Click "Snap Data" to compile a local restore checkpoint of all your products, bills, customer relations, and expense spreadsheets.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {backupRecords.map((rec) => (
                          <div
                            key={rec.id}
                            className={cn(
                              "relative bg-white border border-slate-150 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:bg-slate-50/50",
                              rec.type === 'auto' ? "border-l-4 border-l-slate-400" : "border-l-4 border-l-indigo-500"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                rec.type === 'auto' ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-600"
                              )}>
                                {rec.type === 'auto' ? <Activity size={18} /> : <HardDrive size={18} />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-slate-900 text-sm">
                                    {format(rec.date, 'dd MMM yyyy, HH:mm')}
                                  </h4>
                                  <span className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full select-none",
                                    rec.type === 'auto' ? "bg-slate-100 text-slate-500" : "bg-indigo-50 text-indigo-700"
                                  )}>
                                    {rec.type}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 font-bold block mt-1 leading-none font-mono">
                                  {(rec.size / 1024).toFixed(1)} KB • {rec.recordCount} objects
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 w-full md:w-auto mt-2 md:mt-0">
                              <button
                                onClick={() => handleBackupDownload(rec)}
                                className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-100 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                                title="Download package locally"
                              >
                                <Download size={15} />
                              </button>
                              
                              <button
                                onClick={() => setConfirmRestoreId(rec.id || null)}
                                className="flex-1 md:flex-none uppercase tracking-wider text-[10px] h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1 justify-center"
                              >
                                Restore
                              </button>

                              <button
                                onClick={() => handleBackupDelete(rec.id!)}
                                className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-100 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {/* Overlaid restore confirmation pane */}
                            <AnimatePresence>
                              {confirmRestoreId === rec.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  className="absolute inset-0 bg-slate-950/95 text-white z-10 p-4 rounded-2xl flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0">
                                      <AlertTriangle size={20} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-white leading-none">Overwrite active tables?</p>
                                      <p className="text-slate-400 text-xs mt-1 truncate">This replaces your local profile and sales journals immediately.</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button
                                      onClick={() => setConfirmRestoreId(null)}
                                      className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleBackupRestore(rec.id!)}
                                      disabled={actionLoading === `restore-${rec.id}`}
                                      className="py-1.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    >
                                      {actionLoading === `restore-${rec.id}` ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        'Restore Now'
                                      )}
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* 2. DATA EXPORT TAB */}
            {activeTab === 'export' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    SaaS Data Export Portal
                  </h2>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    Extract live customer registries, products, or billing ledgers formatted directly for spreadsheets & audit compatibility.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Scope picker */}
                  <div className="space-y-4">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest leading-none">
                      1. Select Target Dataset
                    </label>
                    <div className="space-y-2">
                      {[
                        { id: 'all', title: 'Complete Business Portfolio', desc: 'Bundles all sales, inventory products, payments, profile settings, and details.' },
                        { id: 'sales', title: 'Sales Journals Only', desc: 'Invoices issued to clients showing total totals, taxes, and items.' },
                        { id: 'quotes', title: 'Quotations Logs', desc: 'Price estimates, conditions, and validity profiles.' },
                        { id: 'customers', title: 'Customer Database', desc: 'Derived lists of clients with names, phone numbers, and addresses.' },
                        { id: 'inventory', title: 'Inventory Stock Sheet', desc: 'Products, skus, price tags, and current catalog counts.' }
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedExportType(item.id as any)}
                          className={cn(
                            "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                            selectedExportType === item.id 
                              ? "bg-indigo-50 border-indigo-200 text-indigo-900" 
                              : "border-slate-150 bg-white hover:bg-slate-50 text-slate-700"
                          )}
                        >
                          <div className="space-y-0.5">
                            <h4 className="font-bold text-sm leading-none">{item.title}</h4>
                            <p className="text-[11px] text-slate-400 group-hover:text-slate-500">{item.desc}</p>
                          </div>
                          <div className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center border-slate-200">
                            {selectedExportType === item.id && <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Format picker & Action */}
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest leading-none">
                        2. Choose Target Format
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'xlsx', title: 'Excel File', extension: '.xlsx', color: 'border-emerald-200 text-emerald-800 bg-emerald-50' },
                          { id: 'csv', title: 'CSV Table', extension: '.csv', color: 'border-slate-200 text-slate-800 bg-slate-50' },
                          { id: 'json', title: 'JSON Blueprint', extension: '.json', color: 'border-blue-200 text-blue-800 bg-blue-50' }
                        ].map((fmt) => (
                          <div
                            key={fmt.id}
                            onClick={() => setExportFormat(fmt.id as any)}
                            className={cn(
                              "p-4 rounded-2xl border text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5",
                              exportFormat === fmt.id 
                                ? fmt.color + " shadow-inner font-bold" 
                                : "border-slate-150 bg-white hover:bg-slate-50 text-slate-600"
                            )}
                          >
                            <FileSpreadsheet size={22} className={exportFormat === fmt.id ? "" : "text-slate-400"} />
                            <div className="text-xs font-bold leading-none">{fmt.title}</div>
                            <span className="text-[10px] font-mono text-slate-400">{fmt.extension}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 leading-none">
                        <ShieldAlert size={14} className="text-slate-400" /> export security notice
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Your generated business spreadsheet package will compile local schemas and download directly. Ensure no unauthorized parties inspect or download spreadsheets from this browser session.
                      </p>
                    </div>

                    <button
                      onClick={handleExportData}
                      disabled={!!actionLoading}
                      className="w-full py-4 bg-slate-900 group hover:bg-slate-800 hover:tracking-wide text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-200 select-none active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'export-data' ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Compile & Download Export
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 3. ACCOUNT & SECURITY TAB */}
            {activeTab === 'security' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8"
              >
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Account & Session Management
                  </h2>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    Audit current hardware devices, invalidate stored keys, and completely sign out to protect customer logs from unauthorized inspection.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Option 1: Current */}
                  <div className="p-6 bg-slate-50 border border-slate-150 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-200/50 rounded-xl text-slate-600 w-11 h-11 flex items-center justify-center">
                        <LogOut size={20} />
                      </div>
                      <h3 className="font-bold text-slate-850 text-base leading-none">
                        Logout Current Hardware
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Clear local IndexedDB tables, browser localStorage, session caches, and safely invalidate the active Google session on this specific device.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLogoutConfirm('current')}
                      className="w-full text-xs py-3 rounded-xl border-2 border-slate-200 font-black tracking-wider uppercase text-slate-700 bg-white hover:bg-slate-100 transition-all cursor-pointer active:scale-95 text-center"
                    >
                      Sign Out Device
                    </button>
                  </div>

                  {/* Option 2: Everywhere */}
                  <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl w-11 h-11 flex items-center justify-center">
                        <ShieldCheck size={20} />
                      </div>
                      <h3 className="font-bold text-slate-850 text-base leading-none">
                        Global Purge Session Everywhere
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Wipe active session references across other phones or laptops in the Firestore registry, completely terminating session authorizations.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLogoutConfirm('all')}
                      className="w-full text-xs py-3 rounded-xl bg-slate-900 hover:bg-slate-800 font-black tracking-wider uppercase text-white shadow-md active:scale-95 transition-all text-center cursor-pointer"
                    >
                      Logout Everywhere
                    </button>
                  </div>
                </div>

                {/* Overlaid logout scope dialog */}
                <AnimatePresence>
                  {showLogoutConfirm && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
                    >
                      <motion.div
                        initial={{ scale: 0.96, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.96, opacity: 0 }}
                        className="bg-white w-full max-w-md rounded-3xl p-6 border border-slate-200 shadow-2xl space-y-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                            <AlertTriangle size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-base">Confirm Security Logout?</h3>
                            <p className="text-xs text-slate-400">Irreversible session invalidate action</p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                          {showLogoutConfirm === 'all' 
                            ? "This will wipe offline tables on this browser and immediately invalidate active sessions across ALL registered hardware devices. You will be forced back to the sign-in screen." 
                            : "This will wipe local storage, session storage, offline caching tables, and safely sign out from the active session on this device."}
                        </p>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowLogoutConfirm(null)}
                            disabled={!!actionLoading}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer select-none"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSignoutProcess(showLogoutConfirm)}
                            disabled={!!actionLoading}
                            className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer select-none"
                          >
                            {actionLoading ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              'Confirm Logout'
                            )}
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* 4. DATA DELETION TAB */}
            {activeTab === 'deletion' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white p-6 md:p-8 rounded-[2rem] border border-rose-200 shadow-sm space-y-6"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                    <ShieldAlert size={22} className="animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-rose-900">
                      Delete Business Data Workspace
                    </h2>
                    <p className="text-xs text-rose-600/80 font-bold">
                      Safeguarded self-service business data wipe control panel.
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-rose-50/50 rounded-2xl border border-rose-100 space-y-3 leading-relaxed">
                  <h4 className="font-bold text-rose-900 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> Strict Architectural Isolation Commitment
                  </h4>
                  <ul className="text-xs text-rose-800 space-y-1 ml-5 list-disc leading-normal font-medium">
                    <li>This deletion clears <strong>ONLY</strong> records matching your unique user profile UID.</li>
                    <li>Global database wipes are strictly forbidden; other registered vendors or business profiles remain fully unaffected.</li>
                    <li>You will be guided through a secure re-authentication workflow incorporating an automatic encrypted local backup step.</li>
                  </ul>
                </div>

                <div className="flex justify-between items-center bg-slate-50 rounded-2xl p-5 border border-slate-200">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-800 text-sm">Wipe Service Assistant</h4>
                    <p className="text-xs text-slate-400 font-medium">Step-by-step credentials verify, pre-deletion snap, and ledger clearance.</p>
                  </div>
                  <button
                    onClick={startBusinessDeletionFlow}
                    className="py-3 px-5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-100 select-none cursor-pointer active:scale-95 transition-all text-center"
                  >
                    Launch Deletion Flow
                  </button>
                </div>

                {/* Account deletion modal & Assistant flow */}
                <AnimatePresence>
                  {showDeletionConfirmModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 backdrop-blur-s overflow-y-auto"
                    >
                      <motion.div
                        initial={{ scale: 0.97, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.97, opacity: 0 }}
                        className="bg-white w-full max-w-xl rounded-3xl p-6 md:p-8 border border-slate-200 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
                      >
                        {/* Header steps slider */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div className="space-y-1">
                            <h3 className="font-bold text-slate-900 text-lg">Business Purge Assistant</h3>
                            <p className="text-xs text-slate-400 font-medium">Guided secure safety checks • Complete accountability</p>
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-black uppercase tracking-widest">
                            Step {deletionStep} of 6
                          </span>
                        </div>

                        {/* STEP 1: STATISTICS */}
                        {deletionStep === 1 && (
                          <div className="space-y-4">
                            <h4 className="text-slate-850 font-bold text-sm tracking-tight">Step 1: Inspect Your Active Target Ledger Data</h4>
                            <p className="text-xs text-slate-400">Review the records currently loaded under your account that will be wiped:</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Sales (Invoices)</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalSalesCount} bills</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Quotations</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalQuotesCount} quotes</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Products List</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalProductsCount} skus</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Unique Clients</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalCustomersCount} owners</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Payments Logs</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalPaymentsCount} bills</div>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">Total Ledgers</span>
                                <div className="text-base font-black text-slate-900 mt-1">{deletionStats.totalTransactionsCount} rows</div>
                              </div>
                            </div>

                            <button
                              onClick={() => setDeletionStep(2)}
                              className="w-full text-center py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                            >
                              Verify Stats & Proceed
                            </button>
                          </div>
                        )}

                        {/* STEP 2: CREATING AUTOMATED BACKUP */}
                        {deletionStep === 2 && (
                          <div className="space-y-4">
                            <h4 className="text-slate-850 font-bold text-sm tracking-tight">Step 2: Automated Safety Backup Collection</h4>
                            <p className="text-xs text-slate-500 leading-normal">
                              To prevent accidental data loss, the assistant will build a compressed offline restore snapshot of your current files and store it securely inside the local browser backups list prior to deletion.
                            </p>
                            
                            <div className="p-4 bg-indigo-50 text-indigo-900 rounded-xl border border-indigo-100 flex items-center gap-3">
                              <Database className="animate-pulse shrink-0" size={20} />
                              <div className="text-xs">
                                <strong className="font-bold">Automated Snapshot Scheduled</strong>
                                <p className="text-[11px] text-indigo-700 mt-0.5">Includes Sales, Quotations, Settings, Customers, and Products.</p>
                              </div>
                            </div>

                            <button
                              onClick={() => setDeletionStep(3)}
                              className="w-full text-center py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                            >
                              Acknowledge & Save Safety Backup
                            </button>
                          </div>
                        )}

                        {/* STEP 3: WARNING DISCLOSURE */}
                        {deletionStep === 3 && (
                          <div className="space-y-4">
                            <h4 className="text-slate-850 font-bold text-sm tracking-tight">Step 3: Critical System Warning Agreement</h4>
                            <p className="text-xs text-slate-500 leading-normal">
                              Reading of these legal constraints is mandatory before continuing to the security gate challenge:
                            </p>

                            <div className="p-4 bg-rose-50 border-2 border-rose-200 text-rose-950 rounded-xl space-y-2">
                              <h4 className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 leading-none">
                                <AlertTriangle size={14} className="text-rose-600" /> absolute termination terms
                              </h4>
                              <p className="text-[11px] text-slate-700 leading-normal">
                                Proceeding with executing client updates writes deep deletes across your profile workspace. Remote indexes will be erased. Cloud and offline synchronization databases will instantly show zero records. There represents no system revert service once committed.
                              </p>
                            </div>

                            <button
                              onClick={() => setDeletionStep(4)}
                              className="w-full text-center py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                            >
                              I fully accept and understand the warning
                            </button>
                          </div>
                        )}

                        {/* STEP 4: PASSCODE CHALLENGE */}
                        {deletionStep === 4 && (
                          <div className="space-y-4">
                            <h4 className="text-slate-850 font-bold text-sm tracking-tight">Step 4: Type Verification Passphrase</h4>
                            <p className="text-xs text-slate-500 leading-normal">
                              Please verify your deliberate intent by typing the specific validation challenge string below:
                            </p>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Type: <span className="font-mono text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded select-all">DELETE MY BUSINESS DATA</span></label>
                              <input
                                type="text"
                                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 font-mono text-sm uppercase font-bold text-slate-800 focus:outline-none focus:border-rose-500 transition-all placeholder:font-sans placeholder:font-normal"
                                placeholder="DELETE MY BUSINESS DATA"
                                value={deletionChallenge}
                                onChange={(e) => setDeletionChallenge(e.target.value)}
                              />
                            </div>

                            <button
                              disabled={deletionChallenge.trim() !== 'DELETE MY BUSINESS DATA'}
                              onClick={() => setDeletionStep(5)}
                              className="w-full text-center py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Confirm String & Go to Auths
                            </button>
                          </div>
                        )}

                        {/* STEP 5: VERIFICATION CHALLENGE */}
                        {deletionStep === 5 && (
                          <div className="space-y-4">
                            <h4 className="text-slate-850 font-bold text-sm tracking-tight text-slate-900">Step 5: Account Security Gate Challenge</h4>
                            <p className="text-xs text-slate-500 leading-normal">
                              Confirm ownership credentials to execute the final secure deletion of database collections. Since your account uses Google Login integration, please type your registered email <strong className="font-bold underline">{userEmail}</strong> within the box below:
                            </p>

                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">challenge authorization email</label>
                                <input
                                  type="email"
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-rose-500 font-medium"
                                  placeholder={userEmail}
                                  value={deletionAuthEmail}
                                  onChange={(e) => setDeletionAuthEmail(e.target.value)}
                                />
                              </div>
                            </div>

                            <button
                              disabled={deletionAuthEmail.trim().toLowerCase() !== userEmail.trim().toLowerCase()}
                              onClick={executeDataDeletionChallenge}
                              className="w-full text-center py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              <Lock size={14} /> AUTHORIZE ABSOLUTE PURGE
                            </button>
                          </div>
                        )}

                        {/* STEP 6: PROGRESS BAR & REPORT */}
                        {deletionStep === 6 && (
                          <div className="space-y-6 py-4">
                            {!deletionReport ? (
                              <div className="space-y-4 text-center">
                                <Loader2 className="w-12 h-12 text-rose-500 animate-spin mx-auto" />
                                <div className="space-y-1">
                                  <h4 className="font-bold text-slate-900 text-base">Purging Database Collections...</h4>
                                  <p className="text-xs text-slate-400 font-semibold leading-none">Executing secure query-based client delete transaction</p>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                  <div 
                                    className="bg-rose-500 h-full transition-all duration-300 rounded-full" 
                                    style={{ width: `${deletionProgress}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs text-slate-500 block font-bold leading-none">{deletionProgress}% completed</span>
                              </div>
                            ) : deletionReport.status === 'success' ? (
                              <div className="space-y-5 text-center">
                                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto border-2 border-emerald-100 shadow-sm shadow-emerald-50">
                                  <CheckCircle2 size={32} />
                                </div>
                                <div className="space-y-1">
                                  <h4 className="font-bold text-slate-900 text-lg">Wipe Operation Execution Completed</h4>
                                  <p className="text-xs text-slate-400 font-medium">Your business profiles and ledger entries have been successfully discarded.</p>
                                </div>

                                <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl max-w-md mx-auto text-left space-y-2">
                                  <h5 className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Final Purge Summary Audit</h5>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                    <span>Records permanently cleared:</span>
                                    <span className="font-bold text-slate-905 text-right">{deletionReport.recordsCleared} documents</span>
                                    
                                    <span>Safety local backup package:</span>
                                    <span className="font-bold text-slate-905 text-right">{deletionReport.backupSaved ? 'SAVED (local backups)' : 'SKIPPED'}</span>
                                  </div>
                                </div>

                                <button
                                  onClick={async () => {
                                    setShowDeletionConfirmModal(false);
                                    await auth.signOut();
                                    onLogout();
                                  }}
                                  className="py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                                >
                                  Close Assistant & logout
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-4 text-center">
                                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto border border-rose-105">
                                  <AlertCircle size={32} />
                                </div>
                                <div className="space-y-1">
                                  <h4 className="font-bold text-rose-900 text-lg">Transaction Rollback Triggered</h4>
                                  <p className="text-xs text-slate-400 font-medium">The wipe operation failed to delete certain assets securely, resulting in an automatic rollback to safeguard data integrity.</p>
                                </div>
                                <button
                                  onClick={() => setDeletionStep(1)}
                                  className="py-3 px-6 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                                >
                                  Restart Assistant
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating feedback toast */}
      <AnimatePresence>
        {(successMessage || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full"
          >
            {successMessage && (
              <div className="bg-emerald-900 text-white p-4 rounded-2xl border border-emerald-800 shadow-2xl flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">{successMessage}</p>
              </div>
            )}
            {errorMessage && (
              <div className="bg-rose-950 text-white p-4 rounded-2xl border border-rose-900 shadow-2xl flex items-center gap-3">
                <AlertCircle size={18} className="text-rose-400 shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">{errorMessage}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
