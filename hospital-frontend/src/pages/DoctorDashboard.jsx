import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/Card';
import AddRecordForm from '../components/AddRecordForm';
import { Calendar, Clock, User, Activity, ThumbsUp, ThumbsDown, Search, Users, Star, ArrowRight, FileText, Pill, BrainCircuit } from 'lucide-react';
import { getPatientName, getDepartmentName } from '../mockData';
import { api } from '../services/api';
import { io } from "socket.io-client"; // Import Socket.io

const DoctorDashboard = ({ data, userId }) => {
  const doctor = data.doctors.find(d => d.doctor_id === userId);
  
  const [analytics, setAnalytics] = useState(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [recentAppointmentsMap, setRecentAppointmentsMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // NEW: State to trigger re-fetch in child components
  const [inventoryUpdateTrigger, setInventoryUpdateTrigger] = useState(0);

  // --- FETCH DATA ---
  useEffect(() => {
    if (!userId) return;
    const fetchDashboardData = async () => {
      setIsLoadingAnalytics(true);
      try {
        const result = await api.appointments.getDoctorAnalytics(userId);
        setAnalytics(result.stats);
        setUpcomingAppointments(result.upcoming_appointments);

        const allAppts = await api.appointments.getAll();
        const doctorsAppts = allAppts.filter(a => a.doctor_id === userId);
        
        const recentApptMap = {};
        doctorsAppts.forEach(a => {
            if (!recentApptMap[a.patient_id] || new Date(a.appointment_date) > new Date(recentApptMap[a.patient_id].date)) {
                recentApptMap[a.patient_id] = { id: a.appointment_id, date: a.appointment_date };
            }
        });
        setRecentAppointmentsMap(recentApptMap);
      } catch (error) { console.error("Failed to fetch doctor data", error); } 
      finally { setIsLoadingAnalytics(false); }
    };
    fetchDashboardData();
  }, [userId, data.appointments]);

  // --- REAL-TIME LISTENERS ---
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');

    // 1. Inventory Updates (New Medicines added)
    socket.on("inventory_updated", () => {
        console.log("🔔 New medicine added! Triggering refresh...");
        setInventoryUpdateTrigger(prev => prev + 1); 
    });

    // 2. Patient Updates (Compliance Score, Details)
    socket.on("patients_updated", (eventData) => {
        if (selectedPatient && parseInt(eventData.patient_id) === selectedPatient.patient_id) {
            console.log("🔔 Current patient updated! Refreshing...");
            handleViewPatient(selectedPatient.patient_id);
        }
    });

    // 3. Appointment Updates (Status Changes - e.g., Receptionist marks 'Completed')
    socket.on("appointment_updated", (data) => {
        if (data.doctor_id == userId) {
             api.appointments.getDoctorAnalytics(userId).then(result => {
                 setAnalytics(result.stats);
                 setUpcomingAppointments(result.upcoming_appointments);
             });
        }
    });

    // 4. Doctor Rating Updates (Patient rates doctor)
    socket.on("doctor_updated", (data) => {
        if (data.doctor_id == userId) {
            api.appointments.getDoctorAnalytics(userId)
                .then(result => setAnalytics(result.stats))
                .catch(err => console.error("❌ Failed to update stats:", err));
        }
    });

    return () => socket.disconnect();
  }, [selectedPatient, userId]);

  // --- DIRECTORY LOGIC ---
  const myPatientsList = useMemo(() => {
    if (!data.appointments || !data.patients) return [];
    const myAppts = data.appointments.filter(a => a.doctor_id === userId);
    const myPatientIds = [...new Set(myAppts.map(a => a.patient_id))];

    return myPatientIds.map(pId => {
        const patientInfo = data.patients.find(p => p.patient_id === pId);
        if (!patientInfo) return null;
        const visitsWithMe = myAppts.filter(a => a.patient_id === pId);
        return { ...patientInfo, total_visits: visitsWithMe.length };
    }).filter(Boolean).filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.phone.includes(searchTerm));
  }, [data.appointments, data.patients, userId, searchTerm]);

  // --- HANDLERS ---
  const handleViewPatient = async (patientId) => {
    setIsLoadingHistory(true);
    try {
        const freshProfile = await api.patients.getOne(patientId);
        
        // NEW: Check if this patient has an upcoming appointment with AI Triage data!
        const latestAppt = upcomingAppointments.find(a => a.patient_id === patientId);
        
        setSelectedPatient({
            ...freshProfile,
            symptoms_raw: latestAppt?.symptoms_raw || null,
            symptoms_medical: latestAppt?.symptoms_medical || null
        });

        const history = await api.patients.getHistory(patientId);
        setPatientHistory(history);
    } catch (error) { setPatientHistory([]); } 
    finally { setIsLoadingHistory(false); }
  };

  const handleRecordAdded = () => {
    if (selectedPatient) handleViewPatient(selectedPatient.patient_id);
  };

  const handleComplianceUpdate = async (change) => {
    if (!selectedPatient) return;
    const currentScore = selectedPatient.compliance_score || 100;
    const newScore = Math.min(100, Math.max(0, currentScore + change));
    setSelectedPatient(prev => ({ ...prev, compliance_score: newScore }));
    try { await api.patients.updateCompliance(selectedPatient.patient_id, newScore); } 
    catch (error) { setSelectedPatient(prev => ({ ...prev, compliance_score: currentScore })); }
  };

  if (!doctor) return <div className="p-8 text-red-500">Doctor not found.</div>;

  return (
    <div className="space-y-8 pb-10">
      {/* HEADER */}
      <div className="bg-white border-l-4 border-indigo-500 shadow-sm rounded-r-2xl p-8 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Dr. {doctor.name}</h1>
            <div className="flex items-center gap-2 mt-1">
                <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">{doctor.specialization}</span>
                <span className="text-slate-400 text-sm">•</span>
                <span className="text-slate-500 font-medium">{getDepartmentName(doctor.department_id)}</span>
            </div>
        </div>
        <div className="text-right hidden md:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">ID</p>
            <p className="text-2xl font-mono font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-lg">#{doctor.doctor_id}</p>
        </div>
      </div>

      {/* ANALYTICS */}
      {isLoadingAnalytics ? <p className="text-center py-8 text-slate-400">Loading Stats...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
                { label: 'Avg Rating', val: analytics?.average_rating ? parseFloat(analytics.average_rating).toFixed(1) : 'N/A', sub: 'Stars', color: 'text-indigo-600' },
                { label: 'Completed', val: analytics?.completed_appointments || 0, sub: 'Visits', color: 'text-emerald-600' },
                { label: 'Upcoming', val: upcomingAppointments.length, sub: 'Appts', color: 'text-blue-600' },
                { label: 'Patients', val: myPatientsList.length, sub: 'Total', color: 'text-violet-600' },
            ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{stat.label}</p>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black ${stat.color}`}>{stat.val}</span>
                        <span className="text-sm font-medium text-slate-400">{stat.sub}</span>
                    </div>
                </div>
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT: UPCOMING & DIRECTORY */}
        <div className="lg:col-span-4 space-y-8">
            <Card title="Next Up" icon={Clock}>
                {upcomingAppointments.length === 0 ? <p className="text-slate-400 text-center py-8 text-sm">No upcoming appointments.</p> : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                        {upcomingAppointments.map(a => (
                            <div key={a.appointment_id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                        <Calendar className="w-4 h-4 text-indigo-400" /> {a.appointment_date}
                                    </div>
                                    {a.is_emergency && <span className="bg-rose-100 text-rose-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">URGENT</span>}
                                </div>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-slate-800">{getPatientName(a.patient_id, data.patients)}</p>
                                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5 font-mono">
                                            <Clock className="w-3 h-3" /> {a.appointment_time?.slice(0,5) || 'N/A'}
                                        </div>
                                    </div>
                                    <button onClick={() => handleViewPatient(a.patient_id)} className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition">
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
            
            <Card title="Patient Directory" icon={Users}>
                <div className="mb-4 relative">
                    <input type="text" placeholder="Search..." className="w-full p-3 pl-10 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
                <div className="overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                    {myPatientsList.map(p => (
                        <div key={p.patient_id} onClick={() => handleViewPatient(p.patient_id)} className="flex items-center justify-between p-3 mb-2 rounded-xl hover:bg-slate-50 cursor-pointer transition group">
                            <div>
                                <p className="font-bold text-slate-700 text-sm group-hover:text-indigo-700 transition-colors">{p.name}</p>
                                <p className="text-xs text-slate-400">{p.phone}</p>
                            </div>
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">{p.total_visits} visits</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>

        {/* RIGHT: ACTIVE PATIENT */}
        <div className="lg:col-span-8">
            {selectedPatient ? (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* Patient Header */}
                    <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 flex justify-between items-start relative overflow-hidden">
                        <div className="relative z-10">
                            <h2 className="text-3xl font-black text-slate-800 mb-2">{selectedPatient.name}</h2>
                            <div className="flex gap-3 text-sm font-medium text-slate-500">
                                <span className="bg-slate-100 px-3 py-1 rounded-lg">{selectedPatient.age} yrs</span>
                                <span className="bg-slate-100 px-3 py-1 rounded-lg">{selectedPatient.gender === 'M' ? 'Male' : 'Female'}</span>
                                <span className="bg-slate-100 px-3 py-1 rounded-lg">{selectedPatient.phone}</span>
                            </div>
                        </div>
                        <div className={`relative z-10 flex flex-col items-center p-4 rounded-2xl ${
                            (selectedPatient.compliance_score || 100) >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                            <span className="text-4xl font-black">{selectedPatient.compliance_score || 100}</span>
                            <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Score</span>
                        </div>
                    </div>

                    {/* --- NEW: AI TRIAGE NOTES FOR DOCTOR --- */}
                    {selectedPatient.symptoms_medical && (
                        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-5 rounded-r-2xl shadow-sm">
                            <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-3 flex items-center">
                                <BrainCircuit className="w-4 h-4 mr-2"/> AI Triage Pre-Screening
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Patient's Raw Input:</span>
                                    <p className="text-sm text-slate-700 mt-1 italic leading-relaxed">"{selectedPatient.symptoms_raw}"</p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Clinical Translation:</span>
                                    <p className="text-sm font-bold text-indigo-900 mt-1 leading-relaxed">{selectedPatient.symptoms_medical}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Compliance Actions */}
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => handleComplianceUpdate(-10)} className="py-4 bg-white border border-rose-100 text-rose-600 rounded-2xl font-bold hover:bg-rose-50 hover:border-rose-200 transition flex items-center justify-center gap-2 shadow-sm">
                            <ThumbsDown className="w-5 h-5" /> Mark Non-Compliant
                        </button>
                        <button onClick={() => handleComplianceUpdate(10)} className="py-4 bg-white border border-emerald-100 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-50 hover:border-emerald-200 transition flex items-center justify-center gap-2 shadow-sm">
                            <ThumbsUp className="w-5 h-5" /> Mark Compliant
                        </button>
                    </div>

                    {/* PASSING THE TRIGGER TO ADD RECORD FORM */}
                    <AddRecordForm 
                        patient={selectedPatient}
                        doctorId={userId}
                        appointmentId={
                            upcomingAppointments.find(a => a.patient_id === selectedPatient.patient_id)?.appointment_id || 
                            recentAppointmentsMap[selectedPatient.patient_id]?.id
                        }
                        onRecordAdded={handleRecordAdded}
                        refreshTrigger={inventoryUpdateTrigger}
                    />

                    {/* HISTORY LIST WITH MEDICINES */}
                    <Card title="Medical History" icon={FileText}>
                        {patientHistory.length === 0 ? (
                            <p className="text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">No records found.</p>
                        ) : (
                            patientHistory.map(rec => (
                                <div key={rec.record_id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group mb-6">
                                    <div className="flex justify-between mb-4 pb-4 border-b border-slate-100">
                                        <div>
                                            <h4 className="text-xl font-bold text-indigo-900 group-hover:text-indigo-600 transition-colors">{rec.diagnosis}</h4>
                                            <p className="text-xs font-bold text-slate-400 uppercase mt-1">{rec.visit_date.split('T')[0]}</p>
                                        </div>
                                        {/* CLOUDINARY URL FIX APPLIED HERE */}
                                        {rec.file_path && (
                                            <a 
                                                href={rec.file_path} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="text-xs bg-white text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 font-bold hover:bg-indigo-50 transition flex items-center gap-1 shadow-sm"
                                            >
                                                📎 View Document
                                            </a>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-6 text-sm mb-4">
                                        {/* --- RICH TEXT RENDERING WITH NULL FIX --- */}
                                        <div>
                                            <p className="text-xs font-bold text-amber-600 uppercase mb-1">Clinical Notes</p>
                                            <div 
                                                className="text-slate-600 leading-relaxed text-sm [&>ul]:list-disc [&>ul]:ml-5 [&>ol]:list-decimal [&>ol]:ml-5 [&>p]:mb-2" 
                                                dangerouslySetInnerHTML={{ __html: rec.notes || '' }} 
                                            />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Treatment</p>
                                            <div 
                                                className="text-slate-600 leading-relaxed text-sm [&>ul]:list-disc [&>ul]:ml-5 [&>ol]:list-decimal [&>ol]:ml-5 [&>p]:mb-2" 
                                                dangerouslySetInnerHTML={{ __html: rec.treatment_plan || '' }} 
                                            />
                                        </div>
                                    </div>

                                    {/* PRESCRIPTION TABLE */}
                                    {rec.medicines && rec.medicines.length > 0 && (
                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mt-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                                <Pill className="w-3 h-3" /> Rx Details
                                            </p>
                                            <table className="w-full text-xs text-left">
                                                <thead className="text-slate-500 border-b border-slate-200">
                                                    <tr>
                                                        <th className="pb-2 font-semibold">Medicine</th>
                                                        <th className="pb-2 font-semibold">Dosage</th>
                                                        <th className="pb-2 font-semibold">Duration</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {rec.medicines.map((m, idx) => (
                                                        <tr key={idx} className="border-b border-slate-100 last:border-0">
                                                            <td className="py-2 font-bold">{m.name}</td>
                                                            <td className="py-2 font-mono text-indigo-600">{m.dosage}</td>
                                                            <td className="py-2 text-slate-500">{m.duration || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </Card>
                </div>
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 min-h-[500px]">
                    <div className="p-8 bg-white rounded-full shadow-sm mb-6">
                        <Users className="w-16 h-16 text-indigo-100" />
                    </div>
                    <p className="text-2xl font-bold text-slate-400">Ready to examine.</p>
                    <p className="text-slate-400 mt-2">Select a patient to begin session.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
