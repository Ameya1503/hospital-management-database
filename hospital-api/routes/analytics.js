const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// GET /api/analytics/reception
router.get('/analytics/reception', authorizeRoles('Receptionist', 'Admin'), async (req, res) => {
    try {
        // 1. REAL SQL: Calculate Busiest Hours
        // (Counts appointments by hour)
        const [busyHours] = await pool.query(`
            SELECT HOUR(appointment_time) as hour_slot, COUNT(*) as count 
            FROM Appointment 
            WHERE status != 'Cancelled'
            GROUP BY HOUR(appointment_time) 
            ORDER BY hour_slot ASC
        `);

        // 2. REAL SQL: Count Prescriptions for the Chart
        // (This reads the table from your screenshot!)
        const [topMedicines] = await pool.query(`
            SELECT m.name, COUNT(p.medicine_id) as usage_count
            FROM Prescription p
            JOIN Medicine m ON p.medicine_id = m.medicine_id
            GROUP BY p.medicine_id, m.name
            ORDER BY usage_count DESC
            LIMIT 5
        `);

        res.json({
            busy_hours: busyHours,
            top_medicines: topMedicines 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;
