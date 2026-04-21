import { useState, useRef } from 'react';
import { 
  Upload, FileJson, FileText, Database, AlertCircle, CheckCircle2, 
  Loader2, ArrowRight, Download, History, ShieldCheck, Info,
  ChevronRight, Trash2, Users, Package, FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { detectAndParseFile, backupData, detectDuplicates, type ImportData } from '../lib/importUtils';
import { saveInventoryProduct, saveInvoicesBatch, savePaymentsBatch } from '../lib/firestore';
import { cn } from '../lib/utils';
import { type Product, type Invoice, type Payment } from '../db';

interface DataImportProps {
  ownerId: string;
  onComplete: () => void;
}

export function DataImport({ ownerId, onComplete }: DataImportProps) {
  const [step, setStep] = useState<'select' | 'preview' | 'importing' | 'success'>('select');
  const [file, setFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    products: 0,
    customers: 0,
    transactions: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setError(null);

    try {
      const data = await detectAndParseFile(selectedFile);
      const filtered = await detectDuplicates(ownerId, data);
      setImportData(filtered);
      setDuplicatesCount(filtered.duplicatesCount);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to parse file. Please ensure it is a valid backup.');
    } finally {
      setIsParsing(false);
    }
  };

  const startImport = async () => {
    if (!importData) return;

    setIsImporting(true);
    setStep('importing');
    setProgress(0);

    try {
      // 1. Auto-create backup of current data
      console.log('Creating pre-import backup...');
      await backupData(ownerId);
      
      const totalSteps = 
        importData.products.length + 
        importData.transactions.length + 
        importData.payments.length;
      
      let completedSteps = 0;

      // 2. Import Products
      for (const product of importData.products) {
        await saveInventoryProduct({
          ...product,
          userId: ownerId,
          sku: product.sku || `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          trackInventory: true,
          minStock: 0
        } as Product);
        completedSteps++;
        setProgress(Math.round((completedSteps / totalSteps) * 100));
      }

      // 3. Import Transactions (Invoices)
      if (importData.transactions.length > 0) {
        const invoicesToSave = importData.transactions.map(t => ({
          ...t,
          userId: ownerId,
          items: t.items || [],
          subtotal: t.subtotal || t.total || 0,
          totalGst: t.totalGst || 0,
          tax: 0,
          taxPercentage: 0,
          total: t.total || 0,
          receivedAmount: t.receivedAmount || t.total || 0,
          creditAmount: t.creditAmount || 0,
          date: t.date || Date.now(),
          invoiceNumber: t.invoiceNumber || `INV-IMP-${Date.now()}`
        } as Invoice));
        
        // Batch save for efficiency
        await saveInvoicesBatch(ownerId, invoicesToSave);
        completedSteps += importData.transactions.length;
        setProgress(Math.round((completedSteps / totalSteps) * 100));
      }

      // 4. Import Payments
      if (importData.payments.length > 0) {
        const paymentsToSave = importData.payments.map(p => ({
          ...p,
          userId: ownerId,
          amount: p.amount || 0,
          date: p.date || Date.now(),
          method: p.method || 'cash'
        } as Payment));
        
        await savePaymentsBatch(ownerId, paymentsToSave);
        completedSteps += importData.payments.length;
        setProgress(Math.round((completedSteps / totalSteps) * 100));
      }

      setStats({
        products: importData.products.length,
        customers: importData.customers.length,
        transactions: importData.transactions.length
      });
      setStep('success');
    } catch (err: any) {
      setError('Import failed. Some data might not have been saved.');
      setStep('preview');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <AnimatePresence mode="wait">
        {step === 'select' && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-indigo-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <Upload size={40} className="text-indigo-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Migrate Your Data</h2>
              <p className="text-slate-500 max-w-md mx-auto">
                Easily import your products, customers, and bills from other apps like Vyapar or MyBillBook.
              </p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-emerald-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
              <div className="relative bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] p-12 text-center hover:border-indigo-400 transition-all">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden" 
                  accept=".json,.csv,.zip,.vyapar,.mbk,.db,.sqlite"
                />
                {isParsing ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 size={48} className="text-indigo-600 animate-spin" />
                    <p className="font-bold text-slate-900">Reading your backup file...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-center gap-4 mb-6">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <FileJson size={32} className="text-amber-500" />
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <FileSpreadsheet size={32} className="text-emerald-500" />
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <Database size={32} className="text-indigo-500" />
                      </div>
                    </div>
                    <p className="text-lg font-bold text-slate-900">Click to select backup file</p>
                    <p className="text-sm text-slate-400">Supports Vyapar, MyBillBook, JSON, CSV, and SQLite</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-600">
                <AlertCircle size={20} />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-3">
                <ShieldCheck className="text-emerald-600" size={24} />
                <h4 className="font-bold text-slate-900">100% Secure</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Your data is processed locally in your browser. We never store your backup files.</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-3">
                <History className="text-indigo-600" size={24} />
                <h4 className="font-bold text-slate-900">Auto-Backup</h4>
                <p className="text-xs text-slate-500 leading-relaxed">We automatically create a backup of your current data before starting the import.</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-3">
                <CheckCircle2 className="text-amber-600" size={24} />
                <h4 className="font-bold text-slate-900">Smart Mapping</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Our system automatically detects and maps fields from other apps to Quin.</p>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'preview' && importData && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Review Data</h2>
                <p className="text-slate-500 text-sm">We found the following records in your file.</p>
              </div>
              <button 
                onClick={() => setStep('select')}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                Change File
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                  <Package className="text-indigo-600" size={24} />
                </div>
                <div>
                  <p className="text-3xl font-black text-slate-900">{importData.products.length}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Products</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                  <Users className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-3xl font-black text-slate-900">{importData.customers.length}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Customers</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                  <FileText className="text-amber-600" size={24} />
                </div>
                <div>
                  <p className="text-3xl font-black text-slate-900">{importData.transactions.length}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transactions</p>
                </div>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-[2rem] flex items-start gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm">
                <ShieldCheck className="text-indigo-600" size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-indigo-900">Ready to Import</h4>
                <p className="text-sm text-indigo-700/70 leading-relaxed">
                  Clicking "Start Import" will merge this data into your current Quin account. 
                  {duplicatesCount > 0 && ` We found ${duplicatesCount} duplicate records which will be skipped automatically.`}
                </p>
              </div>
            </div>

            <button
              onClick={startImport}
              disabled={isImporting}
              className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Start Import
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </motion.div>
        )}

        {step === 'importing' && (
          <motion.div
            key="importing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center space-y-12 py-12"
          >
            <div className="relative w-48 h-48 mx-auto">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                  className="text-slate-100 stroke-current"
                  strokeWidth="8"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
                <circle
                  className="text-indigo-600 stroke-current transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * progress) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                  r="40"
                  cx="50"
                  cy="50"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-slate-900">{progress}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-slate-900">Importing Your Data</h2>
              <p className="text-slate-500">Please don't close this window. We're setting up your business.</p>
            </div>

            <div className="flex justify-center gap-2">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                  className="w-2 h-2 bg-indigo-600 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8 py-8"
          >
            <div className="w-24 h-24 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={48} className="text-emerald-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Import Successful!</h2>
              <p className="text-slate-500">Your data has been successfully migrated to Quin.</p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xl font-black text-slate-900">{stats.products}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Products</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xl font-black text-slate-900">{stats.customers}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customers</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xl font-black text-slate-900">{stats.transactions}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bills</p>
              </div>
            </div>

            <button
              onClick={onComplete}
              className="px-12 py-4 bg-slate-900 text-white rounded-[2rem] font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
            >
              Go to Dashboard
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
