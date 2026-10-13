// src/services/api.js

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Helper to handle responses and errors consistently
const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown API Error' }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }
  return response.json();
};

// Helper to prevent caching (CRITICAL for Syncing) and INJECT JWT
const getHeaders = (isMultipart = false) => {
  const headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
  
  // --- 🔴 THE JWT BOUNCER PASS ---
  // Grab the token from storage and attach it to the header
  const token = localStorage.getItem('token');
  if (token) {
      headers['Authorization'] = `Bearer ${token}`;
  }

  // For JSON requests, add Content-Type. For File Uploads (Multipart), let browser set it.
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

export const api = {
  // --- AUTHENTICATION ---
  auth: {
    // 🔴 UPDATED: Now accepts and sends both phone and email
    sendOtp: (phone, email) => 
      fetch(`${API_BASE_URL}/send-otp`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify({ phone, email }) 
      }).then(handleResponse),

    loginPatient: (phone, password) => 
      fetch(`${API_BASE_URL}/patients/login`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify({ phone, password }) 
      }).then(handleResponse),

    loginStaff: (role, id, password) => 
      fetch(`${API_BASE_URL}/staff/login`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify({ role, id, password }) 
      }).then(handleResponse),

    registerPatient: (data) =>
      fetch(`${API_BASE_URL}/patients`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
  },

  // --- PATIENTS & RECORDS ---
  patients: {
    getAll: () => fetch(`${API_BASE_URL}/patients?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    getOne: (id) => fetch(`${API_BASE_URL}/patients/${id}?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),

    getHistory: (id) => fetch(`${API_BASE_URL}/records/${id}?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    createRecord: (data) => 
      fetch(`${API_BASE_URL}/records`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),

    updateCompliance: (id, score) => 
      fetch(`${API_BASE_URL}/patients/${id}/compliance`, { 
        method: 'PATCH', 
        headers: getHeaders(), 
        body: JSON.stringify({ score }) 
      }).then(handleResponse),
  },

  // --- APPOINTMENTS ---
  appointments: {
    getAll: () => fetch(`${API_BASE_URL}/appointments?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    create: (data) => 
      fetch(`${API_BASE_URL}/appointments`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
      
    update: (id, data) => 
      fetch(`${API_BASE_URL}/appointments/${id}`, { 
        method: 'PATCH', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
      
    getDoctorAnalytics: (doctorId) => 
      fetch(`${API_BASE_URL}/doctors/analytics/${doctorId}?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
  },

  // --- DOCTORS ---
  doctors: {
    getAll: () => fetch(`${API_BASE_URL}/doctors?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
  },

  // --- BILLING & PAYMENTS ---
  billing: {
    getAll: () => fetch(`${API_BASE_URL}/bills?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    getForPatient: (patientId) => fetch(`${API_BASE_URL}/bills/patient/${patientId}?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    create: (data) => 
      fetch(`${API_BASE_URL}/bills`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
      
    markPaid: (id) => 
      fetch(`${API_BASE_URL}/bills/${id}`, { 
        method: 'PATCH', 
        headers: getHeaders(), 
        body: JSON.stringify({ status: 'Paid' }) 
      }).then(handleResponse),

    // --- RAZORPAY ENDPOINTS ---
    createOrder: (bill_id) => 
      fetch(`${API_BASE_URL}/payments/create-order`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify({ bill_id }) 
      }).then(handleResponse),

    verifyPayment: (data) => 
      fetch(`${API_BASE_URL}/payments/verify`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
  },

  // --- INVENTORY ---
  inventory: {
    getAll: () => fetch(`${API_BASE_URL}/medicines?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
    
    add: (data) => 
      fetch(`${API_BASE_URL}/medicines`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),

    updateStock: (id, stock) => 
      fetch(`${API_BASE_URL}/medicines/${id}`, { 
        method: 'PATCH', 
        headers: getHeaders(), 
        body: JSON.stringify({ stock }) 
      }).then(handleResponse),
  },

  // --- PRESCRIPTIONS ---
  prescriptions: {
    create: (data) => 
      fetch(`${API_BASE_URL}/prescriptions`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify(data) 
      }).then(handleResponse),
  },

  // --- ANALYTICS & REPORTS ---
  reports: {
    getReceptionStats: () => fetch(`${API_BASE_URL}/analytics/reception?t=${Date.now()}`, { headers: getHeaders() }).then(handleResponse),
  },
  
  // --- FILES ---
  upload: (formData) => 
    fetch(`${API_BASE_URL}/upload`, { 
      method: 'POST', 
      headers: getHeaders(true), 
      body: formData 
    }).then(handleResponse),
};
