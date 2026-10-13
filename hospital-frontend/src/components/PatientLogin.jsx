import React, { useState } from 'react';
import { api } from '../services/api';
import { LoaderCircle, Send, CheckCircle, ArrowLeft, UserCircle, KeyRound, Mail, Phone, MapPin, Calendar, Users } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const PatientLogin = ({ onLoginSuccess, onRegister }) => {
  const [tab, setTab] = useState('signin');

  // Sign-in state
  const [identifier, setIdentifier] = useState(''); 
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // Registration State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState(''); 
  const [regPhone, setRegPhone] = useState('');
  const [regAge, setRegAge] = useState('');
  const [regGender, setRegGender] = useState('M');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  // Registration Flow State
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  // --- FORGOT PASSWORD STATE ---
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  // Consistent Theme styling
  const theme = {
    bg: 'bg-indigo-600',
    hoverBg: 'hover:bg-indigo-700',
    text: 'text-indigo-600',
    textHover: 'hover:text-indigo-800',
    ring: 'focus:ring-indigo-500',
    shadow: 'shadow-indigo-200'
  };

  // --- 1. SIGN IN ---
  const handleSignIn = async (e) => {
    e.preventDefault();
    setSignInError('');
    setIsSigningIn(true);

    try {
      const result = await api.auth.loginPatient(identifier, password);
      localStorage.setItem('token', result.token); 
      localStorage.setItem('user_id', result.user.patient_id);
      localStorage.setItem('user_name', result.user.name);
      localStorage.setItem('user_role', result.user.role);
      onLoginSuccess(result.user.role, result.user.patient_id, result.user.name);
    } catch (err) {
      setSignInError(err.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  // --- 2. SEND OTP (Now Using Email) ---
  const handleSendOtp = async () => {
    setRegError('');
    
    // Require email before sending OTP
    if (!regEmail || !regEmail.includes('@')) {
        setRegError('Please enter a valid email address first.');
        return;
    }

    if (!/^\d{10}$/.test(regPhone)) {
        setRegError('Phone number must be exactly 10 digits.');
        return;
    }
    
    setIsSendingOtp(true);
    try {
        // Pass BOTH phone and email to the API
        await api.auth.sendOtp(regPhone, regEmail); 
        setOtpSent(true);
        setRegError(''); 
    } catch (err) {
        setRegError(err.message);
    } finally {
        setIsSendingOtp(false);
    }
  };

  // --- 3. REGISTER (With OTP) ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError('');

    if (!otpSent) return setRegError("Please request an OTP first.");
    if (!otp) return setRegError("Please enter the OTP sent to your email.");
    if (regPassword !== regConfirmPassword) return setRegError('Passwords do not match.');

    setIsRegistering(true);

    try {
      const newPatientData = {
        name: regName,
        email: regEmail,
        age: parseInt(regAge),
        gender: regGender,
        phone: regPhone,
        address: regAddress,
        password: regPassword,
        otp: otp 
      };

      const result = await api.auth.registerPatient(newPatientData);
      onRegister(result);
    } catch (err) {
      setRegError(err.message);
    } finally {
      setIsRegistering(false);
    }
  };

  // --- 4. FORGOT PASSWORD FLOW (Live Render URLs) ---
  const handleSendResetOtp = async (e) => {
      e.preventDefault();
      setResetMessage('');
      setIsSendingOtp(true);
      try {
          const res = await fetch(`${API_BASE_URL}/forgot-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: resetEmail, role: 'patient' })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setResetStep(2);
          setResetMessage('OTP sent to your email!');
      } catch (err) {
          setResetMessage(err.message || 'Failed to send OTP.');
      } finally {
          setIsSendingOtp(false);
      }
  };

  const handleResetPassword = async (e) => {
      e.preventDefault();
      setResetMessage('');
      setIsRegistering(true); 
      try {
          const res = await fetch(`${API_BASE_URL}/reset-password`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword: resetNewPassword, role: 'patient' })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          
          alert("Password Reset Successfully! Please sign in.");
          setIsForgotPassword(false);
          setResetStep(1);
          setResetEmail('');
          setResetOtp('');
          setResetNewPassword('');
      } catch (err) {
          setResetMessage(err.message || 'Failed to reset password.');
      } finally {
          setIsRegistering(false);
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
                  <p className="text-slate-500 text-sm">Patient Portal</p>
              </div>

              {resetMessage && (
                  <div className={`p-3 border rounded-xl text-sm text-center font-medium ${resetMessage.includes('sent') || resetMessage.includes('Success') ? 'bg-green-50 border-green-100 text-green-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                      {resetMessage}
                  </div>
              )}

              {resetStep === 1 ? (
                  <form onSubmit={handleSendResetOtp} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Registered Email</label>
                          <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={`w-full p-3 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="patient@example.com" required />
                      </div>
                      <button type="submit" disabled={isSendingOtp} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center ${theme.bg} ${theme.hoverBg} disabled:opacity-50`}>
                          {isSendingOtp ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Send Reset Link'}
                      </button>
                  </form>
              ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">4-Digit OTP</label>
                          <input type="text" value={resetOtp} onChange={(e) => setResetOtp(e.target.value)} className={`w-full p-3 border border-slate-200 rounded-xl font-mono text-center tracking-widest outline-none transition ${theme.ring}`} maxLength="4" placeholder="1234" required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">New Password</label>
                          <input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} className={`w-full p-3 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="Enter new password" required />
                      </div>
                      <button type="submit" disabled={isRegistering} className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center bg-green-600 hover:bg-green-700 disabled:opacity-50">
                          {isRegistering ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Set New Password'}
                      </button>
                  </form>
              )}
          </div>
      );
  }

  // ==========================================
  // RENDER: STANDARD LOGIN/REGISTER VIEW
  // ==========================================
  return (
    <div className="space-y-6">
      
      {/* Header Matches StaffLogin */}
      <div className="text-center mb-6">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 shadow-lg text-white ${theme.bg}`}>
            <UserCircle className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-black text-slate-800">Patient Portal</h3>
        <p className="text-slate-500 text-sm">Access your medical records and appointments.</p>
      </div>

      {/* Custom Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
        <button onClick={() => setTab('signin')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'signin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sign In</button>
        <button onClick={() => setTab('register')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'register' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Register</button>
      </div>

      {tab === 'signin' && (
        <form onSubmit={handleSignIn} className="space-y-5 animate-fade-in">
          {signInError && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm text-center font-medium">{signInError}</div>}
          
          <div className="space-y-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email or Phone Number</label>
                <div className="relative">
                    <UserCircle className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                    <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition font-mono ${theme.ring}`} placeholder="Email or Phone" required />
                </div>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
                <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="••••••••" required />
                </div>
                <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => setIsForgotPassword(true)} className={`text-xs font-bold transition ${theme.text} ${theme.textHover}`}>
                        Forgot Password?
                    </button>
                </div>
            </div>
          </div>

          <button type="submit" disabled={isSigningIn} className={`w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center disabled:opacity-50 ${theme.bg} ${theme.hoverBg} ${theme.shadow}`}>
            {isSigningIn ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Secure Login'}
          </button>
        </form>
      )}

      {tab === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4 animate-fade-in max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {regError && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm text-center font-medium">{regError}</div>}
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Full Name</label>
            <div className="relative">
                <UserCircle className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="John Doe" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email Address</label>
            <div className="relative">
                <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring} ${otpSent ? 'bg-slate-50 text-slate-500' : ''}`} placeholder="john@example.com" disabled={otpSent} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Phone Number</label>
            <div className="relative">
                <Phone className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring} ${otpSent ? 'bg-slate-50 text-slate-500' : ''}`} placeholder="10-digit number" maxLength="10" disabled={otpSent} required />
            </div>
          </div>

          {/* 🔴 NEW: DEDICATED EMAIL OTP SECTION */}
          {!otpSent ? (
              <button type="button" onClick={handleSendOtp} disabled={isSendingOtp || regPhone.length !== 10 || !regEmail.includes('@')} className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center disabled:opacity-50 mt-2 ${theme.bg} ${theme.hoverBg}`}>
                  {isSendingOtp ? <LoaderCircle className="animate-spin w-5 h-5"/> : <><Send className="w-4 h-4 mr-2"/> Send OTP to Email</>}
              </button>
          ) : (
              <div className="animate-slide-in p-5 bg-indigo-50 rounded-xl border border-indigo-100 mt-2 shadow-inner">
                  <div className="flex items-center justify-center text-indigo-700 font-bold mb-4">
                      <CheckCircle className="w-5 h-5 mr-2 text-emerald-500"/> OTP Sent to Inbox!
                  </div>
                  <label className="block text-xs font-bold text-indigo-700 uppercase mb-2 text-center">Enter 6-Digit Code</label>
                  <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} className={`w-full p-3 border-2 border-indigo-200 rounded-xl focus:border-indigo-500 font-mono text-center text-xl tracking-[0.5em] outline-none bg-white`} maxLength="6" placeholder="------" required />
              </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Age</label>
              <div className="relative">
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                  <input type="number" value={regAge} onChange={(e) => setRegAge(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="Years" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Gender</label>
              <div className="relative">
                  <Users className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                  <select value={regGender} onChange={(e) => setRegGender(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition bg-white appearance-none ${theme.ring}`}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Home Address</label>
            <div className="relative">
                <MapPin className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                <input type="text" value={regAddress} onChange={(e) => setRegAddress(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="Full Address" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
                <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                    <input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="••••••••" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Confirm Password</label>
                <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
                    <input type="password" value={regConfirmPassword} onChange={(e) => setRegConfirmPassword(e.target.value)} className={`w-full p-3 pl-10 border border-slate-200 rounded-xl outline-none transition ${theme.ring}`} placeholder="••••••••" required />
                </div>
              </div>
          </div>

          <button type="submit" className="w-full py-3.5 mt-2 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex justify-center items-center bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 disabled:opacity-50" disabled={isRegistering || !otpSent}>
            {isRegistering ? <LoaderCircle className="animate-spin w-5 h-5"/> : 'Create Patient Account'}
          </button>
        </form>
      )}
    </div>
  );
};

export default PatientLogin;
