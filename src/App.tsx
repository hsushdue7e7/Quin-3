import { useState, useEffect, Suspense, lazy } from 'react';
import { LayoutDashboard, Package, Receipt, BarChart3, User, LogOut, Settings, Menu, X, History, Cloud, Bot, AlertTriangle, Bell, Check, Users } from 'lucide-react';

// Lazy load components
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./components/Inventory').then(m => ({ default: m.Inventory })));
const Billing = lazy(() => import('./components/Billing').then(m => ({ default: m.Billing })));
const Transactions = lazy(() => import('./components/Transactions').then(m => ({ default: m.Transactions })));
const Customers = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));
const Reports = lazy(() => import('./components/Reports').then(m => ({ default: m.Reports })));
const Login = lazy(() => import('./components/Login').then(m => ({ default: m.Login })));
const Profile = lazy(() => import('./components/Profile').then(m => ({ default: m.Profile })));
const B2BNetwork = lazy(() => import('./components/B2BNetwork'));
const BusinessAssistant = lazy(() => import('./components/BusinessAssistant').then(m => ({ default: m.BusinessAssistant })));
const AddExpenseModal = lazy(() => import('./components/AddExpenseModal').then(m => ({ default: m.AddExpenseModal })));

import { SyncProvider } from './lib/sync';
import { db } from './db';
import { UserRole } from './db';
import { auth, db as fdb } from './lib/firebase';
import { collection, query, where, getDocs, doc, getDocFromServer } from 'firebase/firestore';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getUser, saveUser, findStaffByEmail } from './lib/firestore';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { subscribeToNotifications, markAsRead, markAllAsRead } from './services/NotificationService';
import { type Notification } from './db';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = 'Something went wrong. Please try again later.';
      let details = '';

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = `Firestore Error: ${parsed.error}`;
            details = `Operation: ${parsed.operationType}, Path: ${parsed.path}`;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops!</h2>
            <p className="text-gray-600 mb-4">{errorMessage}</p>
            {details && <p className="text-xs text-gray-400 mb-6 font-mono">{details}</p>}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

type Tab = 'dashboard' | 'inventory' | 'transactions' | 'customers' | 'reports' | 'profile' | 'settings' | 'sales' | 'b2b';

export default function App() {
  return (
    <ErrorBoundary>
      <SyncProvider>
        <AppContent />
      </SyncProvider>
    </ErrorBoundary>
  );
}

import { checkAndRunAutoBackup } from './lib/backup';

function AppContent() {
  const [appMode, setAppMode] = useState<'quin' | 'b2b'>('quin');
  const [showPaymentModalFromDashboard, setShowPaymentModalFromDashboard] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | undefined>();
  const [initialBillingItems, setInitialBillingItems] = useState<any[] | undefined>();
  const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isInactive, setIsInactive] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Auto-backup effect
  useEffect(() => {
    if (ownerId && !isInactive) {
      checkAndRunAutoBackup(ownerId);
    }
  }, [ownerId, isInactive]);

  useEffect(() => {
    console.log('App initialization effect running');
    
    // Safety timeout: transition out of loading state even if initialization hangs
    const safetyTimeout = setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) {
          console.warn('Initialization taking too long, forcing clear loading state');
          return false;
        }
        return prev;
      });
    }, 10000);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let unsubscribeNotifications: (() => void) | undefined;

    const testConnectionEffect = async () => {
      if (!auth.currentUser) return;
      try {
        await getDocFromServer(doc(fdb, 'test', 'connection'));
        if (navigator.onLine) setIsOffline(false);
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
          setIsOffline(true);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? `User: ${firebaseUser.uid}` : 'No User');
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsLoading(true);
        try {
          // Fetch user profile from Firestore
          let userProfile = await getUser(firebaseUser.uid);
          
          if (!userProfile) {
            // Check if user is a staff member
            const staffMember = await findStaffByEmail(firebaseUser.email || '');
            if (staffMember) {
              const isActive = staffMember.status === 'active';
              setIsInactive(!isActive);

              userProfile = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                mobile: '',
                username: firebaseUser.email?.split('@')[0] || '',
                role: staffMember.role as UserRole,
                ownerId: staffMember.userId, // The owner's UID
                createdAt: Date.now(),
                updatedAt: Date.now()
              };
              await saveUser(firebaseUser.uid, userProfile);
            } else {
              // New admin user
              userProfile = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '',
                mobile: '',
                username: firebaseUser.email?.split('@')[0] || '',
                role: 'admin',
                ownerId: firebaseUser.uid,
                createdAt: Date.now(),
                updatedAt: Date.now()
              };
              await saveUser(firebaseUser.uid, userProfile);
              setIsInactive(false);
            }
          } else {
            // Update role if they are staff and check status
            if (userProfile.role !== 'admin') {
              const staffMember = await findStaffByEmail(firebaseUser.email || '');
              if (staffMember) {
                const isActive = staffMember.status === 'active';
                setIsInactive(!isActive);
                if (userProfile.role !== (staffMember.role as UserRole)) {
                  userProfile.role = staffMember.role as UserRole;
                  await saveUser(firebaseUser.uid, userProfile);
                }
              }
            } else {
              setIsInactive(false);
            }
          }
          
          setRole(userProfile.role);
          setOwnerId(userProfile.ownerId || firebaseUser.uid);
          await testConnectionEffect();
          
          // Subscribe to notifications
          unsubscribeNotifications = subscribeToNotifications(firebaseUser.uid, (newNotifications) => {
            setNotifications(newNotifications);
          });

        } catch (error) {
          console.error("Error during auth initialization:", error);
          setOwnerId(null);
          setRole(null);
        } finally {
          setIsLoading(false);
          clearTimeout(safetyTimeout);
        }
      } else {
        if (unsubscribeNotifications) {
          unsubscribeNotifications();
          unsubscribeNotifications = undefined;
        }
        setOwnerId(null);
        setRole(null);
        setIsLoading(false);
        clearTimeout(safetyTimeout);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(safetyTimeout);
      unsubscribe();
      if (unsubscribeNotifications) unsubscribeNotifications();
    };
  }, []);

  const handleSaleCreateFromAssistant = async (items: any[]) => {
    console.log('Creating sale from assistant items:', items);
    const billingItems = [];
    const notFoundItems = [];

    try {
      // Fetch all products once for faster matching
      const allProdsQ = query(collection(fdb, 'products'), where('userId', '==', ownerId));
      const allProdsSnapshot = await getDocs(allProdsQ);
      const allProducts = allProdsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

      for (const item of items) {
        const itemNameLower = item.name.toLowerCase().trim();
        
        // Try to find matching product
        const matchedProduct = allProducts.find(p => 
          p.name.toLowerCase().trim() === itemNameLower ||
          p.sku?.toLowerCase().trim() === itemNameLower
        );
        
        if (matchedProduct) {
          billingItems.push({
            productId: matchedProduct.id,
            name: matchedProduct.name,
            quantity: Number(item.quantity) || 1,
            costPrice: matchedProduct.costPrice || 0,
            price: Number(item.price) || matchedProduct.price || 0,
            total: (Number(item.price) || matchedProduct.price || 0) * (Number(item.quantity) || 1)
          });
        } else {
          notFoundItems.push(item.name);
          console.warn(`Product not found: ${item.name}`);
        }
      }

      if (billingItems.length > 0) {
        console.log('Setting initial billing items:', billingItems);
        setInitialBillingItems(billingItems);
        setEditingInvoiceId(undefined);
        setActiveTab('sales');
        setIsAssistantOpen(false);
        
        if (notFoundItems.length > 0) {
          alert(`Kuch products nahi mile: ${notFoundItems.join(', ')}. Baaki items bill mein add kar diye gaye hain.`);
        }
      } else {
        alert("Maaf kijiye, ye products inventory mein nahi mile. Pehle products add karein ya sahi naam batayein.");
      }
    } catch (error) {
      console.error('Error creating sale from assistant:', error);
      alert("Bill create karne mein error aaya. Please try again.");
    }
  };

  useEffect(() => {
    const seedPaints = async () => {
      if (!user) return;
      const isSeeded = localStorage.getItem(`paints_seeded_${user.uid}`);
      if (isSeeded) return;

      const enamelColors = ['White', 'Black', 'Golden Brown', 'Smoke Grey', 'Phirozi', 'Signal Red', 'Bus Green', 'Deep Orange'];
      
      const asianPaints = [
        { name: 'Asian Paints Tractor Emulsion (1L)', sku: 'AP-TE-1L', costPrice: 150, price: 180, stock: 50, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 10, updatedAt: Date.now() },
        { name: 'Asian Paints Tractor Emulsion (4L)', sku: 'AP-TE-4L', costPrice: 580, price: 680, stock: 20, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 5, updatedAt: Date.now() },
        { name: 'Asian Paints Tractor Emulsion (10L)', sku: 'AP-TE-10L', costPrice: 1400, price: 1650, stock: 10, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 2, updatedAt: Date.now() },
        { name: 'Asian Paints Apcolite Premium (1L)', sku: 'AP-AP-1L', costPrice: 220, price: 260, stock: 40, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 10, updatedAt: Date.now() },
        { name: 'Asian Paints Royale Luxury (1L)', sku: 'AP-RL-1L', costPrice: 450, price: 520, stock: 30, primaryUnit: 'Litre', category: 'Premium Interior', minStock: 5, updatedAt: Date.now() },
        { name: 'Asian Paints Royale Luxury (4L)', sku: 'AP-RL-4L', costPrice: 1750, price: 2050, stock: 15, primaryUnit: 'Litre', category: 'Premium Interior', minStock: 3, updatedAt: Date.now() },
        { name: 'Asian Paints Royale Matt (1L)', sku: 'AP-RM-1L', costPrice: 480, price: 550, stock: 25, primaryUnit: 'Litre', category: 'Premium Interior', minStock: 5, updatedAt: Date.now() },
        { name: 'Asian Paints Ace Exterior (1L)', sku: 'AP-AE-1L', costPrice: 180, price: 210, stock: 60, primaryUnit: 'Litre', category: 'Exterior Paint', minStock: 15, updatedAt: Date.now() },
        { name: 'Asian Paints Ace Exterior (4L)', sku: 'AP-AE-4L', costPrice: 680, price: 800, stock: 20, primaryUnit: 'Litre', category: 'Exterior Paint', minStock: 5, updatedAt: Date.now() },
        { name: 'Asian Paints Apex Ultima (1L)', sku: 'AP-AU-1L', costPrice: 380, price: 440, stock: 25, primaryUnit: 'Litre', category: 'Premium Exterior', minStock: 5, updatedAt: Date.now() },
        { name: 'Asian Paints TruCare Primer (1L)', sku: 'AP-TP-1L', costPrice: 110, price: 140, stock: 100, primaryUnit: 'Litre', category: 'Primer', minStock: 20, updatedAt: Date.now() },
        { name: 'Asian Paints TruCare Primer (4L)', sku: 'AP-TP-4L', costPrice: 420, price: 520, stock: 40, primaryUnit: 'Litre', category: 'Primer', minStock: 10, updatedAt: Date.now() },
        ...enamelColors.map(color => ({
          name: `Asian Paints Apcolite Enamel ${color} (1L)`,
          sku: `AP-EN-1L-${color.replace(/\s+/g, '-').toUpperCase()}`,
          costPrice: 280,
          price: 330,
          stock: 10,
          primaryUnit: 'Litre',
          category: 'Enamel',
          minStock: 2,
          updatedAt: Date.now()
        })),
      ];
      const nerolacPaints = [
        { name: 'Nerolac Impressions (1L)', sku: 'NL-IM-1L', costPrice: 420, price: 490, stock: 35, primaryUnit: 'Litre', category: 'Premium Interior', minStock: 5, updatedAt: Date.now() },
        { name: 'Nerolac Impressions (4L)', sku: 'NL-IM-4L', costPrice: 1650, price: 1920, stock: 12, primaryUnit: 'Litre', category: 'Premium Interior', minStock: 3, updatedAt: Date.now() },
        { name: 'Nerolac Pearls (1L)', sku: 'NL-PE-1L', costPrice: 210, price: 250, stock: 45, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 10, updatedAt: Date.now() },
        { name: 'Nerolac Beauty Gold (1L)', sku: 'NL-BG-1L', costPrice: 160, price: 195, stock: 55, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 10, updatedAt: Date.now() },
        { name: 'Nerolac Beauty Gold (4L)', sku: 'NL-BG-4L', costPrice: 620, price: 750, stock: 20, primaryUnit: 'Litre', category: 'Interior Paint', minStock: 5, updatedAt: Date.now() },
        { name: 'Nerolac Excel (1L)', sku: 'NL-EX-1L', costPrice: 360, price: 420, stock: 20, primaryUnit: 'Litre', category: 'Premium Exterior', minStock: 5, updatedAt: Date.now() },
        { name: 'Nerolac Excel (4L)', sku: 'NL-EX-4L', costPrice: 1400, price: 1650, stock: 10, primaryUnit: 'Litre', category: 'Premium Exterior', minStock: 2, updatedAt: Date.now() },
        { name: 'Nerolac Suraksha (1L)', sku: 'NL-SU-1L', costPrice: 170, price: 200, stock: 65, primaryUnit: 'Litre', category: 'Exterior Paint', minStock: 15, updatedAt: Date.now() },
        { name: 'Nerolac Suraksha (4L)', sku: 'NL-SU-4L', costPrice: 650, price: 780, stock: 25, primaryUnit: 'Litre', category: 'Exterior Paint', minStock: 5, updatedAt: Date.now() },
        { name: 'Nerolac Cement Primer (1L)', sku: 'NL-CP-1L', costPrice: 105, price: 135, stock: 90, primaryUnit: 'Litre', category: 'Primer', minStock: 20, updatedAt: Date.now() },
        { name: 'Nerolac Cement Primer (4L)', sku: 'NL-CP-4L', costPrice: 400, price: 500, stock: 35, primaryUnit: 'Litre', category: 'Primer', minStock: 10, updatedAt: Date.now() },
        ...enamelColors.map(color => ({
          name: `Nerolac Synthetic Enamel ${color} (1L)`,
          sku: `NL-EN-1L-${color.replace(/\s+/g, '-').toUpperCase()}`,
          costPrice: 270,
          price: 320,
          stock: 10,
          primaryUnit: 'Litre',
          category: 'Enamel',
          minStock: 2,
          updatedAt: Date.now()
        })),
      ];

      const allProducts = [...asianPaints, ...nerolacPaints].map(p => ({ ...p, userId: ownerId || user.uid }));
      
      for (const product of allProducts) {
        const exists = await db.products.where('sku').equals(product.sku).and(p => p.userId === (ownerId || user.uid)).first();
        if (!exists) {
          await db.products.add(product as any);
        }
      }
      
      localStorage.setItem(`paints_seeded_${ownerId || user.uid}`, 'true');
    };
    if (user) seedPaints();
  }, [user]);

  const handleLogout = () => {
    auth.signOut();
  };

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', name: 'Inventory', icon: Package, roles: ['admin', 'inventory_manager'] },
    { id: 'transactions', name: 'Transactions', icon: History, roles: ['admin', 'sales_manager', 'ca'] },
    { id: 'customers', name: 'Customers', icon: Users, roles: ['admin', 'sales_manager'] },
    { id: 'profile', name: 'Me (Profile)', icon: User },
  ].filter(item => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium animate-pulse">Initializing Quin Billing...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (isInactive) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center border border-slate-200">
          <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <X size={48} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Access Suspended</h2>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            Your staff account is currently <span className="text-rose-600 font-bold">Inactive</span>. Please contact the administrator to reactive your access.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (isOffline && role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">No Internet Connection</h2>
          <p className="text-slate-500 mb-8">
            As a staff member, you need an active internet connection to use the application and sync data in real-time. Please check your network and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            <Cloud size={20} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const handleEditInvoice = (id: string, isQuotation?: boolean) => {
    setEditingInvoiceId(id);
    setIsCreatingQuotation(!!isQuotation);
    setActiveTab('sales');
  };

  const handleNewSale = (direct: boolean | 'quotation' = false) => {
    setEditingInvoiceId(undefined);
    setActiveTab('sales');
    setIsCreatingQuotation(direct === 'quotation');
    if (direct === true) {
      localStorage.setItem('quin_direct_sell', 'true');
    } else {
      localStorage.removeItem('quin_direct_sell');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 no-print">
      <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 md:px-8 py-3 md:py-4 flex justify-between items-center z-40">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-900 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Package size={24} className="text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-base md:text-lg tracking-tight">Quin</h1>
            <p className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Inventory & Billing</p>
          </div>
        </div>

        {isOffline && (
          <div className="flex-1 mx-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2 text-amber-700 text-xs font-medium animate-pulse">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="hidden sm:inline">You are offline. Changes will be saved locally and synced when you reconnect.</span>
            <span className="sm:hidden">Offline Mode</span>
          </div>
        )}

        {ownerId === user.uid && (
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setAppMode('quin')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                appMode === 'quin' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Quin
            </button>
            <button
              onClick={() => setAppMode('b2b')}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                appMode === 'b2b' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              )}
            >
              B2B Network
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Notifications */}
          {!isInactive && (
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors relative"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowNotifications(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h3 className="font-bold text-slate-900">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={async () => {
                            if (user) {
                              await markAllAsRead(user.uid);
                            }
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                          <Check size={14} />
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <p className="text-sm font-medium">No notifications yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {notifications.map((notification) => (
                            <div 
                              key={notification.id}
                              className={cn(
                                "p-4 transition-colors hover:bg-slate-50",
                                !notification.isRead ? "bg-indigo-50/30" : ""
                              )}
                              onClick={async () => {
                                if (!notification.isRead && notification.id) {
                                  await markAsRead(notification.id);
                                }
                                // Optionally navigate based on notification type
                                if (notification.type === 'inquiry' || notification.type === 'order') {
                                  setAppMode('b2b');
                                  setShowNotifications(false);
                                }
                              }}
                            >
                              <div className="flex gap-3">
                                <div className={cn(
                                  "w-2 h-2 mt-1.5 rounded-full shrink-0",
                                  !notification.isRead ? "bg-indigo-600" : "bg-transparent"
                                )} />
                                <div>
                                  <p className={cn(
                                    "text-sm font-semibold mb-0.5",
                                    !notification.isRead ? "text-slate-900" : "text-slate-700"
                                  )}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                                    {notification.message}
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                    {new Date(notification.createdAt).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          )}

          {/* Profile / Logout Dropdown Trigger */}
          <button 
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 bg-slate-100 hover:bg-slate-200 hover:text-rose-600 rounded-lg text-slate-600 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20 md:pb-24">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          }>
            <AnimatePresence mode="wait">
            {appMode === 'quin' ? (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    user={user}
                    ownerId={ownerId || user.uid}
                    role={role}
                    onEditInvoice={handleEditInvoice} 
                    onNewSale={handleNewSale}
                    onTakePayment={() => {
                      setShowPaymentModalFromDashboard(true);
                      setActiveTab('customers');
                    }}
                    onAddExpense={() => setShowAddExpenseModal(true)}
                  />
                )}
                <AddExpenseModal 
                  isOpen={showAddExpenseModal} 
                  onClose={() => setShowAddExpenseModal(false)} 
                  ownerId={ownerId || user.uid}
                  user={user}
                  onExpenseAdded={() => {
                    // Refresh data if needed
                  }}
                />
                {activeTab === 'inventory' && <Inventory user={user} ownerId={ownerId || user.uid} role={role} />}
                {activeTab === 'transactions' && (
                  <Transactions user={user} ownerId={ownerId || user.uid} role={role} onEditInvoice={handleEditInvoice} />
                )}
                {activeTab === 'sales' && (
                  <Billing 
                    user={user}
                    ownerId={ownerId || user.uid}
                    role={role}
                    editId={editingInvoiceId} 
                    initialItems={initialBillingItems}
                    isQuotation={isCreatingQuotation}
                    onComplete={() => {
                      setEditingInvoiceId(undefined);
                      setInitialBillingItems(undefined);
                      setIsCreatingQuotation(false);
                      setActiveTab('transactions');
                    }} 
                  />
                )}
                {activeTab === 'customers' && (
                  <Customers 
                    user={user} 
                    ownerId={ownerId || user.uid}
                    role={role}
                    initialShowPaymentModal={showPaymentModalFromDashboard} 
                    onPaymentModalClose={() => setShowPaymentModalFromDashboard(false)}
                  />
                )}
                {activeTab === 'reports' && (
                  <Reports 
                    user={user} 
                    ownerId={ownerId || user.uid}
                  />
                )}
                {activeTab === 'profile' && (
                  <Profile 
                    user={user} 
                    ownerId={ownerId || user.uid}
                    role={role}
                    onLogout={handleLogout} 
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="b2b"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <B2BNetwork 
                  ownerId={ownerId || user.uid}
                  onGenerateInvoice={(items) => {
                    setInitialBillingItems(items);
                    setAppMode('quin');
                    setActiveTab('sales');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </Suspense>
        </div>
      </main>

      {/* Floating Assistant Button - Bottom Right */}
      {appMode === 'quin' && !isInactive && (
        <div className="fixed bottom-24 right-6 z-[60] no-print">
          <AnimatePresence>
            {isAssistantOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
                className="absolute bottom-16 right-0"
              >
                <BusinessAssistant 
                  user={user} 
                  ownerId={ownerId || user.uid}
                  isFloating 
                  onClose={() => setIsAssistantOpen(false)}
                  onSaleCreate={handleSaleCreateFromAssistant}
                />
              </motion.div>
            )}
          </AnimatePresence>
          
          <button
            onClick={() => setIsAssistantOpen(!isAssistantOpen)}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95",
              isAssistantOpen ? "bg-slate-900 text-white rotate-90" : "bg-white text-slate-900 hover:bg-slate-50"
            )}
          >
            {isAssistantOpen ? <X size={24} /> : <Bot size={28} />}
            {!isAssistantOpen && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
            )}
          </button>
        </div>
      )}

      {appMode === 'quin' && !isInactive && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex justify-around items-center no-print z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as Tab);
                if (item.id !== 'transactions') setEditingInvoiceId(undefined);
              }}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[64px]",
                activeTab === item.id 
                  ? "text-slate-900" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg transition-all",
                activeTab === item.id ? "bg-slate-900 text-white shadow-md shadow-slate-200" : ""
              )}>
                <item.icon size={20} />
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wider",
                activeTab === item.id ? "text-slate-900" : "text-slate-400"
              )}>
                {item.name === 'Me (Profile)' ? 'Profile' : item.name}
              </span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
