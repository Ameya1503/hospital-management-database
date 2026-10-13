// src/mockData.js

export const MOCK_DATA = {
  doctors: [
    { doctor_id: 1, name: 'Dr. Anil Patil', specialization: 'Cardiologist', department_id: 1 },
    { doctor_id: 2, name: 'Dr. Nisha Rao', specialization: 'Neurologist', department_id: 2 },
    { doctor_id: 3, name: 'Dr. Rajesh Kulkarni', specialization: 'Orthopedic Surgeon', department_id: 3 },
    { doctor_id: 4, name: 'Dr. Sneha Joshi', specialization: 'Pediatrician', department_id: 4 },
  ],

  // --- APPOINTMENTS ARE GONE ---

  // --- MEDICAL RECORDS ARE GONE ---
  
  departments: [
    { department_id: 1, name: 'Cardiology' },
    { department_id: 2, name: 'Neurology' },
    { department_id: 3, name: 'Orthopedics' },
    { department_id: 4, name: 'Pediatrics' },
  ],
  medicines: [
    { medicine_id: 1, name: 'Paracetamol', stock: 200, storage_location: 'Pharmacy Shelf A' },
    { medicine_id: 2, name: 'Amoxicillin', stock: 100, storage_location: 'Cold Storage B' },
    { medicine_id: 3, name: 'Ibuprofen', stock: 150, storage_location: 'Pharmacy Shelf A' },
    { medicine_id: 4, name: 'Cough Syrup', stock: 50, storage_location: 'Pharmacy Shelf A' },
  ]
};

// --- UTILITY FUNCTIONS ---
export const getDoctorName = (id) => MOCK_DATA.doctors.find(d => d.doctor_id === id)?.name || 'N/A';
export const getPatientName = (id, patients) => patients.find(p => p.patient_id === id)?.name || 'N/A';
export const getDepartmentName = (id) => MOCK_DATA.departments.find(d => d.department_id === id)?.name || 'N/A';