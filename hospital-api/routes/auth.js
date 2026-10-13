const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

// 🔴 Import the centralized EmailJS functions from our Master Hub
const { 
    sendRegistrationOtpEmail, 
    sendResetEmail, 
    sendWelcomeEmail 
} = require('../utils/emailService');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set. See hospital-api/.env.example.');
}

const otpStore = {}; // Transitional store; replace with Redis/Django cache during migration.
const OTP_TTL_MS = 10 * 60 * 1000;

// ==========================================
// 1. REGISTRATION ROUTES (USING EMAILJS)
// ==========================================

// Send Email OTP
router.post('/send-otp', async (req, res) => {
    const { email, phone } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Please enter a valid email address first.' });
    }

    try {
        // Check if email already exists
        const [emailExists] = await pool.query('SELECT * FROM patient WHERE email = ?', [email]);
        if (emailExists.length > 0) return res.status(409).json({ error: 'Email already registered. Please login.' });

        // Check if phone already exists (if they typed it in)
        if (phone) {
            const [phoneExists] = await pool.query('SELECT * FROM patient WHERE phone = ?', [phone]);
            if (phoneExists.length > 0) return res.status(409).json({ error: 'Phone number already registered.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = { code: otp, expiresAt: Date.now() + OTP_TTL_MS };

        // 🔴 Fire the EmailJS OTP Trigger
        const emailSent = await sendRegistrationOtpEmail(email, otp);
        
        if (emailSent) {
            res.json({ message: 'OTP sent to your email!' });
        } else {
            res.status(500).json({ error: 'Failed to send OTP email.' });
        }
    } catch (error) {
        console.error("OTP Error:", error);
        res.status(500).json({ error: 'Server error while sending OTP.' });
    }
});

// Register Patient
router.post('/patients', async (req, res) => {
    const { name, email, age, gender, phone, address, password, otp } = req.body;
    
    if (!name || !email || !phone || !password || !otp) return res.status(400).json({ error: 'Missing required fields.' });

    const otpEntry = otpStore[email];
    if (!otpEntry || otpEntry.code !== otp || otpEntry.expiresAt <= Date.now()) {
        delete otpStore[email];
        return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        
        const [result] = await pool.query(
            'INSERT INTO patient (name, email, age, gender, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [name, email, age, gender, phone, address, hash]
        );
        delete otpStore[email]; 

        // 🔴 Fire the EmailJS Welcome Trigger
        sendWelcomeEmail(email, name);

        res.status(201).json({ patient_id: result.insertId, name, phone, email });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage && error.sqlMessage.includes('email')) {
                return res.status(409).json({ error: 'Email already registered.' });
            }
            return res.status(409).json({ error: 'Phone number already registered.' });
        }
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// ==========================================
// 2. LOGIN ROUTES
// ==========================================
router.post('/patients/login', async (req, res) => {
    const { phone, password } = req.body; 
    if (!phone || !password) return res.status(400).json({ error: 'Required fields missing.' });

    try {
        const isEmail = phone.includes('@');
        const query = isEmail ? 'SELECT * FROM patient WHERE email = ?' : 'SELECT * FROM patient WHERE phone = ?';
        
        const [patients] = await pool.query(query, [phone]);
        if (patients.length === 0) return res.status(404).json({ error: 'Invalid credentials.' });

        const match = await bcrypt.compare(password, patients[0].password_hash);
        if (match) {
            const token = jwt.sign({ userId: patients[0].patient_id, role: 'Patient', name: patients[0].name }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ user: { patient_id: patients[0].patient_id, name: patients[0].name, role: 'Patient' }, token });
        } else {
            res.status(401).json({ error: 'Invalid credentials.' });
        }
    } catch (err) { 
        console.log("🚨 REAL LOGIN ERROR:", err);
        res.status(500).json({ error: 'Login failed.' });
    }
});

router.post('/staff/login', async (req, res) => {
    const { role, id, password } = req.body; 
    if (!id || !password || !role) return res.status(400).json({ error: 'Missing credentials.' });

    try {
        const requestedRole = String(role).trim().toLowerCase();
        const roleLabels = {
            doctor: 'Doctor', receptionist: 'Receptionist', admin: 'Admin',
            nurse: 'Nurse', pharmacist: 'Pharmacist'
        };
        if (!roleLabels[requestedRole]) {
            return res.status(400).json({ error: 'Invalid staff role.' });
        }

        const isDoctor = requestedRole === 'doctor';
        const table = isDoctor ? 'doctor' : 'staff';
        const idColumn = isDoctor ? 'doctor_id' : 'staff_id';

        const isEmail = id.includes('@');
        const query = isDoctor
            ? (isEmail ? 'SELECT * FROM doctor WHERE email = ?' : 'SELECT * FROM doctor WHERE doctor_id = ?')
            : (isEmail
                ? 'SELECT * FROM staff WHERE email = ? AND LOWER(role) = ?'
                : 'SELECT * FROM staff WHERE staff_id = ? AND LOWER(role) = ?');

        const params = isDoctor ? [id] : [id, requestedRole];
        const [users] = await pool.query(query, params);
        if (users.length === 0) return res.status(401).json({ error: 'User not found.' });

        const match = await bcrypt.compare(password, users[0].password_hash);
        if (match) {
            const issuedRole = roleLabels[requestedRole];
            const token = jwt.sign({ userId: users[0][idColumn], role: issuedRole, name: users[0].name }, JWT_SECRET, { expiresIn: '12h' });
            res.json({ user: { id: users[0][idColumn], name: users[0].name, role: issuedRole }, token });
        } else {
            res.status(401).json({ error: 'Invalid credentials.' });
        }
    } catch (err) { 
        console.log("🚨 REAL LOGIN ERROR:", err);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ==========================================
// 3. FORGOT PASSWORD ROUTES
// ==========================================
router.post('/forgot-password', async (req, res) => {
    const { email, role } = req.body;

    let table = 'patient';
    if (role.toLowerCase() === 'doctor') table = 'doctor';
    if (role.toLowerCase() === 'staff' || role.toLowerCase() === 'receptionist') table = 'staff';

    try {
        const [exists] = await pool.query(`SELECT * FROM ${table} WHERE email = ?`, [email]);
        if (exists.length === 0) return res.status(404).json({ error: 'Email not found.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); 

        // 🔴 Fire the EmailJS Reset Trigger
        const emailSent = await sendResetEmail(email, otp);
        if (!emailSent) return res.status(500).json({ error: 'Failed to send email. Check EmailJS config.' });

        await pool.query(
            'INSERT INTO passwordreset (email, otp, role, expires_at) VALUES (?, ?, ?, ?)',
            [email, otp, role, expiresAt]
        );

        res.json({ message: `Reset code sent to ${email}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword, role } = req.body;

    let table = 'patient';
    if (role.toLowerCase() === 'doctor') table = 'doctor';
    if (role.toLowerCase() === 'staff' || role.toLowerCase() === 'receptionist') table = 'staff';

    try {
        const [records] = await pool.query(
            'SELECT * FROM passwordreset WHERE email = ? AND otp = ? AND role = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, otp, role]
        );

        if (records.length === 0) return res.status(400).json({ error: 'Invalid or Expired OTP' });

        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query(`UPDATE ${table} SET password_hash = ? WHERE email = ?`, [hash, email]);
        
        await pool.query('DELETE FROM passwordreset WHERE email = ?', [email]);

        res.json({ message: 'Password Reset Successful. Please Login.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
