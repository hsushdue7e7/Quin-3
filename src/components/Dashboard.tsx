import { useState, useEffect, useMemo, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Invoice, type Product, type Payment, type Expense, UserRole } from '../db';
import { 
  Package, IndianRupee, ShoppingCart, TrendingUp, AlertCircle, Zap, Printer, 
  ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Sparkles, 
  MessageSquare, Share2, Edit3, CheckCircle2, ChevronRight,
  TrendingDown, Info, Clock, FileText
} from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { formatCurrency, cn } from '../lib/utils';
import { PrintModal } from './PrintModal';
import { InvoiceView } from './InvoiceView';
import html2canvas from 'html2canvas';
import { getInvoices, getProfile, updateInvoice, getPayments, getExpenses, type Profile as ProfileType } from '../lib/firestore';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { startOfDay, subDays, isSameDay, format, endOfDay } from 'date-fns';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { motion } from 'motion/react';

export function Dashboard({ 
  user,
  ownerId,
  role,
  onEditInvoice, 
  onNewSale,
  onTakePayment,
  onAddExpense
}: { 
  user: FirebaseUser;
  ownerId: string;
  role: UserRole | null;
  onEditInvoice: (id: string) => void;
  onNewSale: (direct?: boolean | 'quotation') => void;
  onTakePayment: () => void;
  onAddExpense: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [invs, prods, prof, pays, exps] = await Promise.all([
          getInvoices(ownerId),
          getDocs(query(collection(db, 'products'), where('userId', '==', ownerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
          getProfile(ownerId),
          getPayments(ownerId),
          getExpenses(ownerId)
        ]);
        setInvoices(invs);
        setProducts(prods);
        setProfile(prof);
        setPayments(pays);
        setExpenses(exps);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [ownerId]);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState<string | null>(null);
  const hiddenInvoiceRef = useRef<HTMLDivElement>(null);

  // Data Calculations
  const today = startOfDay(new Date());
  const yesterday = startOfDay(subDays(new Date(), 1));

  const todayInvoices = useMemo(() => invoices.filter(inv => inv.type !== 'quotation' && inv.date >= today.getTime()), [invoices, today]);
  const yesterdayInvoices = useMemo(() => invoices.filter(inv => inv.type !== 'quotation' && inv.date >= yesterday.getTime() && inv.date < today.getTime()), [invoices, yesterday, today]);

  const calculateSales = (invs: Invoice[]) => invs.reduce((sum, inv) => sum + inv.total, 0);
  const calculateProfit = (invs: Invoice[]) => invs.reduce((sum, inv) => {
    return sum + inv.items.reduce((itemSum, item) => {
      return itemSum + (item.price - (item.costPrice || 0)) * item.quantity;
    }, 0);
  }, 0);
  const calculateCredit = (invs: Invoice[]) => invs.reduce((sum, inv) => sum + (inv.creditAmount || 0), 0);

  const todaySales = calculateSales(todayInvoices);
  const yesterdaySales = calculateSales(yesterdayInvoices);
  const salesChange = yesterdaySales === 0 ? 100 : ((todaySales - yesterdaySales) / yesterdaySales) * 100;

  const todayExpenses = useMemo(() => expenses.filter(exp => exp.date >= today.getTime()).reduce((sum, exp) => sum + (exp.amount || 0), 0), [expenses, today]);

  const todayProfit = calculateProfit(todayInvoices);
  const yesterdayProfit = calculateProfit(yesterdayInvoices);
  const profitChange = yesterdayProfit === 0 ? 100 : ((todayProfit - yesterdayProfit) / Math.abs(yesterdayProfit)) * 100;

  const showSales = role === 'admin' || role === 'sales_manager' || role === 'ca';
  const showExpenses = role === 'admin' || role === 'ca';
  const showProfit = role === 'admin' || role === 'ca';
  const showPayments = role === 'admin' || role === 'sales_manager' || role === 'ca';

  const totalCredit = invoices.filter(inv => inv.type !== 'quotation').reduce((sum, inv) => sum + (inv.creditAmount || 0), 0);
  const cashInHand = payments.reduce((sum, p) => sum + p.amount, 0);

  // Chart Data
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStart = startOfDay(date).getTime();
      const dayEnd = endOfDay(date).getTime();
      const dayInvoices = invoices.filter(inv => inv.type !== 'quotation' && inv.date >= dayStart && inv.date <= dayEnd);
      return {
        name: format(date, 'EEE'),
        sales: calculateSales(dayInvoices),
        profit: calculateProfit(dayInvoices)
      };
    });
    return last7Days;
  }, [invoices]);

  // Insights
  const insights = useMemo(() => {
    const list = [];
    if (todayProfit < 0) {
      list.push({ text: `Your profit is negative today (${formatCurrency(todayProfit)})`, type: 'loss', icon: TrendingDown });
    } else if (todaySales > yesterdaySales && todaySales > 0) {
      list.push({ text: `Sales are up ${salesChange.toFixed(0)}% compared to yesterday`, type: 'gain', icon: TrendingUp });
    } else if (todaySales < yesterdaySales && yesterdaySales > 0) {
      list.push({ text: `Sales dropped ${Math.abs(salesChange).toFixed(0)}% compared to yesterday`, type: 'warning', icon: TrendingDown });
    }

    const pendingPayments = invoices.filter(inv => inv.type !== 'quotation' && inv.creditAmount > 0).length;
    if (pendingPayments > 0) {
      list.push({ text: `${pendingPayments} payments are pending collection`, type: 'info', icon: Clock });
    }

    const lowStock = products.filter(p => p.stock <= p.minStock).length;
    if (lowStock > 0) {
      list.push({ text: `Stock running low for ${lowStock} items`, type: 'warning', icon: Package });
    }

    return list;
  }, [todaySales, yesterdaySales, todayProfit, invoices, products, salesChange]);

  // Alerts
  const alerts = useMemo(() => {
    const list = [];
    const lowStock = products.filter(p => p.stock <= p.minStock);
    if (lowStock.length > 0) {
      list.push({ title: 'Low Stock Warning', message: `${lowStock.length} items need restocking`, type: 'urgent', icon: AlertCircle });
    }
    if (totalCredit > 5000) {
      list.push({ title: 'High Credit Balance', message: `Total pending: ${formatCurrency(totalCredit)}`, type: 'warning', icon: CreditCard });
    }
    if (todayProfit < 0 && todaySales > 0) {
      list.push({ title: 'Loss Warning', message: 'Expenses might be higher than margins today', type: 'urgent', icon: TrendingDown });
    }
    return list;
  }, [products, totalCredit, todayProfit, todaySales]);

  const handlePrint = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setShowPrintModal(true);
  };

  const handleMarkAsPaid = async (inv: Invoice) => {
    if (!inv.id) return;
    await updateInvoice(inv.id, { 
      creditAmount: 0, 
      receivedAmount: inv.total 
    });
    // Refresh data
    const invs = await getInvoices(user.uid);
    setInvoices(invs);
  };

  const handleShareImage = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsSharingImage(inv.id || 'temp');
    
    // Wait for the hidden component to render
    setTimeout(async () => {
      if (!hiddenInvoiceRef.current) {
        setIsSharingImage(null);
        return;
      }
      
      try {
        const canvas = await html2canvas(hiddenInvoiceRef.current, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 800 // Ensure consistent width for capture
        });
        
        const dataUrl = canvas.toDataURL('image/png');
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `invoice-${inv.invoiceNumber}.png`, { type: 'image/png' });

        // Try to share the image if supported
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Invoice ${inv.invoiceNumber}`,
            text: `Invoice from ${profile?.businessName || 'Quin'}`
          });
        } else {
          // Fallback to download if sharing is not supported
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `invoice-${inv.invoiceNumber}.png`;
          link.click();
        }
      } catch (error) {
        if ((error as any).name !== 'AbortError') {
          console.error('Error sharing image:', error);
          alert('Failed to share image. Your browser might not support sharing files.');
        } else {
          console.log('Share was canceled by user');
        }
      } finally {
        setIsSharingImage(null);
      }
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {showPrintModal && selectedInvoice && (
        <PrintModal 
          invoice={selectedInvoice} 
          profile={profile} 
          onClose={() => {
            setShowPrintModal(false);
            setSelectedInvoice(null);
          }} 
        />
      )}

      {/* Today's Business Snapshot */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Today's Business Snapshot</h2>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{format(new Date(), 'dd MMM, yyyy')}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {showSales && (
            <SnapshotCard 
              label="Today Sales" 
              value={formatCurrency(todaySales)} 
              change={salesChange} 
              icon={ShoppingCart}
              color="blue"
            />
          )}
          {showExpenses && (
            <SnapshotCard 
              label="Today Expenses" 
              value={formatCurrency(todayExpenses)} 
              icon={TrendingDown}
              color="red"
            />
          )}
          {showProfit && (
            <SnapshotCard 
              label="Today Profit" 
              value={formatCurrency(todayProfit)} 
              change={profitChange} 
              icon={TrendingUp}
              color={todayProfit >= 0 ? "emerald" : "red"}
              isProfit
            />
          )}
          {showSales && (
            <SnapshotCard 
              label="Cash / Bank" 
              value={formatCurrency(cashInHand)} 
              icon={Wallet}
              color="indigo"
            />
          )}
          {showSales && (
            <SnapshotCard 
              label="Pending (Credit)" 
              value={formatCurrency(totalCredit)} 
              icon={CreditCard}
              color="amber"
              isWarning={totalCredit > 0}
            />
          )}
        </div>
      </section>

      {/* Action Buttons */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(role === 'admin' || role === 'sales_manager') && (
          <ActionButton 
            label="Create Sale/Invoice" 
            icon={Zap} 
            onClick={() => onNewSale(false)}
            color="slate"
          />
        )}
        {(role === 'admin' || role === 'sales_manager') && (
          <ActionButton 
            label="Create Quotation" 
            icon={FileText} 
            onClick={() => onNewSale('quotation')}
            color="blue"
          />
        )}
        {showPayments && (
          <ActionButton 
            label="Take Payment" 
            icon={IndianRupee} 
            onClick={onTakePayment}
            color="emerald"
          />
        )}
        {showExpenses && (
          <ActionButton 
            label="Add Expense" 
            icon={TrendingDown} 
            onClick={onAddExpense}
            color="amber"
          />
        )}
      </section>

      {/* Today's Insights */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" />
          <h2 className="font-bold text-slate-900">Today's Insights</h2>
        </div>
        <div className="p-4 space-y-3">
          {insights.length > 0 ? insights.map((insight, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group hover:border-slate-200 transition-all">
              <div className={cn(
                "p-2 rounded-lg",
                insight.type === 'loss' ? "bg-red-100 text-red-600" :
                insight.type === 'gain' ? "bg-emerald-100 text-emerald-600" :
                insight.type === 'warning' ? "bg-amber-100 text-amber-600" :
                "bg-blue-100 text-blue-600"
              )}>
                <insight.icon size={16} />
              </div>
              <p className="text-sm font-medium text-slate-700 flex-1">{insight.text}</p>
              <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
          )) : (
            <p className="text-sm text-slate-400 text-center py-4 italic">No insights available for today yet.</p>
          )}
        </div>
      </section>

      {/* Mini Analytics */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900">7-Day Sales Trend</h2>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-slate-500">Sales</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-500">Profit</span>
            </div>
          </div>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                dy={10}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Area 
                type="monotone" 
                dataKey="sales" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorSales)" 
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorProfit)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Alert System */}
      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className={cn(
              "p-3 rounded-xl border flex items-center gap-3",
              alert.type === 'urgent' ? "bg-red-50 border-red-100 text-red-700" : "bg-amber-50 border-amber-100 text-amber-700"
            )}>
              <div className={cn(
                "p-2 rounded-lg",
                alert.type === 'urgent' ? "bg-red-100" : "bg-amber-100"
              )}>
                <alert.icon size={16} />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold uppercase tracking-wider">{alert.title}</h3>
                <p className="text-sm font-medium opacity-80">{alert.message}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Recent Sales/Invoices */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Recent Sales/Invoices</h2>
          <button className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline">View All</button>
        </div>
        <div className="divide-y divide-slate-50">
          {invoices.filter(inv => inv.type !== 'quotation').sort((a, b) => b.date - a.date).slice(0, 5).map((inv) => (
            <div key={inv.id} className="p-4 hover:bg-slate-50 transition-colors group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-slate-900">{inv.customerName}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {inv.invoiceNumber} • {format(inv.date, 'dd MMM')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{formatCurrency(inv.total)}</p>
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                    inv.creditAmount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {inv.creditAmount > 0 ? 'Pending' : 'Paid'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {inv.creditAmount > 0 && (
                  <button 
                    onClick={() => handleMarkAsPaid(inv)}
                    className="flex-1 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={12} />
                    Mark Paid
                  </button>
                )}
                <button 
                  onClick={() => handleShareImage(inv)}
                  disabled={isSharingImage === inv.id}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSharingImage === inv.id ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <WhatsAppIcon size={12} />
                  )}
                  WhatsApp
                </button>
                <button 
                  onClick={() => inv.id && onEditInvoice(inv.id)}
                  className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <Edit3 size={14} />
                </button>
                <button 
                  onClick={() => handlePrint(inv)}
                  className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <Printer size={14} />
                </button>
              </div>
            </div>
          ))}
          {invoices.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShoppingCart size={20} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No invoices yet. Start selling!</p>
            </div>
          )}
        </div>
      </section>

      {/* Hidden Invoice for Image Generation */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        {isSharingImage && selectedInvoice && (
          <div ref={hiddenInvoiceRef} className="bg-white p-12 w-[210mm]">
            <InvoiceView invoice={selectedInvoice} profile={profile || undefined} />
          </div>
        )}
      </div>
    </div>
  );
}

function SnapshotCard({ 
  label, 
  value, 
  change, 
  icon: Icon, 
  color,
  isProfit,
  isWarning
}: { 
  label: string; 
  value: string; 
  change?: number; 
  icon: any; 
  color: string;
  isProfit?: boolean;
  isWarning?: boolean;
}) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className={cn(
          "p-1.5 rounded-lg",
          color === 'blue' ? "bg-blue-50 text-blue-600" :
          color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
          color === 'red' ? "bg-red-50 text-red-600" :
          color === 'indigo' ? "bg-indigo-50 text-indigo-600" :
          "bg-amber-50 text-amber-600"
        )}>
          <Icon size={14} />
        </div>
        {change !== undefined && (
          <div className={cn(
            "flex items-center text-[9px] font-bold",
            isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-slate-400"
          )}>
            {isPositive ? <ArrowUpRight size={10} /> : isNegative ? <ArrowDownRight size={10} /> : null}
            {Math.abs(change).toFixed(0)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
        <p className={cn(
          "text-sm font-bold truncate",
          isProfit && parseFloat(value.replace(/[^0-9.-]+/g,"")) < 0 ? "text-red-600" : "text-slate-900",
          isWarning ? "text-amber-600" : ""
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ActionButton({ 
  label, 
  icon: Icon, 
  onClick,
  color
}: { 
  label: string; 
  icon: any; 
  onClick: () => void;
  color: 'slate' | 'emerald' | 'blue' | 'amber';
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-3 rounded-2xl transition-all shadow-sm border",
        color === 'slate' ? "bg-slate-900 border-slate-900 text-white hover:bg-slate-800" :
        color === 'emerald' ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700" :
        color === 'amber' ? "bg-amber-500 border-amber-500 text-white hover:bg-amber-600" :
        color === 'blue' ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700" :
        "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl",
        (color === 'slate' || color === 'emerald' || color === 'amber' || color === 'blue') ? "bg-white/10" :
        "bg-slate-100"
      )}>
        <Icon size={18} />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-center">{label}</span>
    </button>
  );
}
