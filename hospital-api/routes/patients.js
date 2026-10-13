const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// --- 🔴 NEW: IMPORT THE AUDIT LOGGER ---
const { logAction } = require('../utils/auditService');

const requirePatientSelfOr = (...roles) => (req, res, next) => {
    const canAccess = roles.includes(req.user.role) ||
        (req.user.role === 'Patient' && Number(req.user.userId) === Number(req.params.id));
    if (!canAccess) return res.status(403).json({ error: 'You do not have permission to access this patient data.' });
    next();
};

// 1. Get All Patients (Includes Compliance Score)
router.get('/patients', authorizeRoles('Doctor', 'Receptionist', 'Admin', 'Nurse'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT patient_id, name, age, gender, phone, address, compliance_score FROM Patient');
        
        // 📝 AUDIT LOG: Track directory views
        await logAction(req.user?.userId || 0, req.user?.role || 'Unknown', 'VIEWED_PATIENT_DIRECTORY', null, null, req.ip);

        res.json(rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// 2. Get Single Patient
router.get('/patients/:id', requirePatientSelfOr('Doctor', 'Receptionist', 'Admin', 'Nurse'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Patient WHERE patient_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        
        // 📝 AUDIT LOG: Track specific profile views
        await logAction(req.user?.userId || 0, req.user?.role || 'Unknown', 'VIEWED_PATIENT_PROFILE', req.params.id, null, req.ip);

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. GET Medical Records (The Bulletproof Version)
router.get('/records/:id', requirePatientSelfOr('Doctor', 'Receptionist', 'Admin', 'Nurse'), async (req, res) => {
    try {
        // Use LEFT JOIN so records show up even if Doctor ID is weird
        const [records] = await pool.query(`
            SELECT mr.*, d.name as doctor_name, d.specialization 
            FROM MedicalRecord mr 
            LEFT JOIN Doctor d ON mr.doctor_id = d.doctor_id 
            WHERE mr.patient_id = ? 
            ORDER BY visit_date DESC
        `, [req.params.id]);

        // Fetch Medicines for each specific record
        for (let record of records) {
            try {
                const [meds] = await pool.query(`
                    SELECT p.dosage, p.duration, m.name 
                    FROM Prescription p
                    JOIN Medicine m ON p.medicine_id = m.medicine_id
                    WHERE p.record_id = ? 
                `, [record.record_id]);
                
                record.medicines = meds; 
            } catch (subErr) {
                console.error("Error fetching meds for record:", subErr);
                record.medicines = [];
            }
        }

        // 📝 AUDIT LOG: CRITICAL! Highly sensitive medical data accessed.
        await logAction(req.user?.userId || 0, req.user?.role || 'Unknown', 'VIEWED_MEDICAL_HISTORY', req.params.id, null, req.ip);

        res.json(records);
    } catch (err) { 
        console.error("Main Record Fetch Error:", err);
        res.status(500).json({ error: err.message }); 
    }
});

// 4. CREATE MEDICAL RECORD
router.post('/records', authorizeRoles('Doctor'), async (req, res) => {
    const { 
        patient_id, doctor_id, appointment_id, diagnosis, notes, 
        treatment_plan, medicines, buy_from_hospital, file_path
    } = req.body;

    const connection = await pool.getConnection(); 

    try {
        if (Number(req.user.userId) !== Number(doctor_id)) {
            return res.status(403).json({ error: 'Doctors may create records only under their own account.' });
        }
        await connection.beginTransaction();

        // A. Insert the Medical Record
        const [resDb] = await connection.query(
            'INSERT INTO MedicalRecord (patient_id, doctor_id, appointment_id, visit_date, diagnosis, notes, treatment_plan, file_path) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)', 
            [patient_id, doctor_id, appointment_id || null, diagnosis, notes, treatment_plan, file_path]
        );
        const recordId = resDb.insertId;

        // B. Handle Medicines
        if (medicines && medicines.length > 0) {
            for (const med of medicines) {
                let medId = med.medicine_id;
                if (!medId) {
                    const [mRows] = await connection.query('SELECT medicine_id FROM Medicine WHERE name = ?', [med.name]);
                    if (mRows.length > 0) medId = mRows[0].medicine_id;
                }

                if (medId) {
                    await connection.query(
                        'INSERT INTO Prescription (record_id, medicine_id, dosage, duration) VALUES (?, ?, ?, ?)',
                        [recordId, medId, med.dosage, med.duration]
                    );

                    if (buy_from_hospital) {
                        await connection.query(
                            'UPDATE Medicine SET stock = stock - 1 WHERE medicine_id = ? AND stock > 0', 
                            [medId]
                        );
                    }
                }
            }
        }

        await connection.commit();

        // 📝 AUDIT LOG: Track who created the record
        await logAction(req.user?.userId || 0, req.user?.role || 'Unknown', 'CREATED_MEDICAL_RECORD', patient_id, { diagnosis: diagnosis }, req.ip);

        // --- SOCKET TRIGGERS ---
        const io = req.app.get('io');
        if (io) {
            io.emit('patients_updated', { patient_id: patient_id });
            if (buy_from_hospital && medicines.length > 0) {
                io.emit('inventory_updated', { message: 'Stock deducted via Doctor Prescription' });
            }
        }

        res.status(201).json({ record_id: recordId, message: "Record saved & Inventory updated" });

    } catch (err) { 
        await connection.rollback();
        console.error(err);
        res.status(500).json({ error: err.message }); 
    } finally {
        connection.release();
    }
});

// 5. Update Patient Compliance Score 
router.patch('/patients/:id/compliance', authorizeRoles('Doctor', 'Receptionist', 'Admin', 'Nurse'), async (req, res) => {
    const { score } = req.body;
    const finalScore = score !== undefined ? score : req.body.compliance_score;

    try {
        await pool.query('UPDATE Patient SET compliance_score = ? WHERE patient_id = ?', [finalScore, req.params.id]);
        const [updated] = await pool.query('SELECT * FROM Patient WHERE patient_id = ?', [req.params.id]);
        
        // 📝 AUDIT LOG: Track penalty/rewards
        await logAction(req.user?.userId || 0, req.user?.role || 'Unknown', 'MODIFIED_COMPLIANCE_SCORE', req.params.id, { new_score: finalScore }, req.ip);

        // --- SOCKET.IO TRIGGER ---
        const io = req.app.get('io');
        if (io) {
            io.emit('patients_updated', { 
                patient_id: req.params.id, 
                message: 'Compliance score updated' 
            });
        }

        res.json({ message: 'Compliance updated', patient: updated[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
