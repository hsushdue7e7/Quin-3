import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingDown, X } from 'lucide-react';
import { saveExpense, logActivity } from '../lib/firestore';
import { type Expense } from '../db';
import { User as FirebaseUser } from 'firebase/auth';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  user: FirebaseUser;
  onExpenseAdded: () => void;
}

export function AddExpenseModal({ isOpen, onClose, ownerId, user, onExpenseAdded }: AddExpenseModalProps) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;

    setIsLoading(true);
    try {
      const staffName = user.displayName || user.email?.split('@')[0] || 'Staff';
      await saveExpense({
        userId: ownerId,
        amount: Number(amount),
        category: category as any,
        description,
        paymentMethod,
        date: Date.now(),
        createdBy: user.uid,
        staffName
      } as Expense);

      // Log activity
      await logActivity({
        userId: ownerId,
        staffId: user.uid,
        staffName,
        action: `Added expense: ${category}`,
        details: `Amount: ${amount}, Method: ${paymentMethod}${description ? `, Note: ${description}` : ''}`,
        type: 'expense',
        timestamp: Date.now()
      });

      onExpenseAdded();
      onClose();
    } catch (error) {
      console.error("Error saving expense:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 text-rose-600">
                <TrendingDown size={32} />
                <h2 className="text-xl font-bold text-slate-900">Add Expense</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 outline-none"
                required
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                required
              >
                <option value="" disabled>Select Category</option>
                {['Rent', 'Utilities', 'Supplies', 'Marketing', 'Salaries', 'Other'].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                required
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 outline-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
              >
                {isLoading ? 'Saving...' : 'Save Expense'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
