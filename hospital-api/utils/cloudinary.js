const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// 1. Authenticate with your Cloudinary account
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Configure Multer to send files directly to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pulse-hms-uploads', // This creates a folder in your Cloudinary dashboard
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'], // Restrict file types for security
  },
});

// 3. Export the Multer upload middleware
const upload = multer({ storage: storage });

module.exports = { upload, cloudinary };