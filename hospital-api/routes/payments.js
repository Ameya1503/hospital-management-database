const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const pool = require('../config/db');
const { authorizeRoles } = require('../middleware/authMiddleware');

// Initialize Razorpay (Using test keys for development)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_5z3h3k2M4xJ', // Fallback to a generic test key
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_test_key'
});

// 1. GENERATE AN ORDER
router.post('/payments/create-order', authorizeRoles('Patient'), async (req, res) => {
    const { bill_id } = req.body;
    try {
        const [bills] = await pool.query('SELECT amount FROM Bill WHERE bill_id = ? AND patient_id = ? AND status = "Pending"', [bill_id, req.user.userId]);
        if (bills.length === 0) return res.status(400).json({ error: 'Bill not found or already paid' });

        // Razorpay expects the amount in "paise" (multiply by 100)
        const amountInPaise = Math.round(bills[0].amount * 100); 
        
        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `receipt_bill_${bill_id}`
        };

        const order = await razorpay.orders.create(options);
        res.json({ order, bill_id });
    } catch (err) { 
        // 🚨 HERE IS THE ALARM BELL WE ADDED! 🚨
        console.error("\n==========================================");
        console.error("🚨 RAZORPAY ERROR 🚨");
        console.error(err);
        console.error("==========================================\n");
        res.status(500).json({ error: err.message || 'Payment initiation failed' }); 
    }
});

// 2. VERIFY THE PAYMENT SIGNATURE
router.post('/payments/verify', authorizeRoles('Patient'), async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bill_id } = req.body;

    // Verify the signature using Node's crypto module
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'secret_test_key')
        .update(sign.toString())
        .digest("hex");

    const [bills] = await pool.query('SELECT bill_id FROM Bill WHERE bill_id = ? AND patient_id = ? AND status = "Pending"', [bill_id, req.user.userId]);
    if (bills.length === 0) return res.status(404).json({ success: false, error: 'Bill not found or already paid.' });

    if (razorpay_signature === expectedSign) {
        // Signature matches! Update the database to mark it as Paid
        await pool.query('UPDATE Bill SET status = "Paid", paid_date = CURRENT_TIMESTAMP WHERE bill_id = ?', [bill_id]);

        // Trigger real-time socket update for the Receptionist and Patient
        const io = req.app.get('io');
        if (io) {
            io.emit('billing_updated', { message: `Bill ${bill_id} Paid Successfully!` });
        }

        res.json({ success: true, message: 'Payment verified successfully' });
    } else {
        res.status(400).json({ success: false, error: 'Invalid signature. Payment failed validation.' });
    }
});

module.exports = router;
