const pool = require('../config/db');

const logAction = async (userId, userRole, action, targetPatientId = null, details = null, ipAddress = null) => {
    try {
        // Convert the details object to a JSON string if it exists
        const detailsString = details ? JSON.stringify(details) : null;

        await pool.query(
            'INSERT INTO AuditLog (user_id, user_role, action, target_patient_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, userRole, action, targetPatientId, detailsString, ipAddress]
        );
        
        console.log(`📝 HIPAA Audit: [${userRole} ${userId}] performed ${action} on Patient ${targetPatientId || 'N/A'}`);
    } catch (error) {
        // We log the error to the server console, but we DON'T crash the user's request
        console.error("❌ CRITICAL: Failed to write to Audit Log:", error.message);
    }
};

module.exports = { logAction };