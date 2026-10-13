require('dotenv').config();

// ==========================================
// 📧 MASTER EMAILJS SERVICE HUB
// ==========================================

// --- CORE ENGINE ---
const sendEmailJS = async (template_id, template_params) => {
    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: process.env.EMAILJS_SERVICE_ID,
                template_id: template_id,
                user_id: process.env.EMAILJS_PUBLIC_KEY, 
                accessToken: process.env.EMAILJS_PRIVATE_KEY,
                template_params: template_params
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ EmailJS Error [${template_id}]:`, errorText);
            return false;
        }

        console.log(`✅ Email sent successfully via EmailJS`);
        return true;
    } catch (error) {
        console.error("❌ Network Error:", error);
        return false;
    }
};

// --- HELPER: Expiration Time Calculator ---
const getExpirationTime = () => {
    const expireDate = new Date(Date.now() + 10 * 60000); // 10 mins from now
    return expireDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ==========================================
// 🚀 THE CORE FOUR EMAIL TRIGGERS
// ==========================================

// 1. REGISTRATION OTP (Uses the Passcode Template: EMAILJS_TEMPLATE_PASSCODE)
const sendRegistrationOtpEmail = async (to, otp) => {
    return await sendEmailJS(process.env.EMAILJS_TEMPLATE_PASSCODE, {
        to_email: to,
        message: 'Welcome to Pulse HMS! To complete your registration, please use the following Security Verification Code.',
        passcode: otp,
        time: getExpirationTime()
    });
};

// 2. PASSWORD RESET (Uses the Passcode Template: EMAILJS_TEMPLATE_PASSCODE)
const sendResetEmail = async (to, otp) => {
    return await sendEmailJS(process.env.EMAILJS_TEMPLATE_PASSCODE, {
        to_email: to,
        message: 'You requested to reset your password. If you did not request this, please ignore this email immediately to secure your account.',
        passcode: otp,
        time: getExpirationTime()
    });
};

// 3. WELCOME EMAIL (Uses the Universal Notification Template: EMAILJS_TEMPLATE_WELCOME)
const sendWelcomeEmail = async (patientEmail, patientName) => {
    return await sendEmailJS(process.env.EMAILJS_TEMPLATE_WELCOME, {
        to_email: patientEmail,
        header: 'Welcome to the Pulse HMS Family!',
        patient_name: patientName,
        body_text: 'Your patient portal account has been successfully created. You can now log in securely to book appointments, view your medical history, and manage your health records all in one place.',
        highlight_text: 'Portal Access is now Active. We are excited to have you on board!'
    });
};

// 4. APPOINTMENT REMINDER (Uses the Universal Notification Template: EMAILJS_TEMPLATE_WELCOME)
const sendAppointmentConfirmation = async (patientEmail, patientName, doctorName, date, time) => {
    return await sendEmailJS(process.env.EMAILJS_TEMPLATE_WELCOME, {
        to_email: patientEmail,
        header: 'Appointment Confirmed ✅',
        patient_name: patientName,
        body_text: `Your upcoming appointment with Dr. ${doctorName} has been successfully scheduled in our system. Please try to arrive 10 minutes early.`,
        highlight_text: `📅 Date: ${date} | ⏰ Time: ${time}`
    });
};

module.exports = { 
    sendRegistrationOtpEmail,
    sendResetEmail,
    sendWelcomeEmail, 
    sendAppointmentConfirmation
};