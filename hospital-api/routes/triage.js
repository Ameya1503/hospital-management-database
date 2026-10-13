const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/authMiddleware');

router.post('/triage', authorizeRoles('Patient', 'Receptionist'), async (req, res) => {
    const { symptoms, available_doctors } = req.body;

    if (!symptoms || !available_doctors || available_doctors.length === 0) {
        return res.status(400).json({ error: "Missing symptoms or doctor list." });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey.includes('your_')) throw new Error("Invalid API Key");

        const prompt = `
        You are an expert hospital triage AI. 
        Symptoms: "${symptoms}"
        Doctors: ${JSON.stringify(available_doctors)}
        
        Task: Select the best doctor ID from the list.
        Respond ONLY with a valid JSON object. Do NOT wrap it in markdown.
        Format exactly:
        {
          "recommended_doctor_id": 1,
          "recommended_doctor_name": "Name",
          "specialty": "Specialty",
          "medical_terms": "Clinical description of symptoms",
          "patient_friendly_explanation": "A friendly 1-sentence explanation."
        }
        `;

        // 🔴 THE RAW FETCH BYPASS 🔴
        // This completely bypasses the @google/generative-ai SDK package!
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // If Google rejects it, this will catch their EXACT reason why
        if (!response.ok) {
            throw new Error(`Google API Rejected: ${JSON.stringify(data.error)}`);
        }

        // Extract and clean the text
        let aiResponse = data.candidates[0].content.parts[0].text;
        aiResponse = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedData = JSON.parse(aiResponse);
        return res.json(parsedData);

    } catch (error) {
        console.error("\n==========================================");
        console.error("🚨 AI RAW FETCH FAILED 🚨");
        console.error("Reason:", error.message);
        console.error("==========================================\n");
        
        // The Graceful Fallback
        const backupDoctor = available_doctors[0] || { doctor_id: 1, name: "General Practitioner" };
        return res.json({
            recommended_doctor_id: backupDoctor.doctor_id,
            recommended_doctor_name: backupDoctor.name,
            specialty: backupDoctor.specialization || "General Medicine",
            medical_terms: "Patient reported symptoms requiring general consultation. (System Fallback)",
            patient_friendly_explanation: "Our primary AI is resting, but based on our backup protocols, I've matched you with Dr. " + backupDoctor.name + " who can assist you right away!"
        });
    }
});

module.exports = router;
