import { useState } from 'react';
import { ShieldCheck, ArrowRight, Package, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const getStrength = (password: string) => {
    if (!password) return { label: '', color: 'bg-slate-200' };
    if (password.length < 8) return { label: 'Weak', color: 'bg-red-500' };
    if (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) return { label: 'Strong', color: 'bg-emerald-500' };
    return { label: 'Medium', color: 'bg-amber-500' };
  };

  const strength = getStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const input = username.toLowerCase().trim();
    const email = input.includes('@') ? input : `${input.replace(/[^a-z0-9]/g, '')}@b2b.com`;

    try {
      if (forgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setMessage('Password reset email sent. Please check your inbox.');
      } else if (isSignUp) {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          name,
          username: input.split('@')[0],
          createdAt: Date.now()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-6 text-center text-white">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Package size={24} className="text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{forgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Quin B2B')}</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">{error}</div>}
          {message && <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-sm font-medium border border-emerald-100">{message}</div>}

          {isSignUp && (
            <div className="relative">
              <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 pt-5 pb-2 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Full Name" />
              <label className="absolute left-4 top-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Name</label>
            </div>
          )}

          {!forgotPassword && (
            <div className="relative">
              <input required type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 pt-5 pb-2 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Username or Email" />
              <label className="absolute left-4 top-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Username or Email</label>
            </div>
          )}

          {forgotPassword && (
            <div className="relative">
              <input required type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 pt-5 pb-2 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Username or Email" />
              <label className="absolute left-4 top-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Username or Email</label>
              <p className="text-xs text-slate-500 mt-1">Enter your username or email to receive a password reset link.</p>
            </div>
          )}

          {!forgotPassword && (
            <div className="relative">
              <input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 pt-5 pb-2 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              <label className="absolute left-4 top-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Password</label>
            </div>
          )}

          {isSignUp && !forgotPassword && (
            <>
              <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden"><div className={`h-full transition-all ${strength.color}`} style={{ width: password ? (strength.label === 'Strong' ? '100%' : strength.label === 'Medium' ? '60%' : '30%') : '0%' }}></div></div>
              <p className="text-xs text-slate-500">{strength.label} password</p>
              <input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl" placeholder="Confirm Password" />
            </>
          )}

          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 group disabled:opacity-50">
            {loading ? 'Processing...' : (forgotPassword ? 'Send Reset Link' : (isSignUp ? 'Sign Up' : 'Sign In'))}
            {!loading && <ArrowRight size={18} />}
          </button>

          <div className="text-center mt-2 space-y-2">
            {!forgotPassword && (
              <button type="button" onClick={() => { setForgotPassword(true); setError(''); setMessage(''); }} className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors block w-full">
                Forgot Password?
              </button>
            )}
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setForgotPassword(false); setError(''); setMessage(''); }} className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors block w-full">
              {forgotPassword ? 'Back to Login' : (isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
