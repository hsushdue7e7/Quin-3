import { useState, useMemo, useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Invoice, type Payment, UserRole } from '../db';
import { WhatsAppIcon } from './WhatsAppIcon';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Users, 
  Search, 
  ChevronRight, 
  History, 
  IndianRupee, 
  Calendar,
  ArrowLeft,
  FileText,
  TrendingUp,
  Printer,
  PlusCircle,
  CreditCard,
  Banknote,
  Wallet,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PrintModal } from './PrintModal';
import { InvoiceView } from './InvoiceView';
import { domToPng } from 'modern-screenshot';
import { getInvoices, getPayments, getProfile, addPayment, updateInvoice, type Profile as ProfileType } from '../lib/firestore';

export function Customers({ 
  user, 
  ownerId,
  role,
  initialShowPaymentModal,
  onPaymentModalClose
}: { 
  user: FirebaseUser;
  ownerId: string;
  role: UserRole | null;
  initialShowPaymentModal?: boolean;
  onPaymentModalClose?: () => void;
}) {
  const canTakePayment = role === 'admin' || role === 'sales_manager';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState<string | null>(null);
  const hiddenInvoiceRef = useRef<HTMLDivElement>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(initialShowPaymentModal || false);
  const [paymentModalCustomer, setPaymentModalCustomer] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [paymentNote, setPaymentNote] = useState('');
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<ProfileType | null>(null);

  useEffect(() => {
    if (initialShowPaymentModal) {
      setShowPaymentModal(true);
      setPaymentModalCustomer(null);
    }
  }, [initialShowPaymentModal]);

  const handleOpenPaymentModal = () => {
    setPaymentModalCustomer(selectedCustomer);
    setShowPaymentModal(true);
  };

  useEffect(() => {
    const fetchData = async () => {
      const [invs, pays, prof] = await Promise.all([
        getInvoices(ownerId),
        getPayments(ownerId),
        getProfile(ownerId)
      ]);
      setInvoices(invs);
      setPayments(pays);
      setProfile(prof);
    };
    fetchData();
  }, [ownerId]);

  const customerData = useMemo(() => {
    if (!invoices) return [];

    const customers = new Map<string, { 
      name: string; 
      mobile?: string;
      totalSales: number; 
      totalCredit: number; 
      invoiceCount: number; 
      lastPurchase: number; 
      invoices: Invoice[];
      payments: Payment[];
    }>();

    invoices.forEach(inv => {
      let key = inv.customerMobile || inv.customerName;
      
      // If we have a mobile, check if there's an existing entry with just the name
      if (inv.customerMobile && customers.has(inv.customerName)) {
        const existing = customers.get(inv.customerName)!;
        customers.delete(inv.customerName);
        existing.mobile = inv.customerMobile;
        customers.set(inv.customerMobile, existing);
        key = inv.customerMobile;
      } else if (!inv.customerMobile) {
        // Try to find if this customer already exists with a mobile number
        for (const [existingKey, data] of customers.entries()) {
          if (data.name === inv.customerName) {
            key = existingKey;
            break;
          }
        }
      }

      const current = customers.get(key) || { 
        name: inv.customerName, 
        mobile: inv.customerMobile,
        totalSales: 0, 
        totalCredit: 0, 
        invoiceCount: 0,
        lastPurchase: 0,
        invoices: [],
        payments: []
      };

      customers.set(key, {
        ...current,
        totalSales: current.totalSales + inv.total,
        totalCredit: current.totalCredit + (inv.creditAmount || 0),
        invoiceCount: current.invoiceCount + 1,
        lastPurchase: Math.max(current.lastPurchase, inv.date),
        invoices: [...current.invoices, inv].sort((a, b) => b.date - a.date)
      });
    });

    // Add payments to customer data
    if (payments) {
      payments.forEach(p => {
        // Find customer by mobile or name
        let customerKey = '';
        for (const [key, data] of customers.entries()) {
          if ((p.customerMobile && data.mobile === p.customerMobile) || data.name === p.customerName) {
            customerKey = key;
            break;
          }
        }
        
        if (customerKey) {
          const current = customers.get(customerKey)!;
          customers.set(customerKey, {
            ...current,
            payments: [...current.payments, p].sort((a, b) => b.date - a.date)
          });
        }
      });
    }

    return Array.from(customers.values()).sort((a, b) => b.totalSales - a.totalSales);
  }, [invoices, payments]);

  const filteredCustomers = customerData.filter(c => 
    String(c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.mobile || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCustomerData = useMemo(() => {
    if (!selectedCustomer) return null;
    return customerData.find(c => (c.mobile || c.name) === selectedCustomer);
  }, [selectedCustomer, customerData]);

  const handlePrint = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setShowPrintModal(true);
  };

  const handleShareImage = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsSharingImage(inv.id || 'temp');
    
    setTimeout(async () => {
      if (!hiddenInvoiceRef.current) {
        setIsSharingImage(null);
        return;
      }
      
      try {
        const dataUrl = await domToPng(hiddenInvoiceRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          width: 800
        });
        
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

  const sendReminder = (customer: any) => {
    const oldestInvoice = customer.invoices.filter((inv: Invoice) => inv.creditAmount > 0).sort((a: Invoice, b: Invoice) => a.date - b.date)[0];
    const dueDate = oldestInvoice.date + 30 * 24 * 60 * 60 * 1000;
    const daysOverdue = Math.floor((Date.now() - dueDate) / (1000 * 60 * 60 * 24));
    
    let tone = 'Friendly';
    if (daysOverdue >= 0) {
      tone = 'Urgent';
    }
    if (daysOverdue >= 7) {
      tone = 'Firm';
    }

    const businessName = profile?.businessName || 'Our Business';
    const amount = formatCurrency(customer.totalCredit);
    const dueDateStr = new Date(dueDate).toLocaleDateString();
    
    let message = '';
    if (tone === 'Friendly') {
      message = `Hi ${customer.name}! Just a gentle reminder from ${businessName}. Your payment of ${amount} is due on ${dueDateStr}. You can pay here: [Payment Link]. Thank you!`;
    } else if (tone === 'Urgent') {
      message = `Hi ${customer.name}, this is a reminder from ${businessName} that your payment of ${amount} is due today. Please settle it here to avoid any inconvenience: [Payment Link]. Thank you!`;
    } else {
      message = `Hi ${customer.name}, your payment of ${amount} to ${businessName} is now ${daysOverdue} days overdue. Please clear this balance immediately via: [Payment Link]. Thank you.`;
    }

    const whatsappUrl = `https://wa.me/${customer.mobile || ''}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    onPaymentModalClose?.();
  };

  const handleRecordPayment = async () => {
    if (!paymentModalCustomer || !paymentAmount || isNaN(parseFloat(paymentAmount))) return;

    const amount = parseFloat(paymentAmount);
    
    // Find selected customer data
    let customerDataToUse = customerData.find(c => (c.mobile || c.name) === paymentModalCustomer);
    
    if (!customerDataToUse) return;

    // 1. Record the payment
    await addPayment({
      userId: ownerId,
      customerName: customerDataToUse.name,
      customerMobile: customerDataToUse.mobile,
      amount,
      date: Date.now(),
      method: paymentMethod,
      note: paymentNote,
      createdBy: user.uid,
      staffName: user.displayName || user.email?.split('@')[0] || 'Staff'
    });

    // 2. Update invoices to reduce credit (oldest first)
    let remainingPayment = amount;
    const customerInvoices = invoices
      .filter(inv => (inv.customerMobile || inv.customerName) === paymentModalCustomer && inv.creditAmount > 0)
      .sort((a, b) => a.date - b.date);

    for (const inv of customerInvoices) {
      if (remainingPayment <= 0) break;

      const reduction = Math.min(inv.creditAmount, remainingPayment);
      await updateInvoice(inv.id!.toString(), {
        creditAmount: inv.creditAmount - reduction,
        receivedAmount: inv.receivedAmount + reduction
      });
      remainingPayment -= reduction;
    }

    // Refresh data
    const [invs, pays] = await Promise.all([
      getInvoices(ownerId),
      getPayments(ownerId)
    ]);
    setInvoices(invs);
    setPayments(pays);

    // Reset form
    setPaymentAmount('');
    setPaymentNote('');
    handleClosePaymentModal();
  };

  const renderPaymentModal = () => {
    if (!showPaymentModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-900">Record Payment</h3>
            <button onClick={handleClosePaymentModal} className="text-slate-400 hover:text-slate-600">
              <ArrowLeft size={20} />
            </button>
          </div>
          <div className="p-8 space-y-6">
            {!selectedCustomer && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Select Customer</label>
                <select
                  value={paymentModalCustomer || ''}
                  onChange={(e) => setPaymentModalCustomer(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 transition-all"
                >
                  <option value="" disabled>Select a customer...</option>
                  {customerData.filter(c => c.totalCredit > 0).map(c => (
                    <option key={c.mobile || c.name} value={c.mobile || c.name}>
                      {c.name} (Credit: {formatCurrency(c.totalCredit)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Payment Amount</label>
              <div className="relative">
                <IndianRupee size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 transition-all"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                {(['cash', 'card', 'upi', 'other'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all font-bold text-sm capitalize",
                      paymentMethod === method 
                        ? "bg-slate-900 border-slate-900 text-white" 
                        : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                    )}
                  >
                    {method === 'cash' && <Banknote size={16} />}
                    {method === 'card' && <CreditCard size={16} />}
                    {method === 'upi' && <Wallet size={16} />}
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Note (Optional)</label>
              <textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                rows={2}
                className="w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 transition-all resize-none"
                placeholder="Add a note..."
              />
            </div>

            <div className="flex gap-4 pt-2">
              <button
                onClick={handleClosePaymentModal}
                className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg"
              >
                Record Payment
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  if (selectedCustomer && selectedCustomerData) {
    return (
      <div className="space-y-6">
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
        <button 
          onClick={() => setSelectedCustomer(null)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium"
        >
          <ArrowLeft size={18} />
          Back to Customers
        </button>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
              <Users size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{selectedCustomerData.name}</h1>
              <p className="text-slate-500 text-sm">Customer since {new Date(selectedCustomerData.invoices[selectedCustomerData.invoices.length - 1].date).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[140px]">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sales</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(selectedCustomerData.totalSales)}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl border border-red-100 min-w-[140px]">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Total Credit</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(selectedCustomerData.totalCredit)}</p>
            </div>
            {selectedCustomerData.totalCredit > 0 && canTakePayment && (
              <button
                onClick={handleOpenPaymentModal}
                className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
              >
                <PlusCircle size={20} />
                Record Payment
              </button>
            )}
          </div>
        </div>

        {renderPaymentModal()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <History size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Purchase History</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {selectedCustomerData.invoices.map((inv) => (
                <div key={inv.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                      <FileText size={24} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                      <div className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <Calendar size={14} />
                        {new Date(inv.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Items</p>
                      <p className="font-bold text-slate-900">{inv.items.length}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                      <p className="font-bold text-slate-900">{formatCurrency(inv.total)}</p>
                    </div>
                    <div className="text-right min-w-[100px]">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                      {inv.creditAmount > 0 ? (
                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                          Credit: {formatCurrency(inv.creditAmount)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          Paid
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePrint(inv)}
                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Print Sale/Invoice"
                      >
                        <Printer size={18} />
                      </button>
                      <button
                        onClick={() => handleShareImage(inv)}
                        disabled={isSharingImage === inv.id}
                        className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Send on WhatsApp"
                      >
                        {isSharingImage === inv.id ? (
                          <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        ) : (
                          <WhatsAppIcon size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                <Banknote size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Payment History</h2>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {selectedCustomerData.payments?.map((p: Payment) => (
                <div key={p.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                      <PlusCircle size={24} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{formatCurrency(p.amount)}</div>
                      <div className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <Calendar size={14} />
                        {new Date(p.date).toLocaleDateString()}
                        <span className="mx-1">•</span>
                        <span className="capitalize">{p.method}</span>
                      </div>
                      {p.note && <p className="text-xs text-slate-400 mt-1 italic">"{p.note}"</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wider">
                      Received
                    </span>
                  </div>
                </div>
              ))}
              {(!selectedCustomerData.payments || selectedCustomerData.payments.length === 0) && (
                <div className="p-12 text-center text-slate-400">
                  No payment history recorded.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Customer Directory</h1>
          <p className="text-slate-500 mt-1 text-sm">View and manage your customer relationships and history.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or mobile..."
            className="w-full pl-10 pr-4 py-3 bg-white border-slate-200 rounded-2xl focus:ring-2 focus:ring-slate-900 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {renderPaymentModal()}
        {filteredCustomers.map((customer, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelectedCustomer(customer.mobile || customer.name)}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-900 transition-all text-left group relative overflow-hidden cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <Users size={20} />
              </div>
              <div className="flex flex-col gap-2">
                <div className="bg-slate-50 p-1.5 rounded-lg text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                  <ChevronRight size={16} />
                </div>
                {customer.totalCredit > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); sendReminder(customer); }}
                    className="bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors flex items-center gap-1"
                  >
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
                      alt="WhatsApp" 
                      className="w-3 h-3" 
                      referrerPolicy="no-referrer"
                    />
                    Reminder
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-0.5">
              <h3 className="text-lg font-bold text-slate-900 truncate">{customer.name}</h3>
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest">
                {customer.invoiceCount} {customer.invoiceCount === 1 ? 'Sale/Invoice' : 'Sales/Invoices'}
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Sales</p>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(customer.totalSales)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest mb-0.5">Credit</p>
                <p className={cn("text-sm font-bold", customer.totalCredit > 0 ? "text-red-600" : "text-slate-300")}>
                  {formatCurrency(customer.totalCredit)}
                </p>
              </div>
            </div>

            {/* Background decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <TrendingUp size={120} />
            </div>
            </motion.div>
        ))}

        {filteredCustomers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Users size={40} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No customers found</h3>
            <p className="text-slate-500 text-sm">Try searching with a different name or mobile number.</p>
          </div>
        )}
      </div>
      {/* Hidden Invoice for Image Generation */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        {isSharingImage && selectedInvoice && (
          <div 
            ref={hiddenInvoiceRef} 
            className="bg-white w-[210mm] min-h-[297mm] p-0"
          >
            <InvoiceView invoice={selectedInvoice} profile={profile || undefined} theme={profile?.invoiceTheme || 'modern'} />
          </div>
        )}
      </div>
    </div>
  );
}
