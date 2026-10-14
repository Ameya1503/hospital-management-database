// Adapter between the existing React screens and the Django REST API.
// UI-facing field names stay stable while Django uses normalized models.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const endpoint = (path) => {
  const [pathname, query = ''] = path.replace(/^\//, '').split('?');
  return `${API_BASE_URL}/${pathname.replace(/\/$/, '')}/${query ? `?${query}` : ''}`;
};

const handleResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.detail || body.error || Object.values(body).flat().join(' ') || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
};

const getHeaders = (isMultipart = false) => {
  // Avoid legacy cache-control headers: browsers include them in the CORS
  // preflight request, while Django only needs Authorization and Content-Type.
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Token ${token}`;
  if (!isMultipart) headers['Content-Type'] = 'application/json';
  return headers;
};

const request = (path, options = {}) => fetch(endpoint(path), options).then(handleResponse);
const list = (data) => Array.isArray(data) ? data : (data.results || []);
const fullName = (user) => `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
const normalizeUser = (user) => ({ ...user, name: fullName(user), patient_id: user.role === 'patient' ? user.profile_id : null, doctor_id: user.role === 'doctor' ? user.profile_id : null });
const normalizePatient = (patient) => ({ ...patient, patient_id: patient.id, phone: patient.phone || '' });
const normalizeDoctor = (doctor) => ({ ...doctor, doctor_id: doctor.id, average_rating: doctor.rating });
const normalizeMedicine = (medicine) => ({ ...medicine, medicine_id: medicine.id });
const normalizeAppointment = (appointment) => {
  const startsAt = new Date(appointment.starts_at);
  return {
    ...appointment, appointment_id: appointment.id, patient_id: appointment.patient, doctor_id: appointment.doctor, status: String(appointment.status || '').replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase()),
    appointment_date: Number.isNaN(startsAt.valueOf()) ? '' : startsAt.toISOString().slice(0, 10),
    appointment_time: Number.isNaN(startsAt.valueOf()) ? '' : startsAt.toTimeString().slice(0, 5),
  };
};
const normalizeRecord = (record) => ({ ...record, record_id: record.id, patient_id: record.patient, doctor_id: record.doctor, appointment_id: record.appointment, medicines: (record.prescriptions || []).map((item) => ({ ...item, medicine_id: item.medicine, name: item.medicine_name || `Medicine #${item.medicine}` })) });
const normalizeBill = (bill) => ({ ...bill, bill_id: bill.id, patient_id: bill.patient, appointment_id: bill.appointment, status: String(bill.status || '').replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase()) });

export const api = {
  auth: {
    login: (email, password) => request('auth/login', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email, password }) }).then((data) => ({ ...data, user: normalizeUser(data.user) })),
    loginPatient: (email, password) => api.auth.login(email, password),
    loginStaff: (_role, email, password) => api.auth.login(email, password),
    sendOtp: (_phone, email) => request('auth/patients/request-code', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email }) }),
    registerPatient: (data) => request('auth/patients/register', { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then((result) => ({ ...result, user: normalizeUser(result.user) })),
    requestPasswordReset: (email) => request('auth/password-reset/request', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email }) }),
    confirmPasswordReset: (email, code, new_password) => request('auth/password-reset/confirm', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ email, code, new_password }) }),
  },
  patients: {
    getAll: () => request('patients', { headers: getHeaders() }).then(list).then((items) => items.map(normalizePatient)),
    getOne: (id) => request(`patients/${id}`, { headers: getHeaders() }).then(normalizePatient),
    getHistory: (id) => request(`records?patient=${id}`, { headers: getHeaders() }).then(list).then((items) => items.map(normalizeRecord)),
    createRecord: (data) => request('records', { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(normalizeRecord),
    updateCompliance: (id, score) => request(`patients/${id}/compliance`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ score }) }).then(normalizePatient),
  },
  appointments: {
    getAll: () => request('appointments', { headers: getHeaders() }).then(list).then((items) => items.map(normalizeAppointment)),
    create: (data) => request('appointments', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ patient: data.patient_id, doctor: data.doctor_id, starts_at: data.starts_at || `${data.appointment_date}T${data.appointment_time}:00+05:30`, is_emergency: Boolean(data.is_emergency), symptoms_raw: data.symptoms_raw || '', symptoms_medical: data.symptoms_medical || '' }) }).then(normalizeAppointment),
    update: (id, data) => request(`appointments/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ ...data, status: data.status ? String(data.status).toLowerCase().replace(/\s+/g, '_') : undefined }) }).then(normalizeAppointment),
    getDoctorAnalytics: (doctorId) => request(`doctors/${doctorId}/analytics`, { headers: getHeaders() }).then((data) => ({ ...data, upcoming_appointments: (data.upcoming_appointments || []).map(normalizeAppointment) })),
  },
  doctors: { getAll: () => request('doctors', { headers: getHeaders() }).then(list).then((items) => items.map(normalizeDoctor)) },
  billing: {
    getAll: () => request('bills', { headers: getHeaders() }).then(list).then((items) => items.map(normalizeBill)),
    getForPatient: (patientId) => api.billing.getAll().then((items) => items.filter((bill) => Number(bill.patient_id) === Number(patientId))),
    create: (data) => request('bills', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ patient: data.patient_id, appointment: data.appointment_id || null, amount: data.amount, description: data.description }) }).then(normalizeBill),
    updateStatus: (id, status) => request(`bills/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status: String(status).toLowerCase().replace(/\s+/g, '_') }) }).then(normalizeBill),
    markPaid: (id) => api.billing.updateStatus(id, 'paid'),
    createOrder: (bill_id) => request('payments/orders', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ bill_id }) }),
    verifyPayment: (data) => request('payments/verify', { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }),
  },
  inventory: {
    getAll: () => request('medicines', { headers: getHeaders() }).then(list).then((items) => items.map(normalizeMedicine)),
    add: (data) => request('medicines', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ...data, medicine_type: data.medicine_type || data.type }) }).then(normalizeMedicine),
    updateStock: (id, stock) => request(`medicines/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ stock }) }).then(normalizeMedicine),
  },
  prescriptions: {
    create: (data) => request('prescriptions', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ patient: data.patient_id, appointment: data.appointment_id || null, diagnosis: data.diagnosis, notes: data.notes || '', treatment_plan: data.treatment_plan || '', dispense_from_hospital: Boolean(data.deduct_inventory), medicines: (data.medicines || []).map((item) => ({ medicine: item.medicine_id, dosage: item.dosage, duration: item.duration, instructions: item.instructions || '', quantity: item.quantity })) }) }),
  },
  reports: { getReceptionStats: () => request('analytics/reception', { headers: getHeaders() }) },
  triage: (symptoms, available_doctors) => request('triage', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ symptoms, available_doctors }) }),
  upload: () => Promise.reject(new Error('Clinical attachments require private object storage and are not enabled in this demo deployment.')),
};
