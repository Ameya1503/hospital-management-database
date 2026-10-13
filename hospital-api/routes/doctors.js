const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// Get All Doctors with their Average Rating
router.get('/doctors', authorizeRoles('Patient', 'Doctor', 'Receptionist', 'Admin', 'Nurse'), async (req, res) => {
    try {
        const sql = `
            SELECT 
                d.doctor_id, 
                d.name, 
                d.specialization, 
                d.department_id,
                COALESCE(AVG(a.doctor_rating), 0) as average_rating,
                COUNT(a.doctor_rating) as total_ratings
            FROM Doctor d
            LEFT JOIN Appointment a ON d.doctor_id = a.doctor_id
            GROUP BY d.doctor_id, d.name, d.specialization, d.department_id
        `;
        const [rows] = await pool.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
