import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';

import { api } from './services/api'; 

import Notification from './components/Notification';
import Modal from './components/Modal';
import StaffLogin from './components/StaffLogin';
import PatientLogin from './components/PatientLogin';
import LoadingSpinner from './components/LoadingSpinner'; 

import HomePage from './pages/HomePage';
import PatientDashboard from './pages/PatientDashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import DoctorDashboard from './pages/DoctorDashboard';

import { MOCK_DATA, getDoctorName } from './mockData';

const USER_ROLES = {
  HOME: 'Home',
  PATIENT: 'Patient',
  RECEPTIONIST: 'Receptionist',
  DOCTOR: 'Doctor'
};

const getInitialUserState = () => {
    const token = localStorage.getItem('token'); // Fixed from jwt_token
    const name = localStorage.getItem('user_name');
    const id = localStorage.getItem('user_id');
    const role = localStorage.getItem('user_role');

    if (token && id && role) {
        return { role: role, id: parseInt(id, 10), name: name };
    }
    return { role: USER_ROLES.HOME, id: null, name: 'Guest' };
};

const App = () => {
  const [currentUser, setCurrentUser] = useState(getInitialUserState());
  const [notification, setNotification] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginTargetRole, setLoginTargetRole] = useState(null);
  
  const [isAppLoading, setIsAppLoading] = useState(true);

  const [data, setData] = useState({
    patients: [], 
    doctors: [], 
    appointments: [], 
    departments: MOCK_DATA.departments,
    medicines: MOCK_DATA.medicines,
  });

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // --- 🔴 THE SMART DATA FETCH ---
  // Now relies on currentUser.role. It will run whenever the user logs in or out!
  useEffect(() => {
    const loadSecureData = async () => {
      // 1. If we are just a guest on the Home page, don't try to fetch secure data
      if (currentUser.role === USER_ROLES.HOME) {
          setIsAppLoading(false);
          return;
      }

      // 2. We are logged in! Let's fetch the hospital data.
      setIsAppLoading(true);
      try {
        const [appointments, doctors] = await Promise.all([
          api.appointments.getAll(),
          api.doctors.getAll()
        ]);
        const patients = currentUser.role === USER_ROLES.PATIENT
          ? []
          : await api.patients.getAll();
        
        setData(prev => ({ 
          ...prev, 
          patients: patients, 
          appointments: appointments,
          doctors: doctors 
        }));
      } catch (error) {
        console.error("Data load failed:", error);
        
        // If the backend Bouncer rejected us, the token is probably expired.
        if (error.message.includes('Token') || error.message.includes('Access Denied')) {
            showNotification("Your session expired. Please log in again.", "error");
            handleLogout();
        } else {
            showNotification("Failed to connect to the server.", "error");
        }
      } finally {
        setTimeout(() => setIsAppLoading(false), 500);
      }
    };

    loadSecureData();
  }, [currentUser.role]); // <-- This is the magic dependency!

  const handleScheduleAppointment = (newAppointment) => {
    setData(prevData => ({
      ...prevData,
      appointments: [...prevData.appointments, newAppointment]
    }));
    showNotification(
      `Appointment scheduled for ${newAppointment.appointment_date} with ${getDoctorName(newAppointment.doctor_id)}`,
      'success'
    );
  };

  const handleRoleChange = (newRole) => {
    if (newRole === currentUser.role) return;
    if (newRole === USER_ROLES.HOME) {
      handleLogout();
    } else {
      setLoginTargetRole(newRole);
      setIsLoginModalOpen(true);
    }
  };

  const handleLogout = () => {
    setCurrentUser({ role: USER_ROLES.HOME, id: null, name: 'Guest' });
    localStorage.clear();
    showNotification('You have been logged out.', 'info');
  };

  const handleLoginSuccess = (role, id, name) => {
    setCurrentUser({ role, id, name });
    setIsLoginModalOpen(false);
    setLoginTargetRole(null);
    showNotification(`Successfully logged in as ${name}.`, 'success');
  };

  const handleRegister = (newPatientFromApi) => {
    setData(prevData => ({
      ...prevData,
      patients: [...prevData.patients, newPatientFromApi]
    }));
    handleLoginSuccess('Patient', newPatientFromApi.patient_id, newPatientFromApi.name);
    showNotification('Registration successful! Welcome.', 'success');
  };

  const renderLoginModal = () => {
    if (!isLoginModalOpen || !loginTargetRole) return null;
    const onClose = () => {
      setIsLoginModalOpen(false);
      setLoginTargetRole(null);
    };

    let content;
    if (loginTargetRole === 'Patient') {
      content = <PatientLogin onLoginSuccess={handleLoginSuccess} onRegister={handleRegister} />;
    } else if (loginTargetRole === 'Doctor' || loginTargetRole === 'Receptionist') {
      content = <StaffLogin role={loginTargetRole} onLoginSuccess={handleLoginSuccess} />;
    } else {
      content = <p>Error: Unknown role.</p>;
    }

    return <Modal onClose={onClose}>{content}</Modal>;
  };

  const renderDashboard = () => {
    switch (currentUser.role) {
      case USER_ROLES.HOME:
        return <HomePage />;
      case USER_ROLES.PATIENT:
        return <PatientDashboard userId={currentUser.id} data={data} onSchedule={handleScheduleAppointment} onUpdate={setData} />;
      case USER_ROLES.RECEPTIONIST:
        return <ReceptionistDashboard data={data} onUpdate={setData} />;
      case USER_ROLES.DOCTOR:
        return <DoctorDashboard userId={currentUser.id} data={data} />;
      default:
        return <HomePage />;
    }
  };

  if (isAppLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-700">
      {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      {renderLoginModal()}

      {/* BACKGROUND DECORATION */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -right-[10%] w-[70%] h-[70%] rounded-full bg-indigo-100/50 blur-3xl opacity-60"></div>
        <div className="absolute top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-100/50 blur-3xl opacity-60"></div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 max-w-7xl mx-auto">
        {/* GLASS NAVBAR */}
        <header className="sticky top-4 z-40 bg-white/70 backdrop-blur-xl border border-white/20 shadow-sm rounded-2xl p-4 mb-8 flex flex-col md:flex-row justify-between items-center transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47v-14.25a.75.75 0 00-1-.708A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-violet-700 tracking-tight">
              Pulse<span className="text-slate-400 font-light">HMS</span>
            </h1>
          </div>

          <div className="flex items-center space-x-4 mt-4 md:mt-0 bg-slate-100/50 p-1.5 rounded-xl border border-slate-200/50">
            {currentUser.role !== USER_ROLES.HOME && (
                <span className="px-4 py-1.5 text-sm font-semibold text-slate-600">
                    Hi, {currentUser.name}
                </span>
            )}

            <div className="h-6 w-px bg-slate-300 mx-2"></div>

            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Portal</label>
            <select
              value={currentUser.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="bg-white border-0 text-slate-700 text-sm font-semibold rounded-lg focus:ring-2 focus:ring-indigo-500 block p-2.5 cursor-pointer hover:bg-slate-50 transition-colors shadow-sm"
            >
              <option value={USER_ROLES.HOME}>Home</option>
              <option value={USER_ROLES.PATIENT}>Patient</option>
              <option value={USER_ROLES.RECEPTIONIST}>Receptionist</option>
              <option value={USER_ROLES.DOCTOR}>Doctor</option>
            </select>

            {currentUser.role !== USER_ROLES.HOME && (
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Logout">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        <main className="animate-fade-in">
            {/* The main dashboard components are loaded based on the current user role! */}
            {renderDashboard()}
        </main>
      </div>
    </div>
  );
};

export default App;
