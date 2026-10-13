import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/Card';
import { Calendar, User, Pill, CheckSquare, Edit, Save, CreditCard, IndianRupee, BarChart3, Plus, X, RefreshCw, Activity, AlertTriangle, Stethoscope, Clock, Search, UserX, Download } from 'lucide-react';
import { getPatientName, getDoctorName } from '../mockData';
import { api } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 
import { io } from "socket.io-client"; 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const ReceptionistDashboard = ({ data, onUpdate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // --- INVENTORY STATE ---
  const [inventoryList, setInventoryList] = useState([]); 
  const [editingMedicine, setEditingMedicine] = useState({ id: null, stock: 0 });
  const [showAddMed, setShowAddMed] = useState(false);
  const [newMedData, setNewMedData] = useState({ name: '', type: 'Tablet', price: '', stock: '' });
  const [isSyncing, setIsSyncing] = useState(false); 

  // --- BILLING STATE ---
  const [bills, setBills] = useState([]);
  const [newBillData, setNewBillData] = useState({ patient_id: '', amount: '', description: 'Consultation Fee' });
  const [isBillSubmitting, setIsBillSubmitting] = useState(false);
  const [billSearch, setBillSearch] = useState(''); 

  const [analytics, setAnalytics] = useState({ busy_hours: [], top_medicines: [] });

  // Safely access prop data
  const patients = data?.patients || [];
  const appointments = data?.appointments || [];
  const doctors = data?.doctors || [];

  // --- INITIAL FETCH ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [billData, statsData, inventoryData] = await Promise.all([
            api.billing.getAll(),
            api.reports.getReceptionStats(),
            api.inventory.getAll()
        ]);
        setBills(billData);
        setAnalytics(statsData);
        setInventoryList(inventoryData);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      }
    };
    fetchData();
  }, []);

  // --- REAL-TIME SOCKET LISTENER ---
  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');

    socket.on("inventory_updated", (data) => {
        handleRefreshInventory(true); 
    });

    socket.on("patients_updated", () => {
        api.patients.getAll().then(freshPatients => {
            onUpdate(prev => ({ ...prev, patients: freshPatients }));
        });
    });

    socket.on("appointment_updated", () => {
        api.appointments.getAll().then(allAppts => {
            onUpdate(prev => ({ ...prev, appointments: allAppts }));
        });
    });

    socket.on("billing_updated", () => {
        api.billing.getAll().then(billsData => setBills(billsData));
    });

    return () => socket.disconnect();
  }, [onUpdate]);

  // --- AUTO-SYNC INVENTORY ---
  useEffect(() => {
    const intervalId = setInterval(() => {
        if (editingMedicine.id === null) {
            handleRefreshInventory(true);
        }
    }, 15000); 
    return () => clearInterval(intervalId);
  }, [editingMedicine.id]); 

  const handleRefreshInventory = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
        const freshData = await api.inventory.getAll();
        setInventoryList(freshData);
    } catch (error) {
        console.error("Inventory sync failed", error);
    } finally {
        if (!silent) setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // --- HANDLERS ---
  const handleUpdateStock = async () => {
    const { id, stock } = editingMedicine;
    try {
        const res = await api.inventory.updateStock(id, parseInt(stock, 10));
        setInventoryList(prev => prev.map(m => m.medicine_id === id ? res.medicine : m));
        setEditingMedicine({ id: null, stock: 0 });
    } catch (e) { console.error(e); }
  };

  const handleAddMedicine = async (e) => {
    e.preventDefault();
    if(!newMedData.name || !newMedData.stock) return;
    try {
        const addedMed = await api.inventory.add(newMedData);
        setInventoryList([...inventoryList, addedMed]); 
        setNewMedData({ name: '', type: 'Tablet', price: '', stock: '' }); 
        setShowAddMed(false); 
    } catch (e) { console.error(e); }
  };

  const handleCreateBill = async (e) => {
    e.preventDefault();
    if(!newBillData.patient_id || !newBillData.amount) return;
    setIsBillSubmitting(true);
    try {
        const newBill = await api.billing.create(newBillData);
        setBills([newBill, ...bills]); 
        setNewBillData({ patient_id: '', amount: '', description: 'Consultation Fee' });
        setBillSearch('');
    } catch (error) { console.error(error); } 
    finally { setIsBillSubmitting(false); }
  };

  const handleUpdateBillStatus = async (billId, newStatus) => {
    setBills(prev => prev.map(b => b.bill_id === billId ? { ...b, status: newStatus } : b));
    try { 
        await fetch(`${API_BASE_URL}/bills/${billId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    } catch (error) { console.error(error); }
  };

  const handleUpdateAppointment = async (id, data) => {
    onUpdate(prev => ({
        ...prev, appointments: prev.appointments.map(a => a.appointment_id === id ? {...a, ...data} : a)
    }));
    try {
        await api.appointments.update(id, data);
    } catch (error) { console.error(error); }
  };

  const handleNoShow = async (appointmentId, patientId) => {
    if (!window.confirm("Mark as 'No Show'?\nThis will Cancel the appointment AND deduct 10 Compliance Points.")) return;
    const patient = patients.find(p => p.patient_id === patientId);
    const currentScore = patient?.compliance_score || 100;
    const newScore = Math.max(0, currentScore - 10);

    onUpdate(prev => ({
        ...prev,
        appointments: prev.appointments.map(a => a.appointment_id === appointmentId ? { ...a, status: 'Cancelled' } : a),
        patients: prev.patients.map(p => p.patient_id === patientId ? { ...p, compliance_score: newScore } : p)
    }));

    try {
        await Promise.all([
            api.appointments.update(appointmentId, { status: 'Cancelled' }),
            api.patients.updateCompliance(patientId, newScore)
        ]);
    } catch (error) { console.error("Failed to mark No Show", error); }
  };

  // --- PDF GENERATOR ---
  const generatePDF = (bill, patient) => {
    try {
      const doc = new jsPDF();

      doc.setFillColor(79, 70, 229); 
      doc.rect(0, 0, 210, 40, 'F'); 
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text("Pulse HMS", 14, 20);
      doc.setFontSize(10);
      doc.text("Excellence in Healthcare Management", 14, 28);
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.text(`Invoice #: ${bill.bill_id}`, 150, 20);
      doc.text(`Date: ${new Date(bill.issued_date).toLocaleDateString()}`, 150, 26);

      doc.setFontSize(14);
      doc.text("Patient Details", 14, 55);
      doc.setFontSize(10);
      doc.text(`Name: ${patient?.name || bill.patient_name || 'N/A'}`, 14, 65);
      doc.text(`Phone: ${patient?.phone || bill.phone || 'N/A'}`, 14, 71);
      doc.text(`Status: ${bill.status}`, 14, 77);

      autoTable(doc, {
        startY: 85,
        head: [['Description', 'Amount']],
        body: [
          [bill.description || 'Medical Services', `Rs. ${bill.amount}`]
        ],
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text(`Total Amount: Rs. ${bill.amount}`, 140, finalY);

      doc.setFontSize(10);
      doc.setTextColor(150);
      doc.text("Thank you for choosing Pulse HMS.", 14, 280);

      doc.save(`Invoice_${bill.patient_name || 'Patient'}_${bill.bill_id}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF invoice.");
    }
  };

  // --- FILTERS & SORTING ---
  const sortedAppointments = useMemo(() => {
      return [...appointments].sort((a, b) => {
          const dateA = new Date(`${a.appointment_date}T${a.appointment_time || '00:00'}`);
          const dateB = new Date(`${b.appointment_date}T${b.appointment_time || '00:00'}`);
          return dateB - dateA; 
      });
  }, [appointments]);

  const filteredPatients = useMemo(() => {
    return patients.map(p => {
        const pAppts = appointments.filter(a => a.patient_id === p.patient_id);
        const lastAppt = pAppts.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date))[0];
        const pBills = bills.filter(b => b.patient_id === p.patient_id);
        const lastBill = pBills.sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date))[0];

        return {
            ...p,
            lastVisit: lastAppt ? `${lastAppt.appointment_date} (${lastAppt.appointment_time?.slice(0,5) || 'N/A'})` : 'No visits',
            billAmount: lastBill ? lastBill.amount : 0,
            billStatus: lastBill ? lastBill.status : 'N/A',
            complianceScore: p.compliance_score !== undefined ? p.compliance_score : 100
        };
    }).filter(p => (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) || (p.phone && p.phone.includes(searchTerm)));
  }, [patients, appointments, bills, searchTerm]);

  const billingPatients = patients.filter(p => 
    p.name.toLowerCase().includes(billSearch.toLowerCase()) || 
    p.phone.includes(billSearch)
  );

  const todayAppointments = appointments.filter(a => a.appointment_date === new Date().toISOString().split('T')[0] && a.status !== 'Cancelled');
  const pendingBills = bills.filter(b => b.status === 'Pending');
  const getMaxCount = (arr, key) => Math.max(...arr.map(i => i[key]), 1);

  return (
    <div className="space-y-8 pb-10">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity className="w-64 h-64" />
        </div>
        <div className="relative z-10">
            <h2 className="text-3xl font-black tracking-tight">Admin Console</h2>
            <p className="mt-2 text-slate-300 text-lg">Operations Center & Analytics</p>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Calendar className="w-8 h-8" /></div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Today's Visits</p>
            <p className="text-3xl font-black text-slate-800">{todayAppointments.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-orange-50 rounded-xl text-orange-600"><CreditCard className="w-8 h-8" /></div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Bills</p>
            <p className="text-3xl font-black text-slate-800">{pendingBills.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-xl text-red-600"><AlertTriangle className="w-8 h-8" /></div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Low Stock</p>
            <p className="text-3xl font-black text-slate-800">{inventoryList.filter(m => m.stock < 50).length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><Stethoscope className="w-8 h-8" /></div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Doctors</p>
            <p className="text-3xl font-black text-slate-800">{doctors.length}</p>
          </div>
        </div>
      </div>

      {/* --- MAIN OPERATIONS ROW: APPOINTMENTS (Left) & BILLING (Right) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1. APPOINTMENT MANAGER */}
        <div className="lg:col-span-2">
            <Card title="Appointment Manager" icon={Calendar} className="h-full border-0 shadow-lg">
                <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
                    <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date/Time</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Doctor</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status / Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-50">
                        {sortedAppointments.map(a => (
                        <tr key={a.appointment_id} className={`hover:bg-slate-50 transition-colors ${a.is_emergency ? 'bg-rose-50/50' : ''}`}>
                            <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-3 h-3 text-slate-400"/>
                                    <span className="font-bold text-slate-700 text-sm">{a.appointment_date}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                    <Clock className="w-3 h-3"/>
                                    {a.appointment_time ? a.appointment_time.slice(0,5) : 'N/A'}
                                </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-700">{getPatientName(a.patient_id, data.patients)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">{getDoctorName(a.doctor_id)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {a.status === 'Scheduled' ? (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleUpdateAppointment(a.appointment_id, { status: 'Completed' })}
                                        className="flex items-center bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-200"
                                    >
                                        <CheckSquare className="w-3 h-3 mr-1.5" /> Complete
                                    </button>
                                    <button
                                        onClick={() => handleUpdateAppointment(a.appointment_id, { status: 'Cancelled' })}
                                        className="flex items-center bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-200"
                                    >
                                        <X className="w-3 h-3 mr-1.5" /> Cancel
                                    </button>
                                    <button
                                        onClick={() => handleNoShow(a.appointment_id, a.patient_id)}
                                        className="flex items-center bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200"
                                        title="Mark No Show (-10 pts)"
                                    >
                                        <UserX className="w-3 h-3 mr-1.5" /> No Show
                                    </button>
                                </div>
                            ) : (
                                <select 
                                    className={`px-2 py-1 rounded-lg text-[10px] uppercase font-black border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500 ${
                                        a.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 
                                        a.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                                    }`}
                                    value={a.status}
                                    onChange={(e) => handleUpdateAppointment(a.appointment_id, { status: e.target.value })}
                                >
                                    <option value="Scheduled">Scheduled</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            )}
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </Card>
        </div>

        {/* 2. BILLING GENERATOR */}
        <div className="lg:col-span-1">
             <Card title="Billing & Payments" icon={CreditCard} className="h-full border-0 shadow-lg flex flex-col">
                <div className="flex-shrink-0">
                    <form onSubmit={handleCreateBill} className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100 mb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="p-1.5 bg-indigo-100 rounded-md text-indigo-600"><Plus className="w-4 h-4"/></div>
                            <p className="font-bold text-sm text-slate-700 uppercase tracking-wide">Manual Invoice</p>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400 pointer-events-none" />
                                <input 
                                    type="text" 
                                    placeholder="Search Patient..." 
                                    className="w-full p-3 pl-10 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-sm"
                                    value={billSearch}
                                    onChange={(e) => setBillSearch(e.target.value)}
                                />
                            </div>
                            <select 
                                className="w-full p-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition" 
                                value={newBillData.patient_id} 
                                onChange={(e)=>setNewBillData({...newBillData, patient_id: e.target.value})} 
                                required
                            >
                                <option value="">
                                    {billSearch ? `Results (${billingPatients.length})` : '-- Select Patient --'}
                                </option>
                                {billingPatients.map(p=>(
                                    <option key={p.patient_id} value={p.patient_id}>{p.name} ({p.phone})</option>
                                ))}
                            </select>
                        </div>

                        <input 
                            type="text" 
                            placeholder="Description (e.g., Consultation Fee)" 
                            className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition" 
                            value={newBillData.description} 
                            onChange={(e)=>setNewBillData({...newBillData, description: e.target.value})} 
                        />

                        <div className="relative">
                            <IndianRupee className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                            <input 
                                type="number" 
                                placeholder="Amount" 
                                className="w-full p-3 pl-9 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition" 
                                value={newBillData.amount} 
                                onChange={(e)=>setNewBillData({...newBillData, amount: e.target.value})} 
                                required 
                            />
                        </div>
                        <button type="submit" disabled={isBillSubmitting} className="w-full bg-slate-800 text-white py-3 rounded-lg text-sm font-bold hover:bg-slate-900 shadow-md">{isBillSubmitting ? 'Generating...' : 'Generate Bill'}</button>
                    </form>
                </div>
                
                <div className="flex-grow overflow-y-auto max-h-[300px] pr-1 custom-scrollbar border-t border-slate-50 pt-2">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2 px-1">Recent Invoices</p>
                    {bills.length === 0 ? <p className="text-center text-slate-400 py-4 text-sm">No records.</p> : (
                        <div className="space-y-2">{bills.map(b=>(
                            <div key={b.bill_id} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-indigo-100 transition">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">{b.patient_name}</p>
                                    <p className="text-xs text-slate-500 w-32 truncate" title={b.description}>{b.description}</p>
                                    <p className="text-sm font-bold text-indigo-600 mt-1">₹{b.amount}</p>
                                </div>
                                
                                <div className="flex flex-col items-end gap-2">
                                  <select 
                                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border-0 cursor-pointer focus:ring-1 focus:ring-indigo-500 ${
                                          b.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 
                                          b.status === 'Cancelled' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                                      }`}
                                      value={b.status}
                                      onChange={(e) => handleUpdateBillStatus(b.bill_id, e.target.value)}
                                  >
                                      <option value="Pending">Pending</option>
                                      <option value="Paid">Paid</option>
                                      <option value="Cancelled">Cancelled</option>
                                  </select>
                                  <button 
                                      onClick={() => generatePDF(b, patients.find(p => parseInt(p.patient_id) === parseInt(b.patient_id)))}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                      title="Download Invoice"
                                  >
                                      <Download className="w-4 h-4" />
                                  </button>
                                </div>
                            </div>
                        ))}</div>
                    )}
                </div>
             </Card>
        </div>
      </div>

      {/* --- SECONDARY ROW: INVENTORY & ANALYTICS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* INVENTORY */}
        <div className="bg-white p-6 rounded-xl shadow-lg border-0 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h3 className="flex items-center text-xl font-bold text-slate-700">
                    <Pill className="w-5 h-5 mr-3 text-indigo-500" /> Inventory
                </h3>
                <div className="flex gap-2">
                    <button onClick={() => handleRefreshInventory(false)} className={`p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition ${isSyncing ? 'animate-spin' : ''}`} title="Sync">
                        <RefreshCw className="w-4 h-4"/>
                    </button>
                    <button onClick={() => setShowAddMed(!showAddMed)} className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition" title="Add">
                        {showAddMed ? <X className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
                    </button>
                </div>
            </div>

            {showAddMed && (
                <form onSubmit={handleAddMedicine} className="mb-4 bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3 animate-slide-in">
                    <input type="text" placeholder="Name" className="w-full p-2 border border-indigo-200 rounded-lg text-sm" value={newMedData.name} onChange={(e)=>setNewMedData({...newMedData, name: e.target.value})} required />
                    <div className="flex gap-2">
                        <input type="number" placeholder="Stock" className="w-1/2 p-2 border border-indigo-200 rounded-lg text-sm" value={newMedData.stock} onChange={(e)=>setNewMedData({...newMedData, stock: e.target.value})} required />
                        <input type="number" placeholder="Price" className="w-1/2 p-2 border border-indigo-200 rounded-lg text-sm" value={newMedData.price} onChange={(e)=>setNewMedData({...newMedData, price: e.target.value})} />
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-indigo-700">Add Item</button>
                </form>
            )}

            <div className="overflow-y-auto flex-grow max-h-96 space-y-2 pr-2 custom-scrollbar">
                {inventoryList.map(m => (
                    <div key={m.medicine_id} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${m.stock < 50 ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100 hover:border-indigo-100'}`}>
                        <div>
                            <span className={`font-bold text-sm ${m.stock < 50 ? 'text-rose-700' : 'text-slate-700'}`}>{m.name}</span>
                            <p className="text-xs text-slate-400">{m.type}</p>
                        </div>
                        {editingMedicine.id === m.medicine_id ? (
                            <div className="flex gap-2">
                                <input type="number" className="w-16 p-1 border rounded text-sm text-center" value={editingMedicine.stock} onChange={(e)=>setEditingMedicine({...editingMedicine, stock: e.target.value})} />
                                <button onClick={handleUpdateStock} className="p-1.5 bg-green-100 text-green-600 rounded hover:bg-green-200"><Save className="w-4 h-4"/></button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <span className={`font-mono font-bold ${m.stock < 50 ? 'text-rose-600' : 'text-slate-600'}`}>{m.stock}</span>
                                <button onClick={()=>setEditingMedicine({id:m.medicine_id, stock:m.stock})} className="text-slate-300 hover:text-indigo-500 transition"><Edit className="w-4 h-4"/></button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* PEAK HOURS */}
        <Card title="Peak Hours Analysis" icon={BarChart3} className="border-0 shadow-lg">
            {analytics.busy_hours.length === 0 ? <p className="text-gray-400 text-center py-8">No data available.</p> : (
                <div className="space-y-4 mt-4">
                    {analytics.busy_hours.map((hour) => (
                        <div key={hour.hour_slot} className="group relative flex items-center gap-3 text-sm">
                            <span className="w-16 font-bold text-slate-600">{hour.hour_slot}:00</span>
                            <div className="flex-grow bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="bg-indigo-500 h-full rounded-full shadow-sm transition-all duration-700" style={{ width: `${(hour.count / getMaxCount(analytics.busy_hours, 'count')) * 100}%` }}></div>
                            </div>
                            <span className="w-8 text-right font-bold text-indigo-600">{hour.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
      </div>

      {/* MASTER PATIENT DIRECTORY */}
      <Card title="Master Patient Directory" icon={User} className="border-0 shadow-xl overflow-hidden">
          <div className="mb-6 relative">
            <input 
                type="text" 
                placeholder="Search by Name or Phone..." 
                className="w-full p-3 pl-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-sm" 
                value={searchTerm} 
                onChange={(e)=>setSearchTerm(e.target.value)} 
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-sm divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                      <tr>
                          <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Patient Name</th>
                          <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Last Visit</th>
                          <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Latest Bill</th>
                          <th className="px-6 py-4 text-center font-bold text-slate-500 uppercase text-xs tracking-wider">Compliance Score</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 bg-white">
                      {filteredPatients.map(p=>(
                          <tr key={p.patient_id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-4">
                                  <p className="font-bold text-slate-800 text-base">{p.name}</p>
                                  <p className="text-xs text-slate-500 font-mono">{p.phone}</p>
                              </td>
                              <td className="px-6 py-4 text-slate-600 font-medium">{p.lastVisit}</td>
                              <td className="px-6 py-4">
                                  {p.billStatus === 'N/A' ? <span className="text-slate-300">-</span> : (
                                      <div className="flex flex-col">
                                          <span className="font-bold text-slate-700">₹{p.billAmount}</span>
                                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full w-fit mt-1 ${
                                              p.billStatus === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                                              p.billStatus === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                          }`}>{p.billStatus}</span>
                                      </div>
                                  )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                  <div className={`inline-flex items-center justify-center w-12 h-8 rounded-full font-bold text-sm shadow-sm border ${
                                      p.complianceScore >= 80 ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 
                                      p.complianceScore >= 50 ? 'bg-amber-100 border-amber-200 text-amber-700' : 
                                      'bg-rose-100 border-rose-200 text-rose-700'
                                  }`}>
                                      {p.complianceScore}
                                  </div>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </Card>
    </div>
  );
};

export default ReceptionistDashboard;
