const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { authorizeRoles } = require('../middleware/authMiddleware');
require('dotenv').config();

// 1. Configure Cloudinary Credentials
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure Multer to send files straight to Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'pulse-hms-medical-files', 
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'], 
    },
});

const upload = multer({ storage });

// 3. The Upload Route (Now with Advanced Error Catching!)
router.post('/upload', authorizeRoles('Doctor'), (req, res) => {
    
    // We execute the upload function manually so we can catch its specific errors
    upload.single('medicalFile')(req, res, function (error) {
        
        // Did Cloudinary or Multer throw an error? Catch it here!
        if (error) {
            console.error("🚨 CLOUDINARY UPLOAD ERROR:", error);
            
            return res.status(500).json({ 
                error: "File upload failed", 
                details: error.message 
            });
        }

        // If we get here, the upload to Cloudinary succeeded, but let's make sure a file was actually attached
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Did you attach it correctly?' });
        }
        
        // Success!
        console.log("✅ File secured in Cloudinary:", req.file.path);
        
        res.status(200).json({ 
            message: 'Uploaded successfully', 
            filePath: req.file.path 
        });
    });
});

module.exports = router;
