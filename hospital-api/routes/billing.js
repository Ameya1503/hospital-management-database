const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// 1. GET ALL BILLS (For Admin/Receptionist)
router.get('/bills', authorizeRoles('Receptionist', 'Admin'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT b.*, p.name as patient_name, p.phone 
            FROM Bill b 
            JOIN Patient p ON b.patient_id = p.patient_id 
            ORDER BY b.issued_date DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. CREATE BILL -- REAL-TIME ENABLED (For manual bills like Consultation Fees)
router.post('/bills', authorizeRoles('Receptionist', 'Admin'), async (req, res) => {
    const { patient_id, appointment_id, amount, description } = req.body;
    
    if (!patient_id || !amount) {
        return res.status(400).json({ error: 'Patient ID and Amount are required.' });
    }

    try {
        const [resDb] = await pool.query(
            'INSERT INTO Bill (patient_id, appointment_id, amount, description, status) VALUES (?, ?, ?, ?, "Pending")', 
            [patient_id, appointment_id || null, amount, description || 'Consultation Fee']
        );
        
        const [newBill] = await pool.query(`
            SELECT b.*, p.name as patient_name, p.phone 
            FROM Bill b 
            JOIN Patient p ON b.patient_id = p.patient_id 
            WHERE b.bill_id = ?
        `, [resDb.insertId]);

        // --- SOCKET.IO TRIGGER ---
        const io = req.app.get('io');
        if (io) {
            io.emit('billing_updated', { 
                patient_id: patient_id,
                message: 'New Invoice Generated' 
            });
            console.log(`💰 Socket: New Bill for Patient ${patient_id}`);
        }

        res.json(newBill[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. UPDATE BILL STATUS -- REAL-TIME ENABLED
router.patch('/bills/:id', authorizeRoles('Receptionist', 'Admin'), async (req, res) => {
    const { status } = req.body; // Expects 'Paid', 'Pending', or 'Cancelled'
    
    try {
        let sql = 'UPDATE Bill SET status = ?';
        let params = [status];

        // Automatically stamp the paid_date if they paid
        if (status === 'Paid') {
            sql += ', paid_date = CURRENT_TIMESTAMP';
        } else {
            sql += ', paid_date = NULL'; 
        }

        sql += ' WHERE bill_id = ?';
        params.push(req.params.id);

        await pool.query(sql, params);
        
        // Fetch the updated bill to identify the patient
        const [updatedBill] = await pool.query('SELECT * FROM Bill WHERE bill_id = ?', [req.params.id]);

        // --- SOCKET.IO TRIGGER ---
        const io = req.app.get('io');
        if (io && updatedBill.length > 0) {
            io.emit('billing_updated', { 
                patient_id: updatedBill[0].patient_id,
                message: `Bill #${req.params.id} status updated to ${status}` 
            });
            console.log(`💰 Socket: Bill ${req.params.id} updated for Patient ${updatedBill[0].patient_id}`);
        }

        res.json({ message: 'Status Updated' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET BILLS FOR SPECIFIC PATIENT
router.get('/bills/patient/:id', authorizeRoles('Patient', 'Receptionist', 'Admin'), async (req, res) => {
    try {
        if (req.user.role === 'Patient' && Number(req.user.userId) !== Number(req.params.id)) {
            return res.status(403).json({ error: 'Patients may access only their own bills.' });
        }
        const [rows] = await pool.query('SELECT * FROM Bill WHERE patient_id = ? ORDER BY issued_date DESC', [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
