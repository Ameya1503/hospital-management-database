const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// GET ALL MEDICINES (Fresh List)
router.get('/medicines', authorizeRoles('Doctor', 'Receptionist', 'Admin', 'Pharmacist'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Medicine ORDER BY name ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADD NEW MEDICINE (With Real-Time Update)
router.post('/medicines', authorizeRoles('Receptionist', 'Admin', 'Pharmacist'), async (req, res) => {
    const { name, type, price, stock } = req.body;
    
    if (!name || !stock) {
        return res.status(400).json({ error: 'Name and Stock are required.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO Medicine (name, type, price, stock) VALUES (?, ?, ?, ?)',
            [name, type || 'Tablet', price || 0, stock]
        );
        
        const [newMed] = await pool.query('SELECT * FROM Medicine WHERE medicine_id = ?', [result.insertId]);
        
        // --- SOCKET.IO TRIGGER START ---
        const io = req.app.get('io'); // Get the socket instance
        if (io) {
            io.emit('inventory_updated', { message: 'New medicine added' });
            console.log('⚡ Socket event emitted: New Medicine');
        }
        // --- SOCKET.IO TRIGGER END ---

        res.status(201).json(newMed[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE STOCK (With Real-Time Update)
router.patch('/medicines/:id', authorizeRoles('Receptionist', 'Admin', 'Pharmacist'), async (req, res) => {
    const { stock } = req.body;
    try {
        await pool.query('UPDATE Medicine SET stock = ? WHERE medicine_id = ?', [stock, req.params.id]);
        const [row] = await pool.query('SELECT * FROM Medicine WHERE medicine_id = ?', [req.params.id]);
        
        // --- SOCKET.IO TRIGGER START ---
        const io = req.app.get('io'); // Get the socket instance
        if (io) {
            io.emit('inventory_updated', { message: 'Stock updated' });
            console.log(`⚡ Socket event emitted: Stock Update (ID: ${req.params.id})`);
        }
        // --- SOCKET.IO TRIGGER END ---

        res.json({ medicine: row[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
