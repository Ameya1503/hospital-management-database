// --- HOSPITAL MANAGEMENT SYSTEM API (Refactored & Real-Time) ---
require('dotenv').config();
const express = require('express');
const http = require('http'); 
const { Server } = require("socket.io"); 
const cors = require('cors');
const path = require('path');
const pool = require('./config/db'); 
const cron = require('node-cron'); 
const { sendAppointmentConfirmation } = require('./utils/emailService'); 
const { verifyToken } = require('./middleware/authMiddleware');

// --- 🔴 NEW: IMPORT SECURITY PACKAGES ---
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import Routes
const authRoutes = require('./routes/auth');
const appointmentRoutes = require('./routes/appointments');
const patientRoutes = require('./routes/patients');
const billingRoutes = require('./routes/billing');
const inventoryRoutes = require('./routes/inventory');
const uploadRoutes = require('./routes/uploads');
const analyticsRoutes = require('./routes/analytics');
const doctorRoutes = require('./routes/doctors');
const prescriptionRoutes = require('./routes/prescriptions');
const triageRoutes = require('./routes/triage');
const paymentRoutes = require('./routes/payments');

const app = express();
app.set('trust proxy', 1);

// 🔴 RENDER FIX: Allow the cloud to assign the port dynamically
const PORT = process.env.PORT || 3001;

// ==========================================
// 🔴 THE CORS FIX: Array of allowed websites
// ==========================================
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const server = http.createServer(app); 

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS, // <-- Applied the array here for WebSockets
    methods: ["GET", "POST"]
  }
});
app.set('io', io);

// ==========================================
// 🛡️ ENTERPRISE SECURITY MIDDLEWARE
// ==========================================

// 1. Helmet: Secures HTTP headers, hides Express signature, prevents XSS
app.use(helmet()); 
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" })); // Allows frontend to fetch images/PDFs safely

// 2. Standard Rate Limiter (Protects general API routes from DDoS)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150, // Limit each IP to 150 requests per window
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
    standardHeaders: true, 
    legacyHeaders: false, 
});

// 3. Strict Auth Limiter (Prevents Brute-Force Password Hacking)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 10,
    message: { error: 'Too many login attempts from this IP, please try again after an hour.' }
});

// Standard Parsers
app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGINS, // <-- Applied the array here for the API
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));

// Apply General Rate Limiter to all /api routes
app.use('/api', apiLimiter);

// Serve Static Files safely
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 🚀 ROUTES
// ==========================================

// 🔓 UNPROTECTED ROUTES (Apply Strict Limiter here!)
app.use('/api', authLimiter, authRoutes);

// 🔒 PROTECTED ROUTES (Requires JWT)
app.use('/api', verifyToken, appointmentRoutes);
app.use('/api', verifyToken, patientRoutes);
app.use('/api', verifyToken, billingRoutes);
app.use('/api', verifyToken, inventoryRoutes);
app.use('/api', verifyToken, uploadRoutes);
app.use('/api', verifyToken, analyticsRoutes);
app.use('/api', verifyToken, doctorRoutes);
app.use('/api', verifyToken, prescriptionRoutes);
app.use('/api', verifyToken, triageRoutes);
app.use('/api', verifyToken, paymentRoutes);

// Root Route
app.get('/', (req, res) => {
  res.send({ message: 'Pulse HMS Secure API Running' });
});

// --- TEMPORARY RESET ROUTE (Delete after use) ---
const bcrypt = require('bcrypt');
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEVELOPMENT_RESET === 'true') {
app.post('/api/reset-all', async (req, res) => {
  try {
    const newHash = await bcrypt.hash('password123', 10);
    // 🔴 TiDB LOWERCASE FIX APPLIED
    await pool.query('UPDATE doctor SET password_hash = ?', [newHash]);
    await pool.query('UPDATE staff SET password_hash = ?', [newHash]);
    await pool.query('UPDATE patient SET password_hash = ?', [newHash]);

    res.send(`
      <h1>✅ Success!</h1>
      <p>All Doctors, Staff, and Patients now have the password: <b>password123</b></p>
    `);
  } catch (error) {
    res.status(500).send('Error resetting passwords: ' + error.message);
  }
});
}

// ==========================================
// ⏰ AUTOMATED CRON JOBS
// ==========================================
cron.schedule('0 8 * * *', async () => {
    console.log("⏰ Running Daily Appointment Reminder Check...");
    try {
        // 🔴 TiDB LOWERCASE FIX APPLIED TO JOINS
        const [upcomingAppts] = await pool.query(`
            SELECT a.*, p.name as patient_name, p.email, d.name as doctor_name 
            FROM appointment a
            JOIN patient p ON a.patient_id = p.patient_id
            JOIN doctor d ON a.doctor_id = d.doctor_id
            WHERE a.appointment_date = CURDATE() + INTERVAL 1 DAY
            AND a.status = 'Scheduled'
        `);

        for (const appt of upcomingAppts) {
            if (appt.email) {
                await sendAppointmentConfirmation(appt.email, appt.patient_name, appt.doctor_name, appt.appointment_date, appt.appointment_time);
            }
        }
    } catch (err) {
        console.error("Cron Job Error:", err);
    }
});

// 🔴 RENDER FIX: Bind to '0.0.0.0'
server.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Secure Hospital API running on port ${PORT}`);
  console.log(`🛡️  Helmet & Rate Limiting Active`);
});
