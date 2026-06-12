import { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Invoice, type Payment, type Expense, type Staff, UserRole } from '../db';
import { formatCurrency } from '../lib/utils';
import { 
  Receipt, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Search, 
  Filter,
  Calendar,
  CreditCard,
  Banknote,
  Smartphone,
  MoreHorizontal,
  Printer,
  Edit2,
  TrendingDown,
  Split
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { getInvoices, getPayments, getExpenses, getQuotations, getStaff } from '../lib/firestore';

type TransactionType = 'all' | 'sale' | 'payment' | 'expense' | 'quotation';

export function Transactions({ 
  user,
  ownerId,
  role,
  onEditInvoice 
}: { 
  user: FirebaseUser;
  ownerId: string;
  role: UserRole | null;
  onEditInvoice?: (id: string, isQuotation?: boolean) => void;
}) {
  const [filter, setFilter] = useState<TransactionType>('all');
  const [search, setSearch] = useState('');
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  const showExpenses = role === 'admin' || role === 'ca' || role === 'sales_manager';
  const showSales = role === 'admin' || role === 'sales_manager' || role === 'ca';
  const showPayments = role === 'admin' || role === 'sales_manager' || role === 'ca';

  useEffect(() => {
    const fetchData = async () => {
      const promises: Promise<any>[] = [];
      if (showSales) {
        promises.push(getInvoices(ownerId));
        promises.push(getQuotations(ownerId));
      } else {
        promises.push(Promise.resolve([]));
        promises.push(Promise.resolve([]));
      }

      if (showPayments) promises.push(getPayments(ownerId));
      else promises.push(Promise.resolve([]));

      if (showExpenses) promises.push(getExpenses(ownerId));
      else promises.push(Promise.resolve([]));

      promises.push(getStaff(ownerId).catch(() => []));

      const [invs, quots, pays, exps, staff] = await Promise.all(promises);
      setInvoices(invs);
      setQuotations(quots);
      setPayments(pays);
      setExpenses(exps);
      setStaffList(staff || []);
    };
    fetchData();
  }, [ownerId, showSales, showPayments, showExpenses]);

  const getStaffDisplayName = (createdByUid?: string, defaultStaffName?: string) => {
    if (!createdByUid) return defaultStaffName || 'Admin';
    if (createdByUid === ownerId) return 'Admin';
    const staff = staffList.find(s => s.uid === createdByUid);
    return staff ? staff.name : (defaultStaffName || 'Admin');
  };

  const allTransactions = [
    ...(showSales ? invoices.map(inv => ({
      id: `inv-${inv.id}`,
      originalId: inv.id,
      type: 'sale' as const,
      customerName: inv.customerName,
      amount: inv.total,
      creditAmount: inv.creditAmount,
      date: inv.date,
      reference: inv.invoiceNumber,
      method: inv.paymentMethod === 'split' ? 'Split' : (inv.paymentMethod || (inv.creditAmount > 0 ? 'Partial' : 'Paid')),
      status: inv.creditAmount > 0 ? 'Partial' : 'Paid',
      staffName: inv.staffName,
      createdBy: inv.createdBy
    })) : []),
    ...(showSales ? quotations.map(inv => ({
      id: `quot-${inv.id}`,
      originalId: inv.id,
      type: 'quotation' as const,
      customerName: inv.customerName,
      amount: inv.total,
      creditAmount: 0,
      date: inv.date,
      reference: inv.invoiceNumber,
      method: 'Quote',
      status: 'Quote',
      staffName: inv.staffName,
      createdBy: inv.createdBy
    })) : []),
    ...(showPayments ? payments.map(p => ({
      id: `pay-${p.id}`,
      originalId: p.id,
      type: 'payment' as const,
      customerName: p.customerName,
      amount: p.amount,
      creditAmount: 0,
      date: p.date,
      reference: p.invoiceNumber ? `Invoice ${p.invoiceNumber}` : 'Payment Received',
      method: p.method,
      status: 'Received',
      staffName: p.staffName,
      createdBy: p.createdBy
    })) : []),
    ...(showExpenses ? expenses.map(e => ({
      id: `exp-${e.id}`,
      originalId: e.id,
      type: 'expense' as const,
      customerName: e.category,
      amount: e.amount,
      creditAmount: 0,
      date: e.date,
      reference: e.description || 'Expense',
      method: e.paymentMethod,
      status: 'Paid',
      staffName: e.staffName,
      createdBy: e.createdBy
    })) : [])
  ].sort((a, b) => b.date - a.date);

  const filteredTransactions = allTransactions.filter(t => {
    // Only show quotations if the filter is explicitly set to 'quotation'
    // This keeps quotations out of the "all" transactions view as requested
    const matchesFilter = filter === 'quotation' ? t.type === 'quotation' : (filter === 'all' ? t.type !== 'quotation' : t.type === filter);
    const matchesSearch = String(t.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
                         String(t.reference || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalSales = invoices.filter(inv => inv.type !== 'quotation').reduce((sum, inv) => sum + inv.total, 0);
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-slate-500 text-sm">History of all sales and payments received.</p>
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex-wrap">
          {(['all', 'sale', 'quotation', 'payment', 'expense'] as TransactionType[])
            .filter(t => {
              if (t === 'expense') return showExpenses;
              if (t === 'sale' || t === 'quotation') return showSales;
              if (t === 'payment') return showPayments;
              return true;
            })
            .map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                filter === t 
                  ? "bg-slate-900 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              {t === 'all' ? 'All' : t === 'sale' ? 'Sales' : t === 'quotation' ? 'Quotes' : t === 'payment' ? 'Payments' : 'Expenses'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <ArrowUpRight size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales (Invoiced)</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalSales)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Payments Received</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPayments)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by customer or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-slate-900 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Staff</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Method</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">
                      {new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(t.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">{t.customerName}</div>
                    <div className="text-xs text-slate-500">{t.reference}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-medium text-slate-600">
                      {getStaffDisplayName(t.createdBy, t.staffName)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      t.type === 'sale' 
                        ? "bg-blue-50 text-blue-600" 
                        : t.type === 'quotation'
                          ? "bg-purple-50 text-purple-600"
                          : t.type === 'payment'
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-600"
                    )}>
                      {t.type === 'sale' ? <ArrowUpRight size={10} /> : t.type === 'quotation' ? <Receipt size={10} /> : t.type === 'payment' ? <ArrowDownLeft size={10} /> : <TrendingDown size={10} />}
                      {t.type === 'sale' ? 'Sale' : t.type === 'quotation' ? 'Quote' : t.type === 'payment' ? 'Payment' : 'Expense'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      {(t.method === 'Cash' || t.method === 'cash') && <Banknote size={14} />}
                      {(t.method === 'Card' || t.method === 'card') && <CreditCard size={14} />}
                      {(t.method === 'UPI' || t.method === 'upi') && <Smartphone size={14} />}
                      {(t.method === 'Other' || t.method === 'other') && <MoreHorizontal size={14} />}
                      {t.method === 'Split' && <Split size={14} />}
                      <span className="text-xs font-medium capitalize">{t.method}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "text-sm font-bold",
                      t.type === 'sale' ? "text-slate-900" : (t.type === 'quotation' ? "text-slate-500" : "text-emerald-600")
                    )}>
                      {t.type === 'payment' ? '+' : ''}{formatCurrency(t.amount)}
                    </div>
                    {t.type === 'sale' && t.creditAmount > 0 && (
                      <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-0.5">
                        Credit: {formatCurrency(t.creditAmount)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      t.status === 'Paid' || t.status === 'Received' ? "text-emerald-500" : "text-amber-500"
                    )}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {(t.type === 'sale' || t.type === 'quotation') && (role === 'admin' || role === 'sales_manager') && (
                      <button
                        onClick={() => onEditInvoice?.(t.originalId as string, t.type === 'quotation')}
                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                        title={t.type === 'quotation' ? "Edit Quotation" : "Edit Sale/Invoice"}
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">
                    No transactions found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
