import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { googleProvider } from '../lib/firebase';

export function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setupUserProfile = async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
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
      console.error("Profile Setup Error:", err);
      throw err;
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      await setupUserProfile(result.user);
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-8 text-center text-white">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Package size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Quin B2B</h1>
          <p className="text-slate-400 text-sm">Secure billing & inventory management</p>
        </div>

        <div className="p-8 space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium border border-red-100">{error}</div>}

          <div className="space-y-4">
            <button 
              type="button" 
              onClick={handleGoogleLogin} 
              disabled={loading}
              className="w-full bg-white text-slate-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 border border-slate-200 hover:bg-slate-50 transition-all shadow-md active:scale-95 disabled:opacity-50 relative overflow-hidden"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-slate-400">
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
