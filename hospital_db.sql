CREATE DATABASE IF NOT EXISTS hospital_db;
USE hospital_db;

-- --- TABLE CREATION ---

CREATE TABLE `Patient` (
    `patient_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `age` INT,
    `gender` ENUM('M','F','O'),
    `phone` VARCHAR(15) UNIQUE,
    `address` TEXT,
    `password_hash` VARCHAR(255) NOT NULL
);

CREATE TABLE `Department` (
    `department_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL
);

CREATE TABLE `Doctor` (
    `doctor_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `specialization` VARCHAR(100),
    `department_id` INT,
    FOREIGN KEY (`department_id`) REFERENCES `Department`(`department_id`)
);

CREATE TABLE `Appointment` (
    `appointment_id` INT AUTO_INCREMENT PRIMARY KEY,
    `patient_id` INT,
    `doctor_id` INT,
    `appointment_date` DATE NOT NULL,
    `status` ENUM('Scheduled', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    `is_emergency` BOOLEAN DEFAULT FALSE,
    `doctor_rating` INT NULL,
    FOREIGN KEY (`patient_id`) REFERENCES `Patient`(`patient_id`),
    FOREIGN KEY (`doctor_id`) REFERENCES `Doctor`(`doctor_id`)
);

CREATE TABLE `Bill` (
    `bill_id` INT AUTO_INCREMENT PRIMARY KEY,
    `patient_id` INT,
    `amount` DECIMAL(10,2) NOT NULL,
    `bill_date` DATE NOT NULL,
    `status` ENUM('Paid', 'Unpaid') DEFAULT 'Unpaid',
    FOREIGN KEY (`patient_id`) REFERENCES `Patient`(`patient_id`)
);

CREATE TABLE `Medicine` (
    `medicine_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `type` VARCHAR(50),
    `price` DECIMAL(10,2),
    `stock` INT DEFAULT 0
);

CREATE TABLE `Prescription` (
    `prescription_id` INT AUTO_INCREMENT PRIMARY KEY,
    `appointment_id` INT,
    `medicine_id` INT,
    `dosage` VARCHAR(50),
    `duration` VARCHAR(50),
    FOREIGN KEY (`appointment_id`) REFERENCES `Appointment`(`appointment_id`),
    FOREIGN KEY (`medicine_id`) REFERENCES `Medicine`(`medicine_id`)
);

CREATE TABLE `Staff` (
    `staff_id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50),
    `phone` VARCHAR(15) UNIQUE,
    `department_id` INT,
    FOREIGN KEY (`department_id`) REFERENCES `Department`(`department_id`)
);

CREATE TABLE `MedicalRecord` (
    `record_id` INT AUTO_INCREMENT PRIMARY KEY,
    `patient_id` INT,
    `doctor_id` INT,
    `appointment_id` INT NULL,
    `visit_date` DATE NOT NULL,
    `diagnosis` VARCHAR(255) NOT NULL,
    `notes` TEXT,
    `treatment_plan` TEXT,
    `file_path` VARCHAR(255) NULL,
    FOREIGN KEY (`patient_id`) REFERENCES `Patient`(`patient_id`),
    FOREIGN KEY (`doctor_id`) REFERENCES `Doctor`(`doctor_id`),
    FOREIGN KEY (`appointment_id`) REFERENCES `Appointment`(`appointment_id`)
);

-- --- MOCK DATA INSERTION ---

INSERT INTO `Department` (name) VALUES
('Cardiology'),
('Neurology'),
('Orthopedics'),
('Pediatrics');

INSERT INTO `Doctor` (name, specialization, department_id) VALUES
('Dr. Anil Patil', 'Cardiologist', 1),
('Dr. Nisha Rao', 'Neurologist', 2),
('Dr. Rajesh Kulkarni', 'Orthopedic Surgeon', 3),
('Dr. Sneha Joshi', 'Pediatrician', 4);

-- The password for all mock patients is 'password123'
INSERT INTO `Patient` (name, age, gender, phone, address, password_hash) VALUES
('Rahul Sharma', 32, 'M', '9876543210', 'Pune, Maharashtra', '$2b$10$fV/Fv2.IfvSj3Fmwl.jMxe8l.2r.iA.10gK.Bv.L9VL3/e/fA5lS.'),
('Priya Mehta', 28, 'F', '9876501234', 'Mumbai, Maharashtra', '$2b$10$fV/FvSj3Fmwl.jMxe8l.2r.iA.10gK.Bv.L9VL3/e/fA5lS.'),
('Amit Verma', 45, 'M', '9823456789', 'Nagpur, Maharashtra', '$2b$10$fV/FvSj3Fmwl.jMxe8l.2r.iA.10gK.Bv.L9VL3/e/fA5lS.'),
('Sara Khan', 12, 'F', '9812345678', 'Delhi', '$2b$10$fV/FvSj3Fmwl.jMxe8l.2r.iA.10gK.Bv.L9VL3/e/fA5lS.');

INSERT INTO `Staff` (name, role, phone, department_id) VALUES
('Sunita Deshmukh', 'Nurse', '9000000001', 1),
('Arjun Singh', 'Receptionist', '9000000002', 2),
('Meena Sharma', 'Lab Assistant', '9000000003', 3);

INSERT INTO `Appointment` (patient_id, doctor_id, appointment_date, status, is_emergency, doctor_rating) VALUES
(1, 1, '2025-09-15', 'Scheduled', TRUE, NULL),
(2, 2, '2025-09-12', 'Completed', FALSE, 5),
(3, 3, '2025-09-10', 'Cancelled', FALSE, NULL),
(4, 4, '2025-09-11', 'Completed', FALSE, 4);

INSERT INTO `Bill` (patient_id, amount, bill_date, status) VALUES
(1, 5000.00, '2025-09-15', 'Unpaid'),
(2, 2000.00, '2025-09-12', 'Paid'),
(4, 1500.00, '2025-09-11', 'Paid');

INSERT INTO `Medicine` (name, type, price, stock) VALUES
('Paracetamol', 'Tablet', 10.00, 200),
('Amoxicillin', 'Capsule', 25.00, 100),
('Ibuprofen', 'Tablet', 15.00, 150),
('Cough Syrup', 'Syrup', 60.00, 50);

INSERT INTO `Prescription` (appointment_id, medicine_id, dosage, duration) VALUES
(2, 1, '500mg', '5 days'),
(2, 2, '250mg', '7 days'),
(4, 4, '10ml', '3 days');

INSERT INTO `MedicalRecord` (patient_id, doctor_id, appointment_id, visit_date, diagnosis, notes, treatment_plan, file_path) 
VALUES
(2, 2, 2, '2025-09-12', 'Migraine Attack', 'Severe head pain and light sensitivity.', 'Rest for 2 days. Continue prescribed medicine.', NULL),
(4, 4, 4, '2025-09-11', 'Viral Fever', 'High-grade fever and cough.', 'Symptomatic treatment and regular follow-up.', NULL);