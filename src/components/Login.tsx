import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Package, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { googleProvider } from '../lib/firebase';

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

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        // Create user profile if it doesn't exist
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          username: user.email?.split('@')[0].replace(/[^a-z0-9]/g, '') || `user${Math.floor(Math.random() * 10000)}`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

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

          {!forgotPassword && (
            <div className="relative flex items-center gap-4 py-2">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">or continue with</span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>
          )}

          {!forgotPassword && (
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              disabled={loading}
              className="w-full bg-white text-slate-700 py-3 rounded-xl font-bold flex items-center justify-center gap-3 border border-slate-200 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          )}

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
