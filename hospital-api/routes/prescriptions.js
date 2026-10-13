const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

router.post('/prescriptions', authorizeRoles('Doctor'), async (req, res) => {
    // NEW: Added file_path to the destructured req.body
    const { patient_id, doctor_id, appointment_id, diagnosis, notes, treatment_plan, medicines, deduct_inventory, file_path } = req.body;

    console.log("👀 INCOMING DATA:", { medicines, deduct_inventory, file_path });
    const connection = await pool.getConnection();

    try {
        if (Number(req.user.userId) !== Number(doctor_id)) {
            return res.status(403).json({ error: 'Doctors may prescribe only under their own account.' });
        }
        await connection.beginTransaction();

        // 1. Create Medical Record
        // NEW: Added file_path to the INSERT statement and the values array
        const [recordRes] = await connection.query(
            'INSERT INTO MedicalRecord (patient_id, doctor_id, appointment_id, visit_date, diagnosis, notes, treatment_plan, file_path) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)',
            [patient_id, doctor_id, appointment_id || null, diagnosis, notes, treatment_plan, file_path]
        );
        
        const newRecordId = recordRes.insertId;

        // --- Variables to track the pharmacy bill ---
        let totalPharmacyBill = 0;
        let billDescriptionArray = [];

        // 2. Handle Medicines
        if (medicines && medicines.length > 0) {
            for (const med of medicines) {
                
                // A. Save Prescription (ALWAYS DO THIS so the doctor can see history)
                await connection.query(
                    'INSERT INTO Prescription (record_id, appointment_id, medicine_id, dosage, duration) VALUES (?, ?, ?, ?, ?)',
                    [newRecordId, appointment_id || null, med.medicine_id, med.dosage, med.duration]
                );

                // B. Deduct Stock & Calculate Bill (ONLY IF THE CHECKBOX WAS CHECKED)
                if (deduct_inventory) {
                    // Fetch the price and name of the medicine from the DB
                    const [medDetails] = await connection.query('SELECT name, price FROM Medicine WHERE medicine_id = ?', [med.medicine_id]);
                    
                    if (medDetails.length > 0) {
                        const price = medDetails[0].price || 0;
                        const quantity = med.quantity || 1; // Fallback to 1 if quantity is missing
                        const lineTotal = price * quantity;
                        
                        totalPharmacyBill += lineTotal;
                        billDescriptionArray.push(`${medDetails[0].name} (x${quantity})`);
                        
                        // Deduct only when enough stock remains. The transaction rolls back otherwise.
                        const [stockUpdate] = await connection.query(
                            'UPDATE Medicine SET stock = stock - ? WHERE medicine_id = ? AND stock >= ?',
                            [quantity, med.medicine_id, quantity]
                        );
                        if (stockUpdate.affectedRows !== 1) {
                            throw new Error(`Insufficient stock for ${medDetails[0].name}.`);
                        }
                    }
                }
            }
        }

        // --- 🔴 3. CREATE THE INVOICE ---
        if (deduct_inventory && totalPharmacyBill > 0) {
            const finalDescription = "Pharmacy Medicines: " + billDescriptionArray.join(", ");
            await connection.query(
                'INSERT INTO Bill (patient_id, appointment_id, amount, description, status) VALUES (?, ?, ?, ?, "Pending")',
                [patient_id, appointment_id || null, totalPharmacyBill, finalDescription]
            );
            console.log(`🧾 Auto-generated bill for $${totalPharmacyBill}`);
        }

        await connection.commit();

        // --- 🔴 THE REAL-TIME MAGIC HAPPENS HERE ---
        const io = req.app.get('io');
        if (io) {
            // 1. Instantly update the medical history on the Doctor's screen
            io.emit('patients_updated', { patient_id: patient_id }); 
            
            // 2. Instantly update the inventory stock dropdown IF we bought from pharmacy
            if (deduct_inventory) {
                io.emit('inventory_updated'); 
                io.emit('billing_updated'); // Alert the receptionist!
            }
        }
        // ------------------------------------------

        res.status(201).json({ message: 'Success', record_id: newRecordId });

    } catch (error) {
        await connection.rollback();
        console.error("Transaction Failed:", error.message);
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
