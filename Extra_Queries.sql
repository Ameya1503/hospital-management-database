SELECT * FROM Doctor;
SELECT * FROM Patient;
SELECT * FROM Staff;

-- Too add new doctor
USE hospital_db;

-- Change these values for the new doctor
SET @NewName = 'Dr. Strange';
SET @NewSpecialization = 'Surgery';
SET @NewDeptID = 1;

-- Insert the new doctor using Doctor 1's password hash
INSERT INTO Doctor (name, specialization, department_id, password_hash)
SELECT 
    @NewName, 
    @NewSpecialization, 
    @NewDeptID, 
    password_hash -- Copies the working hash from Doctor 1
FROM Doctor 
WHERE doctor_id = 1;

-- To add new staff
USE hospital_db;

-- 1. Enter the new Staff details here
SET @StaffName = 'New Receptionist Name';
SET @StaffRole = 'Receptionist'; -- or 'Nurse', 'Lab Tech'
SET @StaffPhone = '9998887777';  -- Must be unique
SET @StaffDeptID = 1;            -- 1=Cardio, 2=Neuro, etc.

-- 2. Insert the new staff member using the known working password hash
INSERT INTO Staff (name, role, phone, department_id, password_hash)
SELECT 
    @StaffName, 
    @StaffRole, 
    @StaffPhone, 
    @StaffDeptID, 
    password_hash -- This copies the working hash from Dr. Anil Patil
FROM Doctor 
WHERE doctor_id = 1;

-- 3. Verify the new ID
SELECT * FROM Staff ORDER BY staff_id DESC LIMIT 1;