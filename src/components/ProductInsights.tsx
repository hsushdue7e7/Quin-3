import React, { useState, useMemo, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart as PieChartIcon, 
  AlertTriangle, 
  Zap, 
  Calendar, 
  Target, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  Package,
  Clock,
  ChevronRight,
  Lightbulb,
  Search,
  Filter,
  Download,
  Share2,
  Sparkles,
  Check,
  Users
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
  subDays, 
  eachDayOfInterval,
  isSameDay
} from 'date-fns';
import { getInvoices, getInventoryProducts } from '../lib/firestore';
import { type Invoice, type Product } from '../db';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// --- Logic Helpers ---

/**
 * Perform statistical analysis to find trends
 */
const analyzeTrend = (data: number[]) => {
  if (data.length < 2) return { growth: 0, status: 'stable' };
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const growth = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  return {
    growth,
    status: growth > 5 ? 'uptrend' : growth < -5 ? 'downtrend' : 'stable'
  };
};

/**
 * Predict future values using simple linear regression or moving average
 */
const predictFuture = (data: { date: number, value: number }[], daysAhead: number) => {
  if (data.length < 3) return null;
  
  // Simple Moving Average implementation for prediction
  const windowSize = Math.min(data.length, 7);
  const recentData = data.slice(-windowSize);
  const avg = recentData.reduce((sum, d) => sum + d.value, 0) / windowSize;
  
  // Growth factor based on last 2 periods
  const last = data[data.length - 1].value;
  const prev = data[data.length - 2].value;
  const momentum = prev > 0 ? (last / prev) : 1;
  const adjustedMomentum = Math.max(0.5, Math.min(1.5, momentum)); // Cap momentum
  
  return avg * adjustedMomentum * (1 + (daysAhead / 30) * 0.1); // Slight heuristic for growth
};

// --- Components ---

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: any;
  color: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'violet';
}

function StatCard({ title, value, subtitle, trend, icon: Icon, color }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    violet: 'bg-violet-50 text-violet-600 border-violet-100',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between", colors[color])}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn("p-3 rounded-2xl", colors[color].split(' ')[0])}>
          <Icon size={24} />
        </div>
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
            trend >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          )}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">{title}</p>
        <p className="text-3xl font-black tracking-tight">{value}</p>
        {subtitle && <p className="text-xs font-semibold opacity-70 mt-1">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

export function ProductInsights({ ownerId, initialProductId, onBack }: { ownerId: string; initialProductId?: string | null; onBack?: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId || null);
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (initialProductId) {
      setSelectedProductId(initialProductId);
    }
  }, [initialProductId]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [invs, prods] = await Promise.all([
          getInvoices(ownerId),
          getInventoryProducts(ownerId)
        ]);
        setInvoices(invs);
        setProducts(prods);
      } catch (err) {
        console.error('Insights Fetch Error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [ownerId]);

  const analytics = useMemo(() => {
    if (!products.length) return null;

    const productStats = new Map<string, any>();
    
    // Initialize stats
    products.forEach(p => {
      productStats.set(p.id!, {
        ...p,
        totalSold: 0,
        revenue: 0,
        profit: 0,
        salesHistory: [],
        costHistory: [],
        customers: new Set(),
        lastSold: 0,
        velocity: 0, // units per day
      });
    });

    // Process Invoices
    invoices.forEach(inv => {
      inv.items.forEach(item => {
        const stats = productStats.get(item.productId);
        if (stats) {
          stats.totalSold += item.quantity;
          stats.revenue += item.total;
          const profit = (item.price - (item.costPrice || 0)) * item.quantity;
          stats.profit += profit;
          stats.salesHistory.push({ date: inv.date, quantity: item.quantity, price: item.price, profit });
          stats.customers.add(inv.customerName);
          if (inv.date > stats.lastSold) stats.lastSold = inv.date;
        }
      });
    });

    // Calculated fields & Enrichment
    const now = Date.now();
    const enrichedProducts = Array.from(productStats.values()).map(p => {
      // Calculate velocity (last 30 days)
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      const recentSales = p.salesHistory.filter((s: any) => s.date > thirtyDaysAgo);
      const recentUnits = recentSales.reduce((sum: number, s: any) => sum + s.quantity, 0);
      const velocity = recentUnits / 30;
      
      const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
      
      // Stockout prediction
      const daysRemaining = velocity > 0 ? Math.floor(p.stock / velocity) : Infinity;
      
      // Health Score (0-100)
      let healthScore = 50;
      if (p.totalSold > 0) healthScore += 10;
      if (margin > 20) healthScore += 10;
      if (velocity > 0.5) healthScore += 10;
      if (p.stock > p.minStock) healthScore += 10;
      if (p.salesHistory.length > 5) healthScore += 10;
      if (daysRemaining < 7) healthScore -= 20;
      if (p.stock <= 0 && p.type !== 'service') healthScore -= 30;

      return {
        ...p,
        velocity,
        margin,
        daysRemaining,
        healthScore: Math.max(0, Math.min(100, healthScore)),
        customerCount: p.customers.size,
        repeatRate: p.totalSold > 0 ? (p.totalSold / Math.max(1, p.customers.size)) : 0
      };
    });

    return {
      all: enrichedProducts,
      topByProfit: [...enrichedProducts].sort((a, b) => b.profit - a.profit).slice(0, 5),
      topByVelocity: [...enrichedProducts].sort((a, b) => b.velocity - a.velocity).slice(0, 5),
      lowStock: enrichedProducts.filter(p => p.type === 'product' && p.stock <= p.minStock),
      deadStock: enrichedProducts.filter(p => p.type === 'product' && p.totalSold === 0 && (now - (p.createdAt || 0)) > 60 * 24 * 60 * 60 * 1000),
      summary: {
        totalRevenue: enrichedProducts.reduce((sum, p) => sum + p.revenue, 0),
        totalProfit: enrichedProducts.reduce((sum, p) => sum + p.profit, 0),
        avgMargin: enrichedProducts.length > 0 ? (enrichedProducts.reduce((sum, p) => sum + p.margin, 0) / enrichedProducts.length) : 0,
        inventoryValue: enrichedProducts.reduce((sum, p) => sum + (p.stock * (p.costPrice || 0)), 0)
      }
    };
  }, [products, invoices]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId || !analytics) return null;
    return analytics.all.find(p => p.id === selectedProductId) || null;
  }, [selectedProductId, analytics]);

  const trends = useMemo(() => {
    if (!selectedProduct) return null;
    
    const rangeDays = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const startDate = subDays(new Date(), rangeDays);
    
    // Group sales by day
    const days = eachDayOfInterval({ start: startDate, end: new Date() });
    const dailyData = days.map(day => {
      const salesOnDay = selectedProduct.salesHistory.filter((s: any) => isSameDay(new Date(s.date), day));
      return {
        date: format(day, 'MMM dd'),
        timestamp: day.getTime(),
        quantity: salesOnDay.reduce((sum: number, s: any) => sum + s.quantity, 0),
        revenue: salesOnDay.reduce((sum: number, s: any) => sum + (s.price * s.quantity), 0),
        profit: salesOnDay.reduce((sum: number, s: any) => sum + s.profit, 0)
      };
    });

    // Prediction logic
    const futureDays = 14;
    const predictionData = [];
    const lastValue = dailyData.slice(-7).reduce((sum, d) => sum + d.quantity, 0) / 7;
    
    for (let i = 1; i <= futureDays; i++) {
      const date = subDays(new Date(), -i);
      predictionData.push({
        date: format(date, 'MMM dd'),
        quantity: predictFuture(dailyData.map(d => ({ date: d.timestamp, value: d.quantity })), i) || lastValue,
        isPrediction: true
      });
    }

    return {
      daily: dailyData,
      forecast: [...dailyData.slice(-7), ...predictionData],
    };
  }, [selectedProduct, timeRange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const filteredProducts = analytics?.all.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => b.healthScore - a.healthScore) || [];

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-indigo-600 transition-all mb-4"
          >
            ← Back to Reports
          </button>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Insight Product</h1>
          <p className="text-slate-500 font-medium">Deep analytics and pattern detection for your data.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search Products..."
              className="w-full pl-11 pr-4 py-3 bg-white border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-600 shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {!selectedProduct ? (
        <>
          {/* Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Insight Revenue"
              value={formatCurrency(analytics?.summary.totalRevenue || 0)}
              subtitle="All products tracked"
              trend={12.5}
              icon={TrendingUp}
              color="indigo"
            />
            <StatCard 
              title="Inventory Value"
              value={formatCurrency(analytics?.summary.inventoryValue || 0)}
              subtitle={`${analytics?.all.length} items`}
              icon={Package}
              color="blue"
            />
            <StatCard 
              title="Avg Gross Margin"
              value={`${(analytics?.summary.avgMargin || 0).toFixed(1)}%`}
              subtitle="Business performance"
              trend={-2.1}
              icon={PieChartIcon}
              color="emerald"
            />
            <StatCard 
              title="Low Stock items"
              value={analytics?.lowStock.length || 0}
              subtitle="Action required"
              icon={AlertTriangle}
              color="rose"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Top Products Lists */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <TrendingUp className="text-indigo-600" size={20} />
                  Top Performers
                </h3>
              </div>
              <div className="space-y-6">
                {analytics?.topByProfit.map((product, i) => (
                  <button 
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className="w-full flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center font-black group-hover:bg-indigo-600 group-hover:text-white transition-all">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">{product.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Profit: {formatCurrency(product.profit)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-emerald-600">+{product.margin.toFixed(0)}%</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Zap className="text-amber-500" size={20} />
                  Sales Velocity
                </h3>
              </div>
              <div className="space-y-6">
                {analytics?.topByVelocity.map((product) => (
                  <button 
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className="w-full flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-black transition-all">
                      <Clock size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">{product.name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-amber-600">
                        {product.velocity.toFixed(1)} units / day
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-xs font-black",
                        product.daysRemaining < 10 ? "text-rose-600" : "text-slate-400"
                      )}>
                        {product.daysRemaining === Infinity ? '∞' : `${product.daysRemaining}d left`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <AlertTriangle className="text-rose-500" size={20} />
                  Dead Stock
                </h3>
              </div>
              <div className="space-y-6">
                {analytics?.deadStock.slice(0, 5).map((product) => (
                  <button 
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className="w-full flex items-center gap-4 group text-left"
                  >
                    <div className="w-10 h-10 bg-rose-50 text-rose-400 rounded-xl flex items-center justify-center font-black transition-all">
                      <Package size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">{product.name}</p>
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                        No sales recently
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-400">Value: {formatCurrency(product.stock * (product.costPrice || 0))}</p>
                    </div>
                  </button>
                ))}
                {analytics?.deadStock.length === 0 && (
                  <div className="py-12 text-center text-slate-400 font-bold">
                    Inventory is healthy!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8">Insights Catalog</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredProducts.map(p => (
                <button 
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className="p-5 rounded-3xl border border-slate-100 hover:border-indigo-600 hover:shadow-xl hover:shadow-indigo-100/50 transition-all text-left bg-slate-50/30 group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 text-indigo-600">
                      <BarChart3 size={20} />
                    </div>
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter",
                      p.healthScore > 80 ? "bg-emerald-100 text-emerald-700" : 
                      p.healthScore > 50 ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"
                    )}>
                      {p.healthScore}% health
                    </div>
                  </div>
                  <p className="font-bold text-slate-900 truncate mb-1 group-hover:text-indigo-600 transition-colors">{p.name}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{p.category}</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Total Profit</p>
                      <p className="text-sm font-black text-slate-900">{formatCurrency(p.profit)}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Detailed View */
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <button 
            onClick={() => setSelectedProductId(null)}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-indigo-600 transition-all px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm w-fit"
          >
            ← Back to All Insights
          </button>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="w-full lg:w-1/3 space-y-6">
              <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-2xl font-black tracking-tight mb-2">{selectedProduct.name}</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mb-8">{selectedProduct.sku}</p>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Health Score</p>
                      <p className="text-2xl font-black text-indigo-400">{selectedProduct.healthScore}%</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Profitability</p>
                      <p className="text-2xl font-black text-emerald-400">{selectedProduct.margin.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-bold text-[10px] uppercase">Units Sold</span>
                      <span className="font-black">{selectedProduct.totalSold}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-bold text-[10px] uppercase">Net Profit</span>
                      <span className="font-black text-emerald-400">{formatCurrency(selectedProduct.profit)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400 font-bold text-[10px] uppercase">Stock Level</span>
                      <span className="font-black">{selectedProduct.stock} {selectedProduct.primaryUnit}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                  <Target size={20} className="text-slate-400" />
                  Cost Price Stats
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Last Cost Price</p>
                    <p className="text-2xl font-black text-slate-900">{formatCurrency(selectedProduct.costPrice || 0)}</p>
                  </div>
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                    <p className="text-[10px] font-black text-indigo-900 uppercase mb-1">Data Fact</p>
                    <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                      Maintained a gross margin of {selectedProduct.margin.toFixed(1)}% through recorded data.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                  <Users size={20} className="text-slate-400" />
                  Customer Base
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Unique Buyers</p>
                    <p className="text-xl font-black text-slate-900">{selectedProduct.customerCount}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Repeat Rate</p>
                    <p className="text-xl font-black text-slate-900">{selectedProduct.repeatRate.toFixed(1)}x</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-8">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Sales Data Trend</h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Historical quantities</p>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                    {(['30d', '90d', '1y'] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => setTimeRange(range)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider",
                          timeRange === range ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trends?.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                      <Tooltip 
                         contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                      />
                      <Area type="monotone" dataKey="quantity" stroke="#6366f1" strokeWidth={4} fill="#6366f1" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-200">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8">Demand Forecast (Heuristic)</h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends?.forecast || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <Tooltip />
                      <Bar dataKey="quantity" radius={[10, 10, 0, 0]}>
                        {(trends?.forecast || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isPrediction ? '#6366f1' : '#cbd5e1'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-white rounded-3xl border border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estimated Sales (7d)</p>
                    <p className="text-2xl font-black text-slate-900">{Math.ceil(selectedProduct.velocity * 7)} Units</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Based on recent sales velocity</p>
                  </div>
                  <div className="p-6 bg-white rounded-3xl border border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stock Status</p>
                    <p className="text-2xl font-black text-slate-900">{selectedProduct.daysRemaining < 30 ? `Critical (${selectedProduct.daysRemaining} days)` : 'Stable'}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Estimated time until stockout</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
