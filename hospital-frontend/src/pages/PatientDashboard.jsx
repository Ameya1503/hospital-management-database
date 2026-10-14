import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import AppointmentScheduler from '../components/AppointmentScheduler';
import { Calendar, Star, X, CreditCard, FileText, Activity, Pill, Download, CheckCircle } from 'lucide-react'; 
import { getDoctorName } from '../mockData';
import { api } from '../services/api'; 
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { io } from "socket.io-client"; 

const PatientDashboard = ({ userId, data, onSchedule, onUpdate }) => {
  const [bills, setBills] = useState([]);
  const [records, setRecords] = useState([]); 
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true); 

  const patient = data?.patients?.find(p => p.patient_id === userId);
  const patientAppointments = data?.appointments
    ?.filter(a => a.patient_id === userId)
    ?.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date)) || [];

  // --- FETCH DATA ---
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      try {
        const billsData = await api.billing.getForPatient(userId);
        setBills(billsData);
      } catch (error) { console.error("Failed to fetch bills", error); } 
      finally { setIsLoadingBills(false); }

      try {
        const historyData = await api.patients.getHistory(userId);
        setRecords(historyData);
      } catch (error) { console.error("Failed to fetch records", error); }
      finally { setIsLoadingRecords(false); }
    };

    fetchData();
  }, [userId]);

  // --- REAL-TIME SOCKET LISTENER ---
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL;
    if (!socketUrl) return undefined;
    const socket = io(socketUrl);

    socket.on("patients_updated", (eventData) => {
        if (parseInt(eventData.patient_id) === parseInt(userId)) {
            api.patients.getOne(userId).then(updatedProfile => {
                 if (onUpdate) {
                     onUpdate(prev => ({
                         ...prev,
                         patients: prev.patients.map(p => p.patient_id === userId ? updatedProfile : p)
                     }));
                 }
            });
        }
    });

    socket.on("appointment_updated", (data) => {
        if (parseInt(data.patient_id) === parseInt(userId)) {
            api.appointments.getAll().then(allAppts => {
                if (onUpdate) {
                    onUpdate(prev => ({ ...prev, appointments: allAppts }));
                }
            });
        }
    });

    socket.on("billing_updated", (data) => {
        if (!data || parseInt(data.patient_id) === parseInt(userId)) {
            api.billing.getForPatient(userId).then(billsData => {
                setBills(billsData);
            });
        }
    });

    return () => socket.disconnect();
  }, [userId, onUpdate]);

  // --- 🔴 RAZORPAY PAYMENT LOGIC ---
  const loadRazorpayScript = () => {
      return new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
      });
  };

  const handleOnlinePayment = async (bill) => {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) return alert('Failed to load Razorpay SDK. Check your internet connection.');

      try {
          // 1. Ask backend to generate an order
          const orderData = await api.billing.createOrder(bill.bill_id);

          // 2. Open the Razorpay Checkout Popup
          const options = {
              // 🔴🔴🔴 PASTE YOUR REAL TEST KEY ID HERE 🔴🔴🔴
              // It should look something like: 'rzp_test_AbCdEfGhIjKlMn'
              key: 'YOUR_NEW_RAZORPAY_TEST_KEY_ID', 
              
              amount: orderData.order.amount,
              currency: "INR",
              name: "Pulse HMS",
              description: bill.description || "Medical Services",
              order_id: orderData.order.id,
              handler: async function (response) {
                  // 3. Send success data back to backend to verify signature
                  await api.billing.verifyPayment({
                      razorpay_payment_id: response.razorpay_payment_id,
                      razorpay_order_id: response.razorpay_order_id,
                      razorpay_signature: response.razorpay_signature,
                      bill_id: bill.bill_id
                  });
                  alert('Payment Successful!');
                  // Socket.io will automatically trigger a refresh of the bills list here!
              },
              prefill: {
                  name: patient?.name,
                  contact: patient?.phone
              },
              theme: { color: "#4F46E5" }
          };

          const rzp = new window.Razorpay(options);
          rzp.open();
      } catch (error) {
          console.error("Payment setup failed:", error);
          alert("Failed to initiate payment.");
      }
  };

  // --- PDF GENERATOR ---
  const downloadMedicalReport = (record) => {
    try {
        const doc = new jsPDF();
        
        const visitDate = record.visit_date.split('T')[0];
        const linkedBill = bills.find(b => b.issued_date && b.issued_date.startsWith(visitDate));

        doc.setFillColor(79, 70, 229); 
        doc.rect(0, 0, 210, 35, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text("Pulse HMS", 14, 15);
        doc.setFontSize(10);
        doc.text("Medical Diagnosis & Invoice", 14, 22);

        doc.setTextColor(0, 0, 0);
        
        doc.setFontSize(11);
        doc.text(`Patient Name:`, 14, 45);
        doc.setFont("helvetica", "bold");
        doc.text(patient?.name || 'N/A', 45, 45);
        
        doc.setFont("helvetica", "normal");
        doc.text(`Doctor:`, 14, 52);
        doc.setFont("helvetica", "bold");
        doc.text(record.doctor_name || 'Medical Officer', 45, 52);
        
        doc.setFont("helvetica", "normal");
        doc.text(`Visit Date:`, 14, 59);
        doc.setFont("helvetica", "bold");
        doc.text(visitDate, 45, 59);

        doc.setDrawColor(200, 200, 200);
        doc.line(14, 65, 196, 65);

        let currentY = 75;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Diagnosis", 14, currentY);
        currentY += 7;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const diagnosisText = doc.splitTextToSize(record.diagnosis || 'No Diagnosis Recorded', 180);
        doc.text(diagnosisText, 14, currentY);
        currentY += (diagnosisText.length * 5) + 5;

        if (record.notes) {
            currentY += 5;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("Clinical Notes", 14, currentY);
            currentY += 7;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            const notesText = doc.splitTextToSize(record.notes, 180);
            doc.text(notesText, 14, currentY);
            currentY += (notesText.length * 5) + 10;
        } else {
            currentY += 10;
        }

        if (record.medicines && record.medicines.length > 0) {
            autoTable(doc, {
                startY: currentY,
                head: [['Medicine Name', 'Dosage', 'Duration']],
                body: record.medicines.map(m => [m.name, m.dosage, m.duration]),
                theme: 'striped',
                headStyles: { fillColor: [79, 70, 229] },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { cellWidth: 80 }, 
                    2: { cellWidth: 40 },
                },
            });
            currentY = doc.lastAutoTable.finalY + 15;
        } else {
            currentY += 10;
        }

        doc.setDrawColor(200, 200, 200);
        doc.setLineDash([2, 2], 0);
        doc.line(14, currentY, 196, currentY);
        doc.setLineDash([]); 
        currentY += 10;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229); 
        doc.text("Billing Summary", 14, currentY);
        currentY += 10;

        if (linkedBill) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);

            doc.text(`Invoice ID: #${linkedBill.bill_id}`, 14, currentY);
            doc.text(`Status: ${linkedBill.status}`, 100, currentY);
            currentY += 8;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(`Total Amount: Rs. ${linkedBill.amount}`, 14, currentY);
        } else {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text("No invoice found for this specific visit date.", 14, currentY);
        }

        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("Generated by Pulse Hospital Management System", 14, pageHeight - 10);

        doc.save(`Medical_Report_${visitDate}.pdf`);
        
    } catch (error) {
        console.error("PDF Error:", error);
        alert("Failed to generate PDF.");
    }
  };

  const handleUpdateAppointment = async (appointmentId, updateData) => {
    onUpdate(prevData => {
        const newAppointments = prevData.appointments.map(a =>
            a.appointment_id === appointmentId ? { ...a, ...updateData } : a
        );
        return { ...prevData, appointments: newAppointments };
    });
    try { await api.appointments.update(appointmentId, updateData); } catch (error) { console.error(error); }
  };

  if (!patient) return <Card title="Loading..."><p>Fetching profile...</p></Card>;

  const upcomingCount = patientAppointments.filter(a => a.status === 'Scheduled').length;
  const completedCount = patientAppointments.filter(a => a.status === 'Completed').length;
  const unpaidBillsCount = bills.filter(b => b.status === 'Pending').length;

  return (
    <div className="space-y-8">
      {/* WELCOME BANNER */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
        <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-2">Hello, {patient.name} 👋</h2>
            <p className="text-indigo-100 text-lg">Here is your daily health overview.</p>
        </div>
        <div className="relative z-10 flex gap-3 mt-4 md:mt-0">
             {patient.compliance_score !== undefined && (
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl">
                    <Activity className="w-5 h-5 text-emerald-300" />
                    <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">Compliance Score</p>
                        <p className="font-bold text-lg leading-none">{patient.compliance_score}</p>
                    </div>
                </div>
            )}
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            { label: 'Upcoming', val: upcomingCount, color: 'text-blue-600', bg: 'bg-blue-50', icon: Calendar },
            { label: 'Completed', val: completedCount, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
            { label: 'Records', val: records.length, color: 'text-violet-600', bg: 'bg-violet-50', icon: FileText },
            { label: 'Due Bills', val: unpaidBillsCount, color: 'text-rose-600', bg: 'bg-rose-50', icon: CreditCard },
        ].map((stat, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-slate-800">{stat.val}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                </div>
            </div>
        ))}
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-8">
             <AppointmentScheduler
                patientId={userId}
                doctors={data?.doctors || []}
                onSchedule={onSchedule}
            />

            {/* MEDICAL HISTORY */}
            <Card title="Medical History" icon={FileText}>
                {isLoadingRecords ? (
                    <p className="text-slate-400 p-4 text-center">Loading records...</p>
                ) : records.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                        <p className="text-slate-500 font-medium">No diagnosis records found.</p>
                    </div>
                ) : (
                    <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {records.map(rec => (
                            <div key={rec.record_id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 hover:border-indigo-100 transition-colors">
                                <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-200">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-lg">{rec.diagnosis}</h4>
                                        <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">{rec.visit_date.split('T')[0]} • Dr. {rec.doctor_name}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => downloadMedicalReport(rec)}
                                            className="text-xs bg-white text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 font-bold hover:bg-indigo-50 transition flex items-center gap-1"
                                            title="Download PDF Report"
                                        >
                                            <Download className="w-3 h-3" /> PDF
                                        </button>
                                        
                                        {rec.file_path && (
                                            <a href={rec.file_path} target="_blank" rel="noreferrer" className="text-xs bg-white text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 font-bold hover:bg-slate-50 transition">
                                                📎 File
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4 text-sm mb-4">
                                    {rec.notes && (
                                        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-slate-700">
                                            <span className="font-bold text-amber-700 text-xs uppercase mr-2">Notes</span>
                                            {rec.notes}
                                        </div>
                                    )}
                                    {rec.treatment_plan && (
                                        <p className="text-slate-600 px-2"><span className="font-bold text-slate-800">Plan:</span> {rec.treatment_plan}</p>
                                    )}
                                </div>
                                {rec.medicines && rec.medicines.length > 0 && (
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-slate-100 text-slate-500 text-xs uppercase">
                                                <tr><th className="px-4 py-2 text-left">Rx</th><th className="px-4 py-2 text-left">Dosage</th><th className="px-4 py-2 text-left">Duration</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {rec.medicines.map((med, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-4 py-2 font-bold text-slate-700">{med.name}</td>
                                                        <td className="px-4 py-2 text-indigo-600 font-mono text-xs font-bold">{med.dosage}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{med.duration || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* --- UPDATED BILLING HISTORY WITH RAZORPAY --- */}
            <Card title="Billing History" icon={CreditCard}>
                {isLoadingBills ? <p className="text-center text-slate-400 py-4">Loading...</p> : bills.length === 0 ? <p className="text-center text-slate-400 py-8">No bills found.</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-3 text-left">Date</th>
                                    <th className="px-4 py-3 text-left">Description</th>
                                    <th className="px-4 py-3 text-left">Amount</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {bills.map(b => (
                                    <tr key={b.bill_id} className="hover:bg-slate-50 transition">
                                        <td className="px-4 py-4 font-medium text-slate-600">{(b.issued_date || b.bill_date || '').split('T')[0]}</td>
                                        <td className="px-4 py-4 text-slate-500 text-xs max-w-[150px] truncate" title={b.description || 'Consultation'}>{b.description || 'Consultation'}</td>
                                        <td className="px-4 py-4 font-bold text-slate-800">₹{b.amount}</td>
                                        
                                        {/* 🔴 THE PAY NOW BUTTON LOGIC */}
                                        <td className="px-4 py-4 flex items-center gap-3">
                                            <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                                                b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                                                b.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {b.status}
                                            </span>
                                            
                                            {b.status === 'Pending' && (
                                                <button 
                                                    onClick={() => handleOnlinePayment(b)}
                                                    className="text-[10px] bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold uppercase tracking-wide hover:bg-indigo-700 shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
                                                >
                                                    Pay Now
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-1">
            <Card title="My Appointments" icon={Calendar} className="h-full">
                {patientAppointments.length === 0 ? <p className="text-slate-400 text-center py-12">No appointments.</p> : (
                    <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                        {patientAppointments.map(a => (
                            <div key={a.appointment_id} className={`p-5 rounded-2xl border transition-all hover:shadow-md ${a.is_emergency?'bg-rose-50 border-rose-100':'bg-white border-slate-100'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <p className="font-bold text-slate-800 text-lg">{a.appointment_date}</p>
                                        <p className="text-sm font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md w-fit mt-1">{a.appointment_time ? a.appointment_time.slice(0,5) : 'Time N/A'}</p>
                                    </div>
                                    <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ${
                                        a.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                                        a.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {a.status}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-slate-600 mb-4">Dr. {getDoctorName(a.doctor_id)}</p>
                                
                                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                                    {a.status === 'Scheduled' && (
                                        <button onClick={() => handleUpdateAppointment(a.appointment_id, { status: 'Cancelled' })} className="text-xs text-rose-500 font-bold hover:bg-rose-50 px-2 py-1 rounded transition flex items-center">
                                            <X className="w-3 h-3 mr-1"/> Cancel
                                        </button>
                                    )}
                                    {a.status === 'Completed' && (
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-lg">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Rate</span>
                                            <StarRating rating={a.doctor_rating || 0} onRate={(r) => handleUpdateAppointment(a.appointment_id, { doctor_rating: r })} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
      </div>
    </div>
  );
};

const StarRating = ({ rating, onRate }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex space-x-1">
      {[...Array(5)].map((_, i) => {
        const v = i + 1;
        return (
          <label key={i}><input type="radio" className="hidden" onClick={()=>onRate(v)}/><Star className={`w-4 h-4 cursor-pointer transition-transform hover:scale-110 ${v<=(hover||rating)?'fill-amber-400 text-amber-400':'text-slate-200'}`} onMouseEnter={()=>setHover(v)} onMouseLeave={()=>setHover(0)}/></label>
        );
      })}
    </div>
  );
};

export default PatientDashboard;
