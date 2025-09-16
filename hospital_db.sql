CREATE DATABASE hospital_db;
USE hospital_db;

CREATE TABLE Patient (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,  
    name VARCHAR(100) NOT NULL,                 
    age INT,
    gender ENUM('M','F','O'),                   
    phone VARCHAR(15) UNIQUE,                   
    address TEXT
);

CREATE TABLE Department (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE Doctor (
    doctor_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100),
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Department(department_id)
);

CREATE TABLE Appointment (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT,
    doctor_id INT,
    appointment_date DATE NOT NULL,
    status ENUM('Scheduled', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    FOREIGN KEY (patient_id) REFERENCES Patient(patient_id),
    FOREIGN KEY (doctor_id) REFERENCES Doctor(doctor_id)
);

CREATE TABLE Bill (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT,
    amount DECIMAL(10,2) NOT NULL,  -- money with 2 decimal places
    bill_date DATE NOT NULL,
    status ENUM('Paid', 'Unpaid') DEFAULT 'Unpaid',
    FOREIGN KEY (patient_id) REFERENCES Patient(patient_id)
);

CREATE TABLE Medicine (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    price DECIMAL(10,2),
    stock INT DEFAULT 0
);

CREATE TABLE Prescription (
    prescription_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT,
    medicine_id INT,
    dosage VARCHAR(50),
    duration VARCHAR(50),
    FOREIGN KEY (appointment_id) REFERENCES Appointment(appointment_id),
    FOREIGN KEY (medicine_id) REFERENCES Medicine(medicine_id)
);

CREATE TABLE Staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50), -- nurse, receptionist, lab assistant, etc.
    phone VARCHAR(15) UNIQUE,
    department_id INT,
    FOREIGN KEY (department_id) REFERENCES Department(department_id)
);

-- Queries

-- 1. List all patients with their assigned doctor and appointment status
SELECT 
    p.name AS patient_name,
    d.name AS doctor_name,
    a.appointment_date,
    a.status
FROM Appointment a
JOIN Patient p ON a.patient_id = p.patient_id
JOIN Doctor d ON a.doctor_id = d.doctor_id;

-- 2. Find all unpaid bills with patient details
SELECT 
    b.bill_id,
    p.name AS patient_name,
    b.amount,
    b.bill_date
FROM Bill b
JOIN Patient p ON b.patient_id = p.patient_id
WHERE b.status = 'Unpaid';

-- 3. Total revenue generated (all paid bills)
SELECT 
    SUM(amount) AS total_revenue
FROM Bill
WHERE status = 'Paid';

-- 4. Top 3 doctors with the most appointments
SELECT 
    d.name AS doctor_name,
    COUNT(a.appointment_id) AS total_appointments
FROM Doctor d
JOIN Appointment a ON d.doctor_id = a.doctor_id
GROUP BY d.doctor_id
ORDER BY total_appointments DESC
LIMIT 3;

-- 5. Find medicines that are low in stock (< 60 units)
SELECT 
    name AS medicine_name,
    stock
FROM Medicine
WHERE stock < 60;

-- 6. Show prescriptions given to a particular patient (example: Rahul Sharma)
SELECT 
    p.name AS patient_name,
    m.name AS medicine_name,
    pr.dosage,
    pr.duration
FROM Prescription pr
JOIN Appointment a ON pr.appointment_id = a.appointment_id
JOIN Patient p ON a.patient_id = p.patient_id
JOIN Medicine m ON pr.medicine_id = m.medicine_id
WHERE p.name = 'Rahul Sharma';

-- 7. Count number of staff in each department
SELECT 
    d.name AS department_name,
    COUNT(s.staff_id) AS staff_count
FROM Department d
LEFT JOIN Staff s ON d.department_id = s.department_id
GROUP BY d.department_id;

-- 8. List patients who have multiple appointments
SELECT 
    p.name AS patient_name,
    COUNT(a.appointment_id) AS total_appointments
FROM Patient p
JOIN Appointment a ON p.patient_id = a.patient_id
GROUP BY p.patient_id
HAVING COUNT(a.appointment_id) > 1;

-- 9. Find patients who have paid bills above ₹2000
SELECT 
    p.name AS patient_name,
    b.amount
FROM Bill b
JOIN Patient p ON b.patient_id = p.patient_id
WHERE b.status = 'Paid' AND b.amount > 2000;

-- 10. Department-wise revenue (based on doctor’s department)
SELECT 
    d.name AS department_name,
    SUM(b.amount) AS department_revenue
FROM Bill b
JOIN Patient p ON b.patient_id = p.patient_id
JOIN Appointment a ON p.patient_id = a.patient_id
JOIN Doctor doc ON a.doctor_id = doc.doctor_id
JOIN Department d ON doc.department_id = d.department_id
WHERE b.status = 'Paid'
GROUP BY d.department_id;

-- Insert Departments
INSERT INTO Department (name) VALUES
('Cardiology'),
('Neurology'),
('Orthopedics'),
('Pediatrics');

-- Insert Patients
INSERT INTO Patient (name, age, gender, phone, address) VALUES
('Rahul Sharma', 32, 'M', '9876543210', 'Pune, Maharashtra'),
('Priya Mehta', 28, 'F', '9876501234', 'Mumbai, Maharashtra'),
('Amit Verma', 45, 'M', '9823456789', 'Nagpur, Maharashtra'),
('Sara Khan', 12, 'F', '9812345678', 'Delhi');

-- Insert Doctors
INSERT INTO Doctor (name, specialization, department_id) VALUES
('Dr. Anil Patil', 'Cardiologist', 1),
('Dr. Nisha Rao', 'Neurologist', 2),
('Dr. Rajesh Kulkarni', 'Orthopedic Surgeon', 3),
('Dr. Sneha Joshi', 'Pediatrician', 4);

-- Insert Staff
INSERT INTO Staff (name, role, phone, department_id) VALUES
('Sunita Deshmukh', 'Nurse', '9000000001', 1),
('Arjun Singh', 'Receptionist', '9000000002', 2),
('Meena Sharma', 'Lab Assistant', '9000000003', 3);

-- Insert Appointments
INSERT INTO Appointment (patient_id, doctor_id, appointment_date, status) VALUES
(1, 1, '2025-09-15', 'Scheduled'),
(2, 2, '2025-09-12', 'Completed'),
(3, 3, '2025-09-10', 'Cancelled'),
(4, 4, '2025-09-11', 'Completed');

-- Insert Bills
INSERT INTO Bill (patient_id, amount, bill_date, status) VALUES
(1, 5000.00, '2025-09-15', 'Unpaid'),
(2, 2000.00, '2025-09-12', 'Paid'),
(4, 1500.00, '2025-09-11', 'Paid');

-- Insert Medicines
INSERT INTO Medicine (name, type, price, stock) VALUES
('Paracetamol', 'Tablet', 10.00, 200),
('Amoxicillin', 'Capsule', 25.00, 100),
('Ibuprofen', 'Tablet', 15.00, 150),
('Cough Syrup', 'Syrup', 60.00, 50);

-- Insert Prescriptions (linked to appointments & medicines)
INSERT INTO Prescription (appointment_id, medicine_id, dosage, duration) VALUES
(2, 1, '500mg', '5 days'),
(2, 2, '250mg', '7 days'),
(4, 4, '10ml', '3 days');

-- Check data in Bill table
SELECT * FROM Bill;

-- Check if joins with Patient work (relationship test)
SELECT 
    b.bill_id,
    p.name AS patient_name,
    b.amount,
    b.bill_date,
    b.status
FROM Bill b
JOIN Patient p ON b.patient_id = p.patient_id;

SELECT 
    p.name AS patient_name,
    d.name AS doctor_name,
    a.appointment_date,
    a.status
FROM Appointment a
JOIN Patient p ON a.patient_id = p.patient_id
JOIN Doctor d ON a.doctor_id = d.doctor_id;
