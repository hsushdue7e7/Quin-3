import React, { useState, useEffect, useRef } from 'react';
import { Database, Download, Upload, Trash2, RefreshCw, FileText, CheckCircle2, AlertTriangle, History, Shield, Save, FileUp, HardDrive } from 'lucide-react';
import { db, type BackupRecord } from '../db';
import { createBackup, restoreFromBackup, downloadBackupFile, importFromFile } from '../lib/backup';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface BackupRestoreProps {
  userId: string;
  onRestoreComplete?: () => void;
}

export function BackupRestore({ userId, onRestoreComplete }: BackupRestoreProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmRestore, setShowConfirmRestore] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBackups();
  }, [userId]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const allBackups = await db.backups
        .where('userId')
        .equals(userId)
        .reverse()
        .sortBy('date');
      setBackups(allBackups);
    } catch (err) {
      console.error('Failed to load backups', err);
      setError('Could not load backup history');
    } finally {
      setLoading(false);
    }
  };

  const handleManualBackup = async () => {
    setActionLoading('backup');
    setError(null);
    try {
      await createBackup(userId, 'manual');
      setSuccess('Backup created successfully');
      await loadBackups();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Manual backup failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (id: number) => {
    setActionLoading(`restore-${id}`);
    setError(null);
    try {
      await restoreFromBackup(id, userId);
      setSuccess('Database restored successfully');
      setShowConfirmRestore(null);
      if (onRestoreComplete) onRestoreComplete();
      // Reload page to ensure all components see the new data
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError('Restore failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteBackup = async (id: number) => {
    try {
      await db.backups.delete(id);
      await loadBackups();
    } catch (err) {
      setError('Failed to delete backup');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionLoading('import');
    setError(null);
    try {
      await importFromFile(file, userId);
      setSuccess('Backup imported and stored locally');
      await loadBackups();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError('Import failed: ' + (err instanceof Error ? err.message : 'Invalid backup file'));
    } finally {
      setActionLoading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              <Shield className="text-indigo-600" />
              Backup & Recovery
            </h2>
            <p className="text-slate-500 font-medium mt-1">Safeguard your business data with local and manual backups</p>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!!actionLoading}
              className="flex-1 md:flex-none py-3 px-6 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
            >
              <FileUp size={20} className="text-indigo-600" />
              Import File
            </button>
            <button
              onClick={handleManualBackup}
              disabled={!!actionLoading}
              className="flex-1 md:flex-none py-3 px-6 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95 disabled:opacity-50"
            >
              {actionLoading === 'backup' ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : (
                <Save size={20} />
              )}
              Create Backup
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".zlib,.json" 
              onChange={handleFileSelect}
            />
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center gap-3"
            >
              <AlertTriangle size={20} />
              <p className="text-sm font-bold">{error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl flex items-center gap-3"
            >
              <CheckCircle2 size={20} />
              <p className="text-sm font-bold">{success}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Backup History</h3>
            <span className="text-[10px] bg-slate-100 text-slate-500 py-1 px-2 rounded-full font-bold">
              Retention: Last {backups.length} / 30
            </span>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading history...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-bold">No backups found</p>
              <p className="text-slate-400 text-sm mt-1">Your first auto-backup will appear here soon</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {backups.map((backup) => (
                <div 
                  key={backup.id}
                  className={cn(
                    "group relative bg-slate-50 border border-slate-100 rounded-3xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-indigo-100 hover:bg-indigo-50/30",
                    backup.type === 'auto' ? "border-l-4 border-l-indigo-400" : "border-l-4 border-l-emerald-400"
                  )}
                >
                  <div className="flex items-center gap-5">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner shrink-0",
                      backup.type === 'auto' ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
                    )}>
                      {backup.type === 'auto' ? <RefreshCw size={24} /> : <Save size={24} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900">{format(backup.date, 'dd MMM yyyy, hh:mm a')}</h4>
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                          backup.type === 'auto' ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {backup.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <HardDrive size={12} className="text-slate-400" />
                          {formatSize(backup.size)}
                        </span>
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <FileText size={12} className="text-slate-400" />
                          {backup.recordCount} records
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => downloadBackupFile(backup)}
                      className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:text-indigo-600 hover:border-indigo-200 transition-all"
                      title="Download to device"
                    >
                      <Download size={18} />
                    </button>
                    <button
                      onClick={() => setShowConfirmRestore(backup.id!)}
                      className="flex-1 md:flex-none py-2.5 px-5 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(backup.id!)}
                      className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <AnimatePresence>
                    {showConfirmRestore === backup.id && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute inset-0 bg-slate-900 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 z-10"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center">
                            <AlertTriangle size={20} />
                          </div>
                          <div>
                            <p className="text-white text-sm font-bold">Overwrite all data?</p>
                            <p className="text-slate-400 text-xs">This will replace your current local data with this backup.</p>
                          </div>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          <button 
                            onClick={() => setShowConfirmRestore(null)}
                            className="flex-1 md:flex-none py-2 px-4 bg-slate-800 text-slate-400 rounded-lg text-sm font-bold hover:text-white"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => handleRestore(backup.id!)}
                            disabled={!!actionLoading}
                            className="flex-1 md:flex-none py-2 px-6 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-50"
                          >
                            {actionLoading === `restore-${backup.id}` ? 'Restoring...' : 'Confirm Restore'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
        <div className="relative z-10">
          <h3 className="text-xl font-bold flex items-center gap-3 mb-2">
            <Shield className="text-indigo-300" />
            Security Notice
          </h3>
          <p className="text-indigo-100 text-sm leading-relaxed max-w-2xl">
            Backups are stored locally in your browser's private database. We recommend periodically downloading a manual backup and storing it on a different device or cloud drive (Google Drive, WhatsApp) to ensure your data is safe even if this device is lost or cleared.
          </p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Database size={120} />
        </div>
      </div>
    </div>
  );
}
