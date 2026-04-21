import { useState, useMemo, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  TrendingUp, 
  TrendingDown, 
  IndianRupee, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Users, 
  AlertCircle,
  TrendingUp as TrendingUpIcon,
  Info
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  subDays, 
  startOfWeek, 
  endOfWeek, 
  subWeeks, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfYear, 
  endOfYear, 
  subYears,
  isWithinInterval,
  eachDayOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isSameMonth,
  eachHourOfInterval,
  isSameHour
} from 'date-fns';
import { getInvoices, getPayments, getExpenses } from '../lib/firestore';
import { type Invoice, type Payment, type Expense } from '../db';
import { formatCurrency, cn } from '../lib/utils';
import { motion } from 'motion/react';

interface SummaryCardProps {
  title: string;
  value: number;
  prevValue: number;
  icon: any;
  color: 'blue' | 'emerald' | 'red' | 'amber';
  suffix?: string;
  isCurrency?: boolean;
}

function SummaryCard({ title, value, prevValue, icon: Icon, color, suffix = '', isCurrency = true }: SummaryCardProps) {
  const growth = prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : 0;
  const isPositive = growth >= 0;

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100'
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("bg-white p-6 rounded-3xl border shadow-sm", colorClasses[color])}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn("p-3 rounded-2xl", colorClasses[color].split(' ')[0])}>
          <Icon size={24} />
        </div>
        {prevValue > 0 && (
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
            isPositive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(growth).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-900">
          {isCurrency ? formatCurrency(value) : `${value}${suffix}`}
        </p>
      </div>
    </motion.div>
  );
}

export function Reports({ user, ownerId }: { user: FirebaseUser; ownerId: string }) {
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!ownerId) {
        console.log("Reports: No ownerId provided yet.");
        return;
      }
      setIsLoading(true);
      try {
        console.log("Reports: Fetching data for ownerId:", ownerId);
        const [invs, pays, exps] = await Promise.all([
          getInvoices(ownerId),
          getPayments(ownerId),
          getExpenses(ownerId)
        ]);
        console.log(`Reports: Fetched ${invs.length} invoices, ${pays.length} payments, ${exps.length} expenses.`);
        setInvoices(invs);
        setPayments(pays);
        setExpenses(exps);
      } catch (error) {
        console.error('Reports: Error fetching report data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [ownerId]);

  const dateRange = useMemo(() => {
    const now = new Date();
    let start, end, prevStart, prevEnd;

    switch (timeRange) {
      case 'day':
        start = startOfDay(now);
        end = endOfDay(now);
        prevStart = startOfDay(subDays(now, 1));
        prevEnd = endOfDay(subDays(now, 1));
        break;
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        prevEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        prevStart = startOfMonth(subMonths(now, 1));
        prevEnd = endOfMonth(subMonths(now, 1));
        break;
      case 'year':
        start = startOfYear(now);
        end = endOfYear(now);
        prevStart = startOfYear(subYears(now, 1));
        prevEnd = endOfYear(subYears(now, 1));
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        prevStart = startOfMonth(subMonths(now, 1));
        prevEnd = endOfMonth(subMonths(now, 1));
    }

    return { start, end, prevStart, prevEnd };
  }, [timeRange]);

  const analytics = useMemo(() => {
    if (isLoading) return null;

    const filterByInterval = (items: any[], start: Date, end: Date) => {
      return items.filter(item => {
        const date = new Date(item.date);
        return isWithinInterval(date, { start, end });
      });
    };

    const currentInvoices = filterByInterval(invoices, dateRange.start, dateRange.end);
    const prevInvoices = filterByInterval(invoices, dateRange.prevStart, dateRange.prevEnd);
    
    const currentPayments = filterByInterval(payments, dateRange.start, dateRange.end);
    const currentExpenses = filterByInterval(expenses, dateRange.start, dateRange.end);

    const calculateTotals = (invs: Invoice[]) => {
      return invs.reduce((acc, inv) => {
        let profit = 0;
        inv.items.forEach(item => {
          profit += (item.price - (item.costPrice || 0)) * item.quantity;
        });
        return {
          revenue: acc.revenue + inv.total,
          profit: acc.profit + profit
        };
      }, { revenue: 0, profit: 0 });
    };

    const currentTotals = calculateTotals(currentInvoices);
    const prevTotals = calculateTotals(prevInvoices);

    const inflow = currentPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const outflow = currentExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    const outstandingCredit = invoices.reduce((acc, inv) => acc + (inv.creditAmount || 0), 0);
    const overdueCredit = invoices.filter(inv => {
      const credit = inv.creditAmount || 0;
      if (credit <= 0) return false;
      const date = new Date(inv.date).getTime();
      return (Date.now() - date) > 30 * 24 * 60 * 60 * 1000;
    }).reduce((acc, inv) => acc + (inv.creditAmount || 0), 0);

    const trendData: any[] = [];
    if (timeRange === 'day') {
      const hours = eachHourOfInterval({ start: dateRange.start, end: dateRange.end });
      hours.forEach(hour => {
        const hourInvoices = currentInvoices.filter(inv => isSameHour(new Date(inv.date), hour));
        const totals = calculateTotals(hourInvoices);
        trendData.push({
          name: format(hour, 'HH:mm'),
          revenue: totals.revenue,
          profit: totals.profit
        });
      });
    } else if (timeRange === 'year') {
      const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
      months.forEach(month => {
        const monthInvoices = currentInvoices.filter(inv => isSameMonth(new Date(inv.date), month));
        const totals = calculateTotals(monthInvoices);
        trendData.push({
          name: format(month, 'MMM'),
          revenue: totals.revenue,
          profit: totals.profit
        });
      });
    } else {
      const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
      days.forEach(day => {
        const dayInvoices = currentInvoices.filter(inv => isSameDay(new Date(inv.date), day));
        const totals = calculateTotals(dayInvoices);
        trendData.push({
          name: format(day, 'dd MMM'),
          revenue: totals.revenue,
          profit: totals.profit
        });
      });
    }

    const expenseCategories = new Map<string, number>();
    expenses.forEach(exp => {
      const cat = exp.category || 'Other';
      expenseCategories.set(cat, (expenseCategories.get(cat) || 0) + exp.amount);
    });
    const expenseData = Array.from(expenseCategories.entries()).map(([name, value]) => ({ name, value }));

    const productStats = new Map<string, { name: string; sales: number; revenue: number; profit: number }>();
    currentInvoices.forEach(inv => {
      inv.items.forEach(item => {
        const existing = productStats.get(item.productId) || { name: item.name, sales: 0, revenue: 0, profit: 0 };
        productStats.set(item.productId, {
          ...existing,
          sales: existing.sales + item.quantity,
          revenue: existing.revenue + item.total,
          profit: existing.profit + (item.price - (item.costPrice || 0)) * item.quantity
        });
      });
    });
    const topProducts = Array.from(productStats.values()).sort((a, b) => b.profit - a.profit).slice(0, 5);

    const customerStats = new Map<string, { name: string; revenue: number; credit: number; lastPurchase: number }>();
    invoices.forEach(inv => {
      const existing = customerStats.get(inv.customerName) || { name: inv.customerName, revenue: 0, credit: 0, lastPurchase: 0 };
      customerStats.set(inv.customerName, {
        ...existing,
        revenue: existing.revenue + inv.total,
        credit: existing.credit + (inv.creditAmount || 0),
        lastPurchase: Math.max(existing.lastPurchase, inv.date)
      });
    });
    const topCustomers = Array.from(customerStats.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const aging = {
      '0-30 Days': 0,
      '31-60 Days': 0,
      '61-90 Days': 0,
      '90+ Days': 0
    };
    invoices.forEach(inv => {
      if ((inv.creditAmount || 0) > 0) {
        const days = Math.floor((Date.now() - inv.date) / (1000 * 60 * 60 * 24));
        if (days <= 30) aging['0-30 Days'] += inv.creditAmount;
        else if (days <= 60) aging['31-60 Days'] += inv.creditAmount;
        else if (days <= 90) aging['61-90 Days'] += inv.creditAmount;
        else aging['90+ Days'] += inv.creditAmount;
      }
    });
    const agingData = Object.entries(aging).map(([name, value]) => ({ name, value }));

    return {
      currentTotals,
      prevTotals,
      inflow,
      outflow,
      outstandingCredit,
      overdueCredit,
      trendData,
      expenseData,
      topProducts,
      topCustomers,
      agingData
    };
  }, [invoices, payments, expenses, dateRange, timeRange, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-slate-900/10 border-t-slate-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!analytics) return null;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Business Analytics</h1>
          <p className="text-slate-500 mt-1 text-sm">Comprehensive performance report for your business.</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          {(['day', 'week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                timeRange === range 
                  ? "bg-slate-900 text-white shadow-lg" 
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Revenue"
          value={analytics.currentTotals.revenue}
          prevValue={analytics.prevTotals.revenue}
          icon={TrendingUp}
          color="blue"
        />
        <SummaryCard
          title="Net Profit"
          value={analytics.currentTotals.profit}
          prevValue={analytics.prevTotals.profit}
          icon={IndianRupee}
          color="emerald"
        />
        <SummaryCard
          title="Outstanding Credit"
          value={analytics.outstandingCredit}
          prevValue={0}
          icon={AlertCircle}
          color="amber"
        />
        <SummaryCard
          title="Profit Margin"
          value={analytics.currentTotals.revenue > 0 ? (analytics.currentTotals.profit / analytics.currentTotals.revenue) * 100 : 0}
          prevValue={analytics.prevTotals.revenue > 0 ? (analytics.prevTotals.profit / analytics.prevTotals.revenue) * 100 : 0}
          icon={PieChartIcon}
          color="blue"
          isCurrency={false}
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-slate-900">Revenue & Profit Trend</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Profit</span>
              </div>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.trendData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-8">Cash Flow</h3>
          <div className="space-y-6">
            <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-xl">
                  <ArrowDownLeft size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Inflow</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(analytics.inflow)}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500 text-white rounded-xl">
                  <ArrowUpRight size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Outflow</p>
                  <p className="text-lg font-bold text-red-700">{formatCurrency(analytics.outflow)}</p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-slate-500">Net Cash Flow</p>
                <p className={cn(
                  "text-xl font-bold",
                  analytics.inflow - analytics.outflow >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {formatCurrency(analytics.inflow - analytics.outflow)}
                </p>
              </div>
            </div>
          </div>
          <div className="h-40 mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Inflow', value: analytics.inflow },
                { name: 'Outflow', value: analytics.outflow }
              ]}>
                <XAxis dataKey="name" hide />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {[{ name: 'Inflow', value: analytics.inflow }, { name: 'Outflow', value: analytics.outflow }].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
            <BarChart3 size={20} className="text-slate-400" />
            Top Profitable Products
          </h3>
          <div className="space-y-6">
            {analytics.topProducts.map((product, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-slate-400 text-sm">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-bold text-slate-900">{product.name}</span>
                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(product.profit)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(product.profit / (analytics.topProducts[0]?.profit || 1)) * 100}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{product.sales} Units Sold</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rev: {formatCurrency(product.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
            {analytics.topProducts.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                No product data available for this period.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
            <PieChartIcon size={20} className="text-slate-400" />
            Expense Breakdown
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {analytics.expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), '']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {analytics.expenseData.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-xs font-bold text-slate-500 truncate">{item.name}</span>
                <span className="text-xs font-bold text-slate-900 ml-auto">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
            <Users size={20} className="text-slate-400" />
            Top Customers by Revenue
          </h3>
          <div className="space-y-4">
            {analytics.topCustomers.map((customer, i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                    {customer.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{customer.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Last purchase: {new Date(customer.lastPurchase).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(customer.revenue)}</p>
                  {customer.credit > 0 && (
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Credit: {formatCurrency(customer.credit)}</p>
                  )}
                </div>
              </div>
            ))}
            {analytics.topCustomers.length === 0 && (
              <div className="py-12 text-center text-slate-400">
                No customer data available.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
            <Calendar size={20} className="text-slate-400" />
            Credit Aging Analysis
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                  tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
            <div className="p-2 bg-amber-500 text-white rounded-xl h-fit">
              <Info size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900 mb-1">Credit Risk Alert</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                You have {formatCurrency(analytics.overdueCredit)} in credit that is more than 30 days old. Consider sending reminders to these customers to maintain healthy cash flow.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <TrendingUpIcon size={24} className="text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold">Smart Business Insights</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Revenue Insight</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {analytics.currentTotals.revenue > analytics.prevTotals.revenue 
                  ? `Your revenue is up by ${((analytics.currentTotals.revenue - analytics.prevTotals.revenue) / (analytics.prevTotals.revenue || 1) * 100).toFixed(1)}% compared to the previous period. Great job!`
                  : "Revenue is lower than the previous period. Consider running a promotion or checking your top-selling products."}
              </p>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">Cash Flow Insight</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {analytics.inflow > analytics.outflow 
                  ? "Your cash inflow is positive. This is a good time to reinvest in inventory or clear any outstanding debts."
                  : "Your outflow exceeds inflow. Review your expenses and prioritize collecting outstanding payments."}
              </p>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-2">Inventory Insight</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                {analytics.topProducts.length > 0 
                  ? `Product "${analytics.topProducts[0].name}" is your highest profit generator. Ensure you maintain optimal stock levels for it.`
                  : "Add more products and record sales to get detailed inventory insights."}
              </p>
            </div>
          </div>
        </div>

        <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
          <BarChart3 size={400} />
        </div>
      </div>
    </div>
  );
}
