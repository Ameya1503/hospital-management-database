import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Pill, AlertCircle, Upload, X, Clock, CheckSquare } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css'; // Import Quill styles
import Card from './Card';
import { api } from '../services/api';

// Define the toolbar options outside the component to prevent re-rendering issues
const quillModules = {
    toolbar: [
        [{ 'list': 'bullet' }, { 'list': 'ordered' }]
    ]
};

const AddRecordForm = ({ patient, doctorId, appointmentId, onRecordAdded, refreshTrigger }) => {
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Medicine State
  const [availableMeds, setAvailableMeds] = useState([]);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [medQuantity, setMedQuantity] = useState(1);
  const [medDosage, setMedDosage] = useState('');
  const [medDuration, setMedDuration] = useState(''); 
  const [prescribedMeds, setPrescribedMeds] = useState([]);

  // Checkbox State
  const [buyFromHospital, setBuyFromHospital] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch Meds (Runs on mount AND when refreshTrigger changes)
  useEffect(() => {
    const fetchMeds = async () => {
      try {
        const meds = await api.inventory.getAll();
        setAvailableMeds(meds);
      } catch (err) { console.error("Failed to load medicines", err); }
    };
    fetchMeds();
  }, [refreshTrigger]);

  const handleAddMedicine = () => {
    if (!selectedMedId || !medQuantity || !medDosage || !medDuration) {
        setError("Please fill all medicine fields (Name, Qty, Dosage, Duration).");
        return;
    }

    const medInfo = availableMeds.find(m => m.medicine_id === parseInt(selectedMedId));
    if (!medInfo) return;

    if (medInfo.stock < medQuantity) {
        setError(`Insufficient stock for ${medInfo.name}. Only ${medInfo.stock} left.`);
        return;
    }

    setPrescribedMeds([...prescribedMeds, {
        medicine_id: medInfo.medicine_id,
        name: medInfo.name,
        quantity: parseInt(medQuantity),
        dosage: medDosage,
        duration: medDuration 
    }]);

    // Reset inputs
    setSelectedMedId('');
    setMedQuantity(1);
    setMedDosage('');
    setMedDuration('');
    setError('');
  };

  const handleRemoveMedicine = (index) => {
    const newList = [...prescribedMeds];
    newList.splice(index, 1);
    setPrescribedMeds(newList);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!diagnosis) { setError('Diagnosis is required.'); return; }
    
    // --- UX FIX: WARN IF MEDICINE INPUTS ARE FILLED BUT NOT ADDED ---
    if (selectedMedId && (prescribedMeds.length === 0)) {
        setError("You selected a medicine but didn't click the '+' button to add it!");
        return;
    }

    setIsSubmitting(true);
    setError('');

    let uploadedFilePath = null;

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('medicalFile', selectedFile);
        const uploadResult = await api.upload(formData);
        uploadedFilePath = uploadResult.filePath;
      }

      const fullData = {
        patient_id: patient.patient_id,
        doctor_id: doctorId,
        appointment_id: appointmentId, 
        diagnosis,
        notes,
        treatment_plan: treatmentPlan,
        medicines: prescribedMeds,
        deduct_inventory: buyFromHospital,
        file_path: uploadedFilePath
      };

      await api.prescriptions.create(fullData);
      
      // Reset Form
      setDiagnosis(''); setNotes(''); setTreatmentPlan(''); 
      setPrescribedMeds([]); setSelectedFile(null); 
      setBuyFromHospital(false); // Reset Checkbox
      
      onRecordAdded(); 

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card title={`Rx: Prescribe for ${patient.name}`} icon={FileText} className="bg-white border-l-4 border-l-indigo-600">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {error && <div className="bg-red-50 text-red-700 p-3 rounded flex items-center text-sm font-medium border border-red-100"><AlertCircle className="w-4 h-4 mr-2"/> {error}</div>}

        <div className="grid grid-cols-1 gap-3">
            <input type="text" placeholder="Diagnosis (e.g., Viral Fever)" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="w-full p-2 border border-slate-300 rounded focus:border-indigo-500 outline-none" required />
            
            {/* RICH TEXT EDITOR: Clinical Notes */}
            <div className="bg-white border border-slate-300 rounded overflow-hidden focus-within:border-indigo-500">
                <ReactQuill 
                    theme="snow" 
                    value={notes} 
                    onChange={setNotes} 
                    modules={quillModules}
                    placeholder="Clinical Notes & Observations"
                    className="h-32 mb-10" // mb-10 prevents text from hiding behind the box bottom
                />
            </div>
        </div>

        {/* --- FIXED UPLOAD BUTTON --- */}
        <div className="flex items-center gap-3">
            <label 
                htmlFor="medical-upload"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${selectedFile ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
                <Upload className="w-4 h-4 pointer-events-none" />
                <span className="text-sm font-medium pointer-events-none">{selectedFile ? 'Change File' : 'Attach X-Ray / Report'}</span>
            </label>
            
            <input 
                id="medical-upload" 
                type="file" 
                className="hidden" 
                onChange={handleFileChange} 
            />

            {selectedFile && (
                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs text-slate-700 border border-slate-200">
                    <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                    <button type="button" onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                </div>
            )}
        </div>

        {/* MEDICINE INPUT SECTION */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><Pill className="w-4 h-4 mr-2 text-indigo-500"/> Add Medicines</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Medicine</label>
                    <select className="w-full p-2 border border-slate-300 rounded text-sm bg-white focus:ring-2 focus:ring-indigo-200 outline-none" value={selectedMedId} onChange={(e) => setSelectedMedId(e.target.value)}>
                        <option value="">-- Select --</option>
                        {availableMeds.map(m => <option key={m.medicine_id} value={m.medicine_id} disabled={m.stock === 0}>{m.name} (Stock: {m.stock})</option>)}
                    </select>
                </div>
                <div className="md:col-span-3">
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Dosage</label>
                    <input type="text" placeholder="e.g. 1-0-1" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" value={medDosage} onChange={(e) => setMedDosage(e.target.value)}/>
                </div>
                <div className="md:col-span-3">
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Duration</label>
                    <input type="text" placeholder="e.g. 5 Days" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" value={medDuration} onChange={(e) => setMedDuration(e.target.value)}/>
                </div>
                <div className="md:col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Qty</label>
                    <input type="number" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-indigo-200 outline-none" min="1" value={medQuantity} onChange={(e) => setMedQuantity(e.target.value)}/>
                </div>
                <div className="md:col-span-1">
                    <button type="button" onClick={handleAddMedicine} disabled={!selectedMedId} className="w-full bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 shadow-md transition active:scale-95 flex justify-center items-center h-[38px]">
                        <Plus className="w-5 h-5"/>
                    </button>
                </div>
            </div>

            {/* List of Added Meds */}
            {prescribedMeds.length > 0 && (
                <div className="mt-4 space-y-2">
                    {prescribedMeds.map((med, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm animate-fade-in">
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-700">{med.name}</span>
                                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-mono">{med.dosage}</span>
                                <span className="text-slate-500 text-xs">{med.duration}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-slate-400 text-xs font-bold">Qty: {med.quantity}</span>
                                <button type="button" onClick={() => handleRemoveMedicine(idx)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4"/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* RICH TEXT EDITOR: Treatment Plan */}
        <div className="bg-white border border-slate-300 rounded overflow-hidden focus-within:border-indigo-500 mt-4">
            <ReactQuill 
                theme="snow" 
                value={treatmentPlan} 
                onChange={setTreatmentPlan} 
                modules={quillModules}
                placeholder="Additional Treatment Instructions..."
                className="h-24 mb-10"
            />
        </div>
        
        {/* Inventory Checkbox */}
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <input 
                type="checkbox" 
                id="pharmacyCheck"
                checked={buyFromHospital}
                onChange={(e) => setBuyFromHospital(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300 cursor-pointer"
            />
            <label htmlFor="pharmacyCheck" className="text-sm font-bold text-emerald-900 cursor-pointer select-none">
                Purchasing from Hospital Pharmacy?
                <span className="block text-[10px] font-normal text-emerald-700 mt-0.5">
                    (Auto-deducts stock from Inventory)
                </span>
            </label>
        </div>

        <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold hover:bg-indigo-700 transition duration-150 disabled:opacity-50 shadow-lg shadow-indigo-200">
          {isSubmitting ? 'Processing...' : 'Submit Prescription'}
        </button>
      </form>
    </Card>
  );
};

export default AddRecordForm;