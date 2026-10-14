import React, { useState, useEffect } from 'react';
import { Calendar, Clock, AlertCircle, Sparkles, BrainCircuit } from 'lucide-react'; 
import Card from './Card'; 
import { api } from '../services/api';

const AppointmentScheduler = ({ patientId, doctors, onSchedule }) => {
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState(''); 
  const [isEmergency, setIsEmergency] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // --- NEW: AI TRIAGE STATE ---
  const [isTriageMode, setIsTriageMode] = useState(false);
  const [symptomsRaw, setSymptomsRaw] = useState('');
  const [symptomsMedical, setSymptomsMedical] = useState('');
  const [patientExplanation, setPatientExplanation] = useState(''); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [triageSuccess, setTriageSuccess] = useState('');

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 10; hour <= 22; hour++) {
      const timeValue = `${hour.toString().padStart(2, '0')}:00`;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour;
      const label = `${displayHour}:00 ${ampm}`;
      slots.push({ value: timeValue, label: label });
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // --- NEW: HANDLE AI ANALYSIS ---
  const handleAnalyzeSymptoms = async () => {
    if (!symptomsRaw.trim()) {
        setError("Please describe your problem first.");
        return;
    }
    
    setIsAnalyzing(true);
    setError('');
    setTriageSuccess('');
    setPatientExplanation(''); 

    try {
        // 🔴 THE FIX: GRAB THE TOKEN AND PASS IT TO THE BOUNCER
        const data = await api.triage(symptomsRaw, doctors);

        // Auto-select the doctor the AI recommended!
        setSelectedDoctorId(data.recommended_doctor_id.toString());
        setSymptomsMedical(data.medical_terms); 
        setPatientExplanation(data.patient_friendly_explanation); 
        setTriageSuccess(`AI Recommendation: We have selected Dr. ${data.recommended_doctor_name} (${data.specialty}) based on your symptoms.`);
        
    } catch (err) {
        setError("Our AI is currently unavailable. Please select a doctor manually from the dropdown.");
        console.error(err);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId || !appointmentDate || !appointmentTime) return;

    setIsSubmitting(true);
    setError('');

    const newAppointmentData = {
      patient_id: patientId,
      doctor_id: parseInt(selectedDoctorId),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime, 
      is_emergency: isEmergency,
      symptoms_raw: isTriageMode ? symptomsRaw : null,
      symptoms_medical: isTriageMode ? symptomsMedical : null
    };

    try {
      // 🔴 THE FIX: ATTACH THE TOKEN HERE AS WELL
      const result = await api.appointments.create(newAppointmentData);

      onSchedule(result);
      
      // Reset Form
      setSelectedDoctorId('');
      setAppointmentDate('');
      setAppointmentTime(''); 
      setIsEmergency(false);
      setIsTriageMode(false);
      setSymptomsRaw('');
      setSymptomsMedical('');
      setPatientExplanation(''); 
      setTriageSuccess('');

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Card title="Schedule New Appointment" icon={Calendar} className="col-span-1 md:col-span-2 border-t-4 border-t-indigo-500">
      
      {/* AI TRIAGE TOGGLE */}
      <div className="mb-6 flex justify-end">
          <button 
              type="button" 
              onClick={() => setIsTriageMode(!isTriageMode)}
              className={`flex items-center px-4 py-2 rounded-full text-sm font-bold transition-all ${isTriageMode ? 'bg-indigo-100 text-indigo-700 shadow-inner' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:scale-105'}`}
          >
              <Sparkles className="w-4 h-4 mr-2" />
              {isTriageMode ? 'Switch to Manual Selection' : 'Confused? Let AI choose the doctor'}
          </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {error && (
          <div className="col-span-full bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center text-sm font-medium">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* --- AI TRIAGE INPUT AREA --- */}
        {isTriageMode && (
            <div className="col-span-full bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-2 animate-fade-in">
                <label className="block text-sm font-bold text-indigo-900 mb-2 flex items-center">
                    <BrainCircuit className="w-4 h-4 mr-1 text-indigo-600"/> Describe your problem in your own words
                </label>
                <div className="flex gap-2">
                    <textarea 
                        value={symptomsRaw}
                        onChange={(e) => setSymptomsRaw(e.target.value)}
                        placeholder="e.g., 'My stomach hurts really bad after eating spicy food and I feel nauseous...'"
                        className="flex-grow p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none h-20"
                    />
                    <button 
                        type="button" 
                        onClick={handleAnalyzeSymptoms}
                        disabled={isAnalyzing || !symptomsRaw.trim()}
                        className="bg-indigo-600 text-white px-4 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition whitespace-nowrap flex flex-col items-center justify-center min-w-[120px]"
                    >
                        {isAnalyzing ? (
                            <span className="animate-pulse">Thinking...</span>
                        ) : (
                            <>Analyze <br/> Symptoms</>
                        )}
                    </button>
                </div>
                
                {/* --- UPDATED: LAYMAN'S EXPLANATION BOX --- */}
                {triageSuccess && (
                    <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm animate-slide-in">
                        <div className="font-bold text-emerald-800 flex items-center mb-2">
                            <Sparkles className="w-5 h-5 mr-2 text-emerald-600"/> 
                            {triageSuccess}
                        </div>
                        <p className="text-sm text-emerald-700 leading-relaxed italic">
                            "{patientExplanation}"
                        </p>
                    </div>
                )}
            </div>
        )}
        
        {/* 1. Doctor Selection */}
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white ${triageSuccess ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-300'}`}
            required
            disabled={isSubmitting || (isTriageMode && triageSuccess)} // Lock if AI selected it
          >
            <option value="" disabled>-- Choose Specialist --</option>
            {doctors.map(d => {
              let ratingDisplay = '(New)';
              if (d.average_rating !== undefined && d.average_rating !== null) {
                  const num = parseFloat(d.average_rating);
                  if (!isNaN(num) && num > 0) ratingDisplay = `⭐ ${num.toFixed(1)}`;
              }
              return (
                <option key={d.doctor_id} value={d.doctor_id}>
                  {d.name} ({d.specialization}) {ratingDisplay}
                </option>
              );
            })}
          </select>
        </div>

        {/* 2. Date Selection */}
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            min={today} 
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            required
            disabled={isSubmitting}
          />
        </div>

        {/* 3. Time Selection */}
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Time Slot</label>
          <div className="relative">
            <select
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 pl-9 appearance-none bg-white"
              required
              disabled={isSubmitting}
            >
              <option value="" disabled>-- Select Hour --</option>
              {timeSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
            <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
          </div>
        </div>

        {/* 4. Submit */}
        <div className="col-span-1 flex items-end gap-2">
          <label className={`flex items-center justify-center px-3 py-2 rounded border cursor-pointer transition-colors h-[42px] ${isEmergency ? 'bg-red-100 border-red-500' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500 mr-2"
              disabled={isSubmitting}
            />
            <span className={`text-xs font-bold ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
               Urgent
            </span>
          </label>
            
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-grow h-[42px] bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-150 shadow-md disabled:opacity-50 font-semibold text-sm"
          >
            {isSubmitting ? 'Booking...' : 'Confirm'}
          </button>
        </div>

      </form>
    </Card>
  );
};

export default AppointmentScheduler;
