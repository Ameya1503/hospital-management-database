const mysql = require('mysql2/promise');

const uri = process.env.DATABASE_URL;

if (!uri) {
    throw new Error('DATABASE_URL must be set. See hospital-api/.env.example.');
}

const pool = mysql.createPool(uri);

// Test connection
pool.getConnection()
    .then(conn => {
        console.log('✅ TiDB Cloud Connected successfully!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database Connection Failed:', err.message);
    });

module.exports = pool;
