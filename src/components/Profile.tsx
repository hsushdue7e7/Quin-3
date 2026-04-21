import { useState, useEffect, useMemo } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  User, Building, Mail, Phone, MapPin, Save, Camera, CheckCircle2, LogOut, 
  BarChart3, Database, AlertCircle, FileText, 
  Briefcase, Settings, Trash2, ExternalLink, Globe, CreditCard, 
  TrendingUp, TrendingDown, Package, BadgeCheck, Edit3, ChevronRight, Plus,
  History, Lock, DollarSign, PieChart, IndianRupee, Users, Info, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reports } from './Reports';
import BusinessProfileForm from './BusinessProfileForm';
import BusinessProfileView from './BusinessProfileView';
import { PasswordPrompt } from './PasswordPrompt';
import { ConfirmationModal } from './ConfirmationModal';
import { useSync } from '../lib/sync';
import { DataImport } from './DataImport';
import { getProfile, saveProfile, type Profile as ProfileType, getBusinessProfile, getInvoices, getPayments, getExpenses, deleteBusinessData, getStaff, saveStaff, deactivateStaff } from '../lib/firestore';
import { formatPhone, formatCurrency, cn } from '../lib/utils';
import { db as localDb, type BusinessProfile, type Invoice, type Product, type Payment, type Expense, type Staff, UserRole } from '../db';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

export function Profile({ user, ownerId, role, onLogout }: { 
  user: FirebaseUser; 
  ownerId: string;
  role: UserRole | null;
  onLogout: () => void;
}) {
  const isAdmin = role === 'admin';
  const { user: syncUser, accessToken, isSyncing: isGlobalSyncing, lastSync, syncNow, signIn, signOut, error: syncError } = useSync();
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeView, setActiveView] = useState<'profile' | 'reports' | 'inventory' | 'staff' | 'import'>(isAdmin || role === 'ca' ? 'reports' : 'profile');
  const [error, setError] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => {
    setActiveView('profile');
  }, []);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStatsData = async () => {
      setIsLoadingStats(true);
      try {
        const [invs, prods, pays, exps, prof, bProf, staffList] = await Promise.all([
          getInvoices(ownerId),
          getDocs(query(collection(db, 'products'), where('userId', '==', ownerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
          getPayments(ownerId),
          getExpenses(ownerId),
          getProfile(ownerId),
          getBusinessProfile(ownerId),
          getStaff(ownerId)
        ]);
        setInvoices(invs);
        setProducts(prods);
        setPayments(pays);
        setExpenses(exps);
        setStaff(staffList);
        if (prof) setProfile(prof);
        if (bProf) setBusinessProfile(bProf);
      } catch (err) {
        console.error("Error fetching profile stats:", err);
      } finally {
        setIsLoadingStats(false);
      }
    };
    fetchStatsData();
  }, [ownerId]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now).getTime();
    const monthEnd = endOfMonth(now).getTime();
    const lastMonthStart = startOfMonth(subMonths(now, 1)).getTime();
    const lastMonthEnd = endOfMonth(subMonths(now, 1)).getTime();

    const currentMonthInvoices = invoices.filter(inv => inv.date >= monthStart && inv.date <= monthEnd);
    const lastMonthInvoices = invoices.filter(inv => inv.date >= lastMonthStart && inv.date <= lastMonthEnd);

    const calculateRevenue = (invs: Invoice[]) => invs.reduce((sum, inv) => sum + inv.total, 0);
    const calculateProfit = (invs: Invoice[]) => invs.reduce((sum, inv) => {
      return sum + inv.items.reduce((itemSum, item) => {
        return itemSum + (item.price - (item.costPrice || 0)) * item.quantity;
      }, 0);
    }, 0);

    const currentRevenue = calculateRevenue(currentMonthInvoices);
    const lastRevenue = calculateRevenue(lastMonthInvoices);
    const revenueGrowth = lastRevenue === 0 ? 100 : ((currentRevenue - lastRevenue) / lastRevenue) * 100;

    const currentProfit = calculateProfit(currentMonthInvoices);
    const lastProfit = calculateProfit(lastMonthInvoices);
    const profitGrowth = lastProfit === 0 ? 100 : ((currentProfit - lastProfit) / lastProfit) * 100;

    const totalSales = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalCustomers = new Set(invoices.map(inv => inv.customerMobile || inv.customerName)).size;
    const totalProducts = products.length;
    const pendingPayments = invoices.reduce((sum, inv) => sum + (inv.creditAmount || 0), 0);

    return {
      currentRevenue,
      revenueGrowth,
      currentProfit,
      profitGrowth,
      totalSales,
      totalCustomers,
      totalProducts,
      pendingPayments
    };
  }, [invoices, products]);

  const handleDeleteBusiness = async () => {
    if (window.confirm('CRITICAL: This will permanently delete ALL your business data including invoices, products, and customers. This action cannot be undone. Are you sure?')) {
      try {
        await deleteBusinessData(ownerId);
        onLogout();
      } catch (err) {
        setError('Failed to delete business data');
      }
    }
  };

  const handleSaveProfile = async (profileData: ProfileType) => {
    await saveProfile(ownerId, profileData);
    
    // Save to local IndexedDB for backup compatibility
    const existingLocalProfile = await localDb.profile.where('userId').equals(ownerId).first();
    if (existingLocalProfile?.id) {
      await localDb.profile.put({ ...profileData, id: existingLocalProfile.id });
    } else {
      await localDb.profile.add(profileData);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // If taxPercentage is not in the form, keep the existing one or default to 10
    let taxPercentage = profile?.taxPercentage ?? 10;
    const formTax = formData.get('taxPercentage');
    if (formTax) {
      const parsedTax = parseFloat(formTax as string);
      if (!isNaN(parsedTax)) {
        taxPercentage = parsedTax;
      }
    }

    const profileData: ProfileType = {
      ...profile,
      userId: ownerId,
      businessName: formData.get('businessName') as string,
      ownerName: formData.get('ownerName') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      gstin: formData.get('gstin') as string,
      state: formData.get('state') as string,
      taxPercentage,
      trackInventory: profile?.trackInventory ?? true,
      logo: profile?.logo
    };

    try {
      await handleSaveProfile(profileData);
      
      setProfile(profileData);

      setIsEditing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError('Failed to save profile. Please try again.');
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile(prev => prev ? { ...prev, logo: reader.result as string } : {
          userId: ownerId,
          businessName: '',
          ownerName: '',
          email: '',
          phone: '',
          address: '',
          taxPercentage: 10,
          trackInventory: true,
          logo: reader.result as string
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {activeView === 'profile' 
              ? (isAdmin ? 'Business Profile' : 'My Profile') 
              : activeView === 'reports' 
              ? 'Business Reports' 
              : activeView === 'staff'
              ? 'Staff Management'
              : activeView === 'import'
              ? 'Import Data'
              : 'Inventory Settings'}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {activeView === 'profile' 
              ? (isAdmin ? 'Manage your business information and branding.' : 'View your staff profile and account details.') 
              : activeView === 'reports'
              ? 'Track your business performance and profitability.'
              : activeView === 'staff'
              ? 'Manage your staff members and their roles.'
              : activeView === 'import'
              ? 'Migrate your data from other apps like Vyapar or MyBillBook.'
              : 'Configure inventory tracking.'}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto whitespace-nowrap">
            {isAdmin && (
              <button
                onClick={() => setActiveView('profile')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  activeView === 'profile' 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <User size={18} />
                Business
              </button>
            )}
            {!isAdmin && (
              <button
                onClick={() => setActiveView('profile')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  activeView === 'profile' 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <User size={18} />
                My Profile
              </button>
            )}
            {(isAdmin || role === 'ca') && (
              <>
                <button
                  onClick={() => setActiveView('reports')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    activeView === 'reports' 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <BarChart3 size={18} />
                  Reports
                </button>
              </>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveView('staff')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    activeView === 'staff' 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Users size={18} />
                  Staff
                </button>
                <button
                  onClick={() => setActiveView('import')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    activeView === 'import' 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Upload size={18} />
                  Import
                </button>
              </>
            )}
            {activeView === 'profile' && !isEditing && isAdmin && (
              <button
                onClick={() => setShowPasswordPrompt(true)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <Edit3 size={18} />
                Edit Profile
              </button>
            )}
            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 transition-all flex items-center gap-2"
            >
              <LogOut size={18} />
              Log Out
            </button>
          </div>
          {activeView === 'profile' && !isEditing && (
            <div className="flex gap-3">
            </div>
          )}
        </div>
      </div>

      <PasswordPrompt
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSuccess={() => setIsEditing(true)}
        title="Security Verification"
        description="Please enter your password to edit the business profile."
        userId={ownerId}
      />

      {activeView === 'import' && isAdmin && (
        <DataImport 
          ownerId={ownerId} 
          onComplete={() => {
            setActiveView('profile');
            window.location.reload(); // Reload to refresh all data
          }} 
        />
      )}

      {activeView === 'profile' ? (
        isAdmin ? (
        <div className="space-y-8">
          {showSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3 shadow-sm"
            >
              <CheckCircle2 size={20} className="text-emerald-500" />
              <span className="font-medium">Profile updated successfully!</span>
            </motion.div>
          )}

          {/* SECTION 1: Business Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl border border-white/10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[120px] -mr-48 -mt-48 animate-pulse" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 blur-[120px] -ml-48 -mb-48" />
            
            <div className="relative flex flex-col md:flex-row gap-10 items-center md:items-start">
              <div className="relative group">
                <div className="w-36 h-36 bg-white/10 backdrop-blur-xl rounded-[2rem] flex items-center justify-center overflow-hidden border border-white/20 shadow-2xl transition-transform group-hover:scale-105 duration-500">
                  {profile?.logo ? (
                    <img src={profile.logo} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Building size={48} className="text-white/20" />
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">No Logo</span>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <label className="absolute -bottom-3 -right-3 bg-white text-indigo-600 p-3 rounded-2xl cursor-pointer hover:bg-indigo-50 shadow-2xl transition-all hover:scale-110 active:scale-95 border border-indigo-100">
                    <Camera size={20} />
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                  </label>
                )}
              </div>

              <div className="flex-1 text-center md:text-left space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-center md:justify-start gap-3">
                    <h2 className="text-4xl font-black tracking-tight drop-shadow-sm">{profile?.businessName || 'Your Business'}</h2>
                    {profile?.gstin && (
                      <div className="flex items-center gap-1 bg-blue-500/20 backdrop-blur-md px-2 py-1 rounded-lg border border-blue-400/30">
                        <BadgeCheck className="text-blue-400 w-4 h-4" />
                        <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Verified</span>
                      </div>
                    )}
                  </div>
                  <p className="text-indigo-200/70 font-semibold flex items-center justify-center md:justify-start gap-2 text-lg">
                    <User size={18} className="text-indigo-400" />
                    {profile?.ownerName || 'Owner Name'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-8 pt-4 border-t border-white/10">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300/50 uppercase tracking-[0.2em]">Monthly Revenue</p>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black">{formatCurrency(stats.currentRevenue)}</span>
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md border",
                        stats.revenueGrowth >= 0 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      )}>
                        {stats.revenueGrowth >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {Math.abs(stats.revenueGrowth).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-indigo-300/50 uppercase tracking-[0.2em]">Monthly Profit</p>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black">{formatCurrency(stats.currentProfit)}</span>
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md border",
                        stats.profitGrowth >= 0 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      )}>
                        {stats.profitGrowth >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {Math.abs(stats.profitGrowth).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!isEditing && (
                <button
                  onClick={() => setShowPasswordPrompt(true)}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-2xl font-bold transition-all border border-white/10 flex items-center gap-2 shadow-lg group active:scale-95"
                >
                  <Edit3 size={18} className="group-hover:rotate-12 transition-transform" />
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {/* SECTION 2: Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Sales', value: formatCurrency(stats.totalSales), icon: DollarSign, color: 'indigo' },
              { label: 'Total Customers', value: stats.totalCustomers, icon: Users, color: 'emerald' },
              { label: 'Total Products', value: stats.totalProducts, icon: Package, color: 'amber' },
              { label: 'Pending Payments', value: formatCurrency(stats.pendingPayments), icon: CreditCard, color: 'rose' }
            ].map((stat, i) => (
              <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110",
                  stat.color === 'indigo' ? "bg-indigo-50 text-indigo-600" :
                  stat.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                  stat.color === 'amber' ? "bg-amber-50 text-amber-600" :
                  "bg-rose-50 text-rose-600"
                )}>
                  <stat.icon size={24} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-xl font-black text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-3 space-y-8">
              {/* SECTION 3: Business Details */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                      <Briefcase size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">Business Details</h3>
                  </div>
                  {!isEditing && (
                    <button 
                      onClick={() => setShowPasswordPrompt(true)}
                      className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      Edit Details
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
                
                {isEditing ? (
                  <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Business Name</label>
                        <div className="relative group">
                          <Building size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <input
                            name="businessName"
                            required
                            defaultValue={profile?.businessName}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none"
                            placeholder="e.g. Quin Inc."
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Owner Name</label>
                        <div className="relative group">
                          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <input
                            name="ownerName"
                            required
                            defaultValue={profile?.ownerName}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none"
                            placeholder="e.g. John Doe"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Email Address</label>
                        <div className="relative group">
                          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <input
                            name="email"
                            type="email"
                            required
                            defaultValue={profile?.email}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none"
                            placeholder="e.g. contact@quin.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Phone Number</label>
                        <div className="relative group">
                          <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <input
                            name="phone"
                            required
                            defaultValue={profile?.phone ? formatPhone(profile.phone) : ''}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none"
                            placeholder="e.g. +91 98765 43210"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Business Address</label>
                        <div className="relative group">
                          <MapPin size={18} className="absolute left-4 top-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <textarea
                            name="address"
                            required
                            defaultValue={profile?.address}
                            rows={3}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none resize-none"
                            placeholder="e.g. 123, Business Park, Sector 62, Noida, UP"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">GSTIN (Optional)</label>
                        <div className="relative group">
                          <FileText size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <input
                            name="gstin"
                            defaultValue={profile?.gstin}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none uppercase"
                            placeholder="e.g. 09AAAAA0000A1Z5"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">State</label>
                        <div className="relative group">
                          <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                          <select
                            name="state"
                            defaultValue={profile?.state || 'Uttar Pradesh'}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600 focus:bg-white transition-all outline-none appearance-none"
                          >
                            <option value="Andhra Pradesh">Andhra Pradesh</option>
                            <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                            <option value="Assam">Assam</option>
                            <option value="Bihar">Bihar</option>
                            <option value="Chhattisgarh">Chhattisgarh</option>
                            <option value="Goa">Goa</option>
                            <option value="Gujarat">Gujarat</option>
                            <option value="Haryana">Haryana</option>
                            <option value="Himachal Pradesh">Himachal Pradesh</option>
                            <option value="Jharkhand">Jharkhand</option>
                            <option value="Karnataka">Karnataka</option>
                            <option value="Kerala">Kerala</option>
                            <option value="Madhya Pradesh">Madhya Pradesh</option>
                            <option value="Maharashtra">Maharashtra</option>
                            <option value="Manipur">Manipur</option>
                            <option value="Meghalaya">Meghalaya</option>
                            <option value="Mizoram">Mizoram</option>
                            <option value="Nagaland">Nagaland</option>
                            <option value="Odisha">Odisha</option>
                            <option value="Punjab">Punjab</option>
                            <option value="Rajasthan">Rajasthan</option>
                            <option value="Sikkim">Sikkim</option>
                            <option value="Tamil Nadu">Tamil Nadu</option>
                            <option value="Telangana">Telangana</option>
                            <option value="Tripura">Tripura</option>
                            <option value="Uttar Pradesh">Uttar Pradesh</option>
                            <option value="Uttarakhand">Uttarakhand</option>
                            <option value="West Bengal">West Bengal</option>
                            <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                            <option value="Chandigarh">Chandigarh</option>
                            <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                            <option value="Delhi">Delhi</option>
                            <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                            <option value="Ladakh">Ladakh</option>
                            <option value="Lakshadweep">Lakshadweep</option>
                            <option value="Puducherry">Puducherry</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 flex gap-4">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 px-6 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Save size={18} />
                        Save Changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
                    {[
                      { label: 'Phone Number', value: profile?.phone ? formatPhone(profile.phone) : 'Not provided', icon: Phone },
                      { label: 'Email Address', value: profile?.email || 'Not provided', icon: Mail },
                      { label: 'Business Address', value: profile?.address || 'Not provided', icon: MapPin, full: true },
                      { label: 'GST Number', value: profile?.gstin || 'Not provided', icon: FileText },
                      { label: 'State', value: profile?.state || 'Not provided', icon: Globe }
                    ].map((info, i) => (
                      <div key={i} className={cn("flex items-start gap-4 group", info.full && "md:col-span-2")}>
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shrink-0">
                          <info.icon size={18} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            {info.label}
                          </p>
                          <p className="text-slate-900 font-bold leading-relaxed">{info.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 4: Business Settings */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                      <Settings size={20} />
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">Business Settings</h3>
                  </div>
                </div>
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between group">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">Tax Setup</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Default GST Percentage</p>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-inner focus-within:ring-2 focus-within:ring-indigo-600 focus-within:bg-white transition-all">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            defaultValue={profile?.taxPercentage ?? 10}
                            className="w-12 bg-transparent font-black text-slate-900 text-right outline-none"
                            onBlur={async (e) => {
                              const newTax = parseFloat(e.target.value);
                              if (!isNaN(newTax) && newTax !== profile?.taxPercentage) {
                                const updatedProfile = profile 
                                  ? { ...profile, taxPercentage: newTax }
                                  : {
                                      userId: ownerId,
                                      businessName: '',
                                      ownerName: '',
                                      email: '',
                                      phone: '',
                                      address: '',
                                      taxPercentage: newTax,
                                      trackInventory: true
                                    };
                                await handleSaveProfile(updatedProfile);
                                setProfile(updatedProfile);
                                setShowSuccess(true);
                                setTimeout(() => setShowSuccess(false), 3000);
                              }
                            }}
                          />
                          <span className="font-black text-slate-900">%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between group">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">Inventory Tracking</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Global stock management</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={profile?.trackInventory ?? true}
                            onChange={async (e) => {
                              const newValue = e.target.checked;
                              const updatedProfile = profile 
                                ? { ...profile, trackInventory: newValue }
                                : {
                                    userId: ownerId,
                                    businessName: '',
                                    ownerName: '',
                                    email: '',
                                    phone: '',
                                    address: '',
                                    taxPercentage: 10,
                                    trackInventory: newValue
                                  };
                              await handleSaveProfile(updatedProfile);
                              setProfile(updatedProfile);
                              setShowSuccess(true);
                              setTimeout(() => setShowSuccess(false), 3000);
                            }}
                          className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between group">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">Currency</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Default billing currency</p>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                          <IndianRupee size={14} className="text-slate-400" />
                          <span className="font-black text-slate-900">INR (₹)</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between group">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">Invoice Theme</h4>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Custom branding & layout</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            {profile?.invoiceTheme || 'modern'}
                          </span>
                          <button 
                            onClick={() => setShowThemePicker(!showThemePicker)}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                          >
                            {showThemePicker ? 'Close' : 'Customize'}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {showThemePicker && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              {(['modern', 'classic', 'minimal', 'bold', 'elegant'] as const).map((t) => (
                                <button
                                  key={t}
                                  onClick={async () => {
                                    const updatedProfile = profile 
                                      ? { ...profile, invoiceTheme: t }
                                      : {
                                          userId: ownerId,
                                          businessName: '',
                                          ownerName: '',
                                          email: '',
                                          phone: '',
                                          address: '',
                                          taxPercentage: 10,
                                          trackInventory: true,
                                          invoiceTheme: t
                                        };
                                    await handleSaveProfile(updatedProfile);
                                    setProfile(updatedProfile);
                                    setShowSuccess(true);
                                    setTimeout(() => setShowSuccess(false), 3000);
                                  }}
                                  className={cn(
                                    "py-2 px-3 rounded-xl text-[10px] font-bold capitalize transition-all border",
                                    (profile?.invoiceTheme || 'modern') === t 
                                      ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                  )}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* SECTION 7: Actions */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                    <AlertCircle size={20} />
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">Danger Zone</h3>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={onLogout}
                    className="w-full py-4 bg-slate-50 text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-3 border border-slate-100 group"
                  >
                    <LogOut size={18} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                    Logout from Device
                  </button>
                  <button
                    onClick={handleDeleteBusiness}
                    className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold hover:bg-rose-100 transition-all flex items-center justify-center gap-3 border border-rose-100 group"
                  >
                    <Trash2 size={18} className="group-hover:animate-bounce" />
                    Delete Business Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : (
          <StaffProfileView 
            user={user} 
            profile={profile} 
            currentStaff={staff.find(s => s.email === user.email)} 
            onLogout={onLogout} 
          />
        )
      ) : activeView === 'reports' ? (
        <Reports user={user} ownerId={ownerId} />
      ) : activeView === 'staff' ? (
        <StaffManagement ownerId={ownerId} staff={staff} onUpdate={async () => {
          const updatedStaff = await getStaff(ownerId);
          setStaff(updatedStaff);
        }} />
      ) : (
        <div className="space-y-8">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 flex items-center gap-3 shadow-sm">
              <AlertCircle size={20} className="text-red-500" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {showSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex items-center gap-3 shadow-sm"
            >
              <CheckCircle2 size={20} className="text-emerald-500" />
              <span className="font-medium">Settings updated successfully!</span>
            </motion.div>
          )}

          {/* Inventory Tracking Section */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <Database size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl">Inventory Tracking</h3>
                <p className="text-slate-500 text-sm">Configure global stock management behavior.</p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900">Global Stock Tracking</h4>
                  <p className="text-xs text-slate-500 max-w-md">
                    When enabled, the system will track stock levels for all products that have tracking enabled. 
                    Disabling this will hide stock columns and stop stock deductions during billing.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile?.trackInventory ?? true}
                    onChange={async (e) => {
                      const newValue = e.target.checked;
                      if (profile) {
                        const updatedProfile = { ...profile, trackInventory: newValue };
                        await handleSaveProfile(updatedProfile);
                        setProfile(updatedProfile);
                        setShowSuccess(true);
                        setTimeout(() => setShowSuccess(false), 3000);
                      }
                    }}
                    className="sr-only peer" 
                  />
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-start gap-3 text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    <strong>Note:</strong> Disabling this will not delete your current stock data, but it will stop the system from updating stock levels until re-enabled.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffManagement({ ownerId, staff, onUpdate }: { 
  ownerId: string; 
  staff: Staff[]; 
  onUpdate: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    
    const staffData: Staff = {
      ...(editingStaff || {}),
      userId: ownerId,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      role: formData.get('role') as UserRole,
      status: (formData.get('status') as 'active' | 'inactive') || 'active',
      createdAt: editingStaff?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveStaff(staffData);
      onUpdate();
      setIsAdding(false);
      setEditingStaff(null);
    } catch (err) {
      setError('Failed to save staff member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-900">Staff Members</h3>
        <button
          onClick={() => {
            setEditingStaff(null);
            setIsAdding(true);
          }}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all"
        >
          <Plus size={18} />
          Add Staff
        </button>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-[1.5rem] space-y-2">
        <div className="flex items-center gap-2 text-indigo-600 mb-1">
          <Info size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">How Staff Can Login</span>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-indigo-900 font-bold">1. Add staff email in the form below to grant access.</p>
          <p className="text-xs text-indigo-900 font-bold">2. Staff must Sign Up on the login page using this exact email.</p>
          <p className="text-xs text-indigo-900 font-bold">3. Once signed up, they can Sign In to access their dashboard.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 flex items-center gap-3">
          <AlertCircle size={20} className="text-red-500" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {(isAdding || editingStaff) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <h4 className="font-bold text-slate-900">{editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                <input
                  name="name"
                  required
                  defaultValue={editingStaff?.name}
                  className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none"
                  placeholder="e.g. Rahul Sharma"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Role</label>
                <select
                  name="role"
                  required
                  defaultValue={editingStaff?.role || 'sales_manager'}
                  className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none appearance-none font-medium"
                >
                  <option value="sales_manager">Sales Manager (Billing & Customers)</option>
                  <option value="inventory_manager">Inventory Manager (Stock & Goods)</option>
                  <option value="ca">Chartered Accountant (Taxes & Reports)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email (Required for Login)</label>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={editingStaff?.email}
                  className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none"
                  placeholder="staff@example.com"
                />
                <p className="text-[10px] text-slate-400 ml-1 italic">Staff will use this email to sign up/login.</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone (Optional)</label>
                <input
                  name="phone"
                  defaultValue={editingStaff?.phone}
                  className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none"
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Status</label>
                <select
                  name="status"
                  defaultValue={editingStaff?.status || 'active'}
                  className={cn(
                    "w-full px-4 py-3 border-slate-200 rounded-xl focus:ring-2 outline-none appearance-none font-bold",
                    editingStaff?.status === 'inactive' ? "bg-rose-50 text-rose-700 focus:ring-rose-600" : "bg-emerald-50 text-emerald-700 focus:ring-emerald-600"
                  )}
                >
                  <option value="active">Active (Full Access)</option>
                  <option value="inactive">Inactive (Access Blocked)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingStaff(null);
                }}
                className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save Staff Member'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {staff.length > 0 ? (
          staff.map((member) => (
            <div key={member.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group hover:shadow-lg hover:border-indigo-200 transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                  member.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {member.status === 'active' ? <BadgeCheck size={28} /> : <User size={28} />}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg leading-tight">{member.name}</h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      {member.role === 'sales_manager' ? 'Sales Manager' : 
                       member.role === 'inventory_manager' ? 'Inventory Manager' : 
                       member.role === 'ca' ? 'Chartered Accountant' : member.role}
                    </p>
                    <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
                    <div className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm",
                      member.status === 'active' 
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                        : "bg-rose-100 text-rose-700 border border-rose-200"
                    )}>
                      {member.status}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-1.5 flex items-center gap-1">
                    <Mail size={12} /> {member.email}
                  </p>
                </div>
              </div>
              <div className="flex w-full sm:w-auto gap-2 border-t sm:border-t-0 pt-4 sm:pt-0">
                <button
                  onClick={() => setEditingStaff(member)}
                  className="flex-1 sm:flex-none px-4 py-2 bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 active:scale-95 border border-slate-100"
                >
                  <Edit3 size={16} />
                  Edit
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="md:col-span-2 py-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
            <Users size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No staff members added yet.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="mt-4 text-indigo-600 font-bold hover:text-indigo-700"
            >
              Add your first staff member
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffProfileView({ user, profile, currentStaff, onLogout }: {
  user: FirebaseUser;
  profile: ProfileType | null;
  currentStaff?: Staff;
  onLogout: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl border border-white/10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[120px] -mr-48 -mt-48 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 blur-[120px] -ml-48 -mb-48" />
        
        <div className="relative flex flex-col md:flex-row gap-10 items-center md:items-start">
          <div className="w-36 h-36 bg-white/10 backdrop-blur-xl rounded-[2rem] flex items-center justify-center overflow-hidden border border-white/20 shadow-2xl">
            {profile?.logo ? (
              <img src={profile.logo} alt="Company Logo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Building size={48} className="text-white/20" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">No Logo</span>
              </div>
            )}
          </div>

          <div className="flex-1 text-center md:text-left space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <h2 className="text-4xl font-black tracking-tight drop-shadow-sm">{currentStaff?.name || user.displayName || 'Staff Member'}</h2>
                <div className="flex items-center gap-1 bg-emerald-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-400/30">
                  <BadgeCheck className="text-emerald-400 w-4 h-4" />
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                    {currentStaff?.role === 'sales_manager' ? 'Sales Manager' : 
                     currentStaff?.role === 'inventory_manager' ? 'Inventory Manager' : 
                     currentStaff?.role === 'ca' ? 'Chartered Accountant' : 'Staff'}
                  </span>
                </div>
              </div>
              <p className="text-indigo-200/70 font-semibold flex items-center justify-center md:justify-start gap-2 text-lg">
                <Building size={18} className="text-indigo-400" />
                {profile?.businessName || 'Company Name'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-3 text-indigo-100">
                <Mail size={18} className="text-indigo-400" />
                <span className="text-sm">{user.email}</span>
              </div>
              {currentStaff?.phone && (
                <div className="flex items-center gap-3 text-indigo-100">
                  <Phone size={18} className="text-indigo-400" />
                  <span className="text-sm">{currentStaff.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
            <LogOut size={20} />
          </div>
          <h3 className="font-bold text-slate-900 text-lg">Account Actions</h3>
        </div>
        
        <button
          onClick={onLogout}
          className="w-full py-4 bg-slate-50 text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-3 border border-slate-100 group"
        >
          <LogOut size={18} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
          Logout from Device
        </button>
      </div>
    </div>
  );
}

