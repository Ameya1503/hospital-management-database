import React, { useState } from 'react';
import { LoaderCircle, KeyRound, UserCircle, ArrowLeft } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const StaffLogin = ({ role, onLoginSuccess }) => {
  // --- 1. LOGIN STATE ---
  const [identifier, setIdentifier] = useState(''); // Handles both Email & ID
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- 2. FORGOT PASSWORD STATE ---
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // --- 3. COMPILER-SAFE THEME ---
  // Tailwind needs full class strings to compile properly.
  const theme = role === 'Doctor' ? {
    bg: 'bg-indigo-600',
    hoverBg: 'hover:bg-indigo-700',
    text: 'text-indigo-600',
    textHover: 'hover:text-indigo-800',
    ring: 'focus:ring-indigo-500',
    shadow: 'shadow-indigo-200'
  } : {
    bg: 'bg-emerald-600',
    hoverBg: 'hover:bg-emerald-700',
    text: 'text-emerald-600',
    textHover: 'hover:text-emerald-800',
    ring: 'focus:ring-emerald-500',
    shadow: 'shadow-emerald-200'
  };

  // --- HANDLER: LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, id: identifier, password }),
      });

      if (!response.ok) {
          let errorMsg = 'Login failed.';
          try {
              const errorData = await response.json();
              errorMsg = errorData.error || errorMsg;
          } catch (jsonErr) {
              throw new Error('Server returned HTML instead of JSON. Check backend routing!');
          }
          throw new Error(errorMsg);
      }

      const result = await response.json();

      // --- 🔴 THE FIX: Ensure we save it as 'token' so api.js can find it ---
      localStorage.setItem('token', result.token);
      localStorage.setItem('user_id', result.user.id);
      localStorage.setItem('user_name', result.user.name);
      localStorage.setItem('user_role', result.user.role);

      onLoginSuccess(role, result.user.id, result.user.name);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- HANDLER: SEND RESET OTP ---
  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    setResetMessage('');
    setIsSendingOtp(true);
    try {
        const res = await fetch(`${API_BASE_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, role })
        });
        
        if (!res.ok) {
             const data = await res.json().catch(() => ({ error: 'Failed to send OTP' }));
             throw new Error(data.error);
        }
        
        setResetStep(2);
        setResetMessage('OTP sent to your email!');
    } catch (err) {
        setResetMessage(err.message || 'Failed to send OTP.');
    } finally {
        setIsSendingOtp(false);
    }
  };

  // --- HANDLER: SET NEW PASSWORD ---
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMessage('');
    setIsResetting(true);
    try {
        const res = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword: resetNewPassword, role })
        });
        
        if (!res.ok) {
             const data = await res.json().catch(() => ({ error: 'Failed to reset password' }));
             throw new Error(data.error);
        }
        
        alert("Password Reset Successfully! Please log in.");
        setIsForgotPassword(false);
        setResetStep(1);
        setResetEmail('');
        setResetOtp('');
        setResetNewPassword('');
    } catch (err) {
        setResetMessage(err.message || 'Failed to reset password.');
    } finally {
        setIsResetting(false);
    }
  };


  // ==========================================
  // RENDER: FORGOT PASSWORD VIEW
  // ==========================================
  if (isForgotPassword) {
      return (
          <div className="animate-fade-in space-y-6">
              <button onClick={() => setIsForgotPassword(false)} className={`flex items-center text-sm font-bold mb-4 ${theme.text} ${theme.textHover} transition`}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
              </button>
              
              <div className="text-center mb-8">
                  <h3 className="text-2xl font-black text-slate-800">Reset Password</h3>
                  <p className="text-slate-500 text-sm">{role} Portal</p>
              </div>

              {resetMessage && (
                  <div className={`p-3 border rounded-xl text-sm text-center font-medium ${resetMessage.includes('sent') ? 'bg-green-50 border-green-100 text-green-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                      {resetMessage}
                  </div>
              )}

              {resetStep === 1 ? (
                  <form onSubmit={handleSendResetOtp} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Registered Email</label>
                          <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none transition" placeholder="staff/doctor@hospital.com" required />
                      </div>
                      <button type="submit" disabled={isSendingOtp} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center ${theme.bg} ${theme.hoverBg} disabled:opacity-50`}>
                          {isSendingOtp ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Send Reset Link'}
                      </button>
                  </form>
              ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">4-Digit OTP</label>
                          <input type="text" value={resetOtp} onChange={(e) => setResetOtp(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl font-mono text-center tracking-widest focus:ring-2 focus:ring-slate-500 outline-none transition" maxLength="4" placeholder="1234" required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">New Password</label>
                          <input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none transition" placeholder="Enter new password" required />
                      </div>
                      <button type="submit" disabled={isResetting} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center bg-green-600 hover:bg-green-700 disabled:opacity-50`}>
                          {isResetting ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Set New Password'}
                      </button>
                  </form>
              )}
          </div>
      );
  }

  // ==========================================
  // RENDER: STANDARD LOGIN VIEW
  // ==========================================
  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 shadow-lg text-white ${theme.bg}`}>
            <UserCircle className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-black text-slate-800">{role} Portal</h3>
        <p className="text-slate-500 text-sm">Enter your credentials to access the system.</p>
      </div>
      
      {error && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm text-center font-medium">{error}</div>}
      
      <div className="space-y-4">
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email Address or {role} ID</label>
            <div className="relative">
                <UserCircle className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 outline-none transition font-mono ${theme.ring}`} placeholder="Email or ID" required />
            </div>
        </div>
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
            <div className="relative">
                <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 outline-none transition ${theme.ring}`} placeholder="••••••••" required />
            </div>
            
            <div className="flex justify-end mt-2">
                <button type="button" onClick={() => setIsForgotPassword(true)} className={`text-xs font-bold transition ${theme.text} ${theme.textHover}`}>
                    Forgot Password?
                </button>
            </div>
        </div>
      </div>
      
      <button type="submit" disabled={isLoading} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center disabled:opacity-50 ${theme.bg} ${theme.hoverBg} ${theme.shadow}`}>
        {isLoading ? <LoaderCircle className="animate-spin w-5 h-5" /> : 'Secure Login'}
      </button>
    </form>
  );
};

export default StaffLogin;
