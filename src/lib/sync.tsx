import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAccessToken, getUserInfo, uploadToDrive, listBackups, downloadFromDrive } from './drive';
import { exportDatabase, importDatabase } from './backup';

interface SyncContextType {
  user: any | null;
  accessToken: string | null;
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  syncNow: (userId: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncFileId, setSyncFileId] = useState<string | null>(null);

  // Load sync state from localStorage
  useEffect(() => {
    const savedSync = localStorage.getItem('quin_sync_state');
    if (savedSync) {
      const { lastSync: savedLastSync } = JSON.parse(savedSync);
      if (savedLastSync) setLastSync(new Date(savedLastSync));
    }
  }, []);

  const syncNow = useCallback(async (userId: string) => {
    if (!accessToken) return;
    setIsSyncing(true);
    setError(null);
    try {
      const data = await exportDatabase(userId);
      const filename = `quin_sync_data_${userId}.json`;
      
      // Try to find existing sync file if we don't have the ID
      let currentFileId = syncFileId;
      if (!currentFileId) {
        const files = await listBackups(accessToken);
        const syncFile = files.find((f: any) => f.name === filename);
        if (syncFile) {
          currentFileId = syncFile.id;
          setSyncFileId(currentFileId);
        }
      }

      await uploadToDrive(accessToken, filename, data, currentFileId || undefined);
      const now = new Date();
      setLastSync(now);
      localStorage.setItem('quin_sync_state', JSON.stringify({ lastSync: now.toISOString() }));
    } catch (err: any) {
      console.error('Sync error:', err);
      setError('Failed to sync with Google Drive');
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, syncFileId]);

  const signIn = async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      setAccessToken(token);
      const userInfo = await getUserInfo(token);
      setUser(userInfo);
      
      const files = await listBackups(token);
      // We don't know userId here, so we can't fetch the exact file ID yet.
      // We'll fetch it during syncNow.
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const signOut = () => {
    setUser(null);
    setAccessToken(null);
    setSyncFileId(null);
    setLastSync(null);
    localStorage.removeItem('quin_sync_state');
  };

  // Auto-sync on changes (debounced) - in a real app, you'd hook into Dexie's middleware
  // For this demo, we'll just provide the syncNow function to components

  return (
    <SyncContext.Provider value={{ user, accessToken, isSyncing, lastSync, error, signIn, signOut, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
