const jwt = require('jsonwebtoken');

// NOTE: This MUST match the secret key you used in your routes/auth.js file!
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set. See hospital-api/.env.example.');
}

const verifyToken = (req, res, next) => {
    // 1. Check if the Authorization header exists
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ error: 'Access Denied. No token provided.' });
    }

    // 2. Extract the token (Format is usually "Bearer eyJhbGciOi...")
    const token = authHeader.split(' ')[1]; 
    if (!token) {
        return res.status(403).json({ error: 'Access Denied. Invalid token format.' });
    }

    // 3. Verify the token is real and hasn't expired
    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified; // Attach the user's ID and Role to the request
        next(); // The badge is valid! Let them through to the route.
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or Expired Token. Please log in again.' });
    }
};

const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
};

const requirePatientSelf = (patientId) => (req, res, next) => {
    if (req.user?.role === 'Patient' && Number(req.user.userId) !== Number(patientId)) {
        return res.status(403).json({ error: 'Patients may access only their own data.' });
    }
    next();
};

module.exports = { verifyToken, authorizeRoles, requirePatientSelf };
