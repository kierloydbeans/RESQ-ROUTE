-- RESQ-Route Database Seed Data for Caloocan City
-- This file contains mock boundaries and shelter points for testing

-- Enable PostGIS extension for spatial data
CREATE EXTENSION IF NOT EXISTS postgis;

-- Insert mock shelter locations in Caloocan City
INSERT INTO centers (name, address, latitude, longitude, capacity, current_occupancy, is_active, created_at, updated_at) VALUES
('Caloocan City Hall Shelter', 'Caloocan City Hall, A. Mabini St, Caloocan', 14.6500, 120.9800, 500, 350, true, NOW(), NOW()),
('Bagong Silang Evacuation Center', 'Bagong Silang, Caloocan', 14.6600, 120. 9900, 1000, 600, true, NOW(), NOW()),
('Tala High School Shelter', 'Tala, Caloocan', 14.6400, 120.9700, 300, 200, true, NOW(), NOW()),
('Grace Park Elementary School', 'Grace Park, Caloocan', 14.6450, 120.9750, 250, 150, true, NOW(), NOW()),
('Maypajo Health Center', 'Maypajo, Caloocan', 14.6550, 120.9850, 150, 80, true, NOW(), NOW()),
('Ligaya Barangay Hall', 'Ligaya, Caloocan', 14.6580, 120.9920, 200, 120, true, NOW(), NOW());

-- Insert mock evacuee data
INSERT INTO evacuees (name, qr_code, shelter_id, needs_medical_attention, medical_notes, phone_number, check_in_time, created_at) VALUES
('Juan Dela Cruz', 'QR001', 1, false, NULL, '09171234567', NOW(), NOW()),
('Maria Santos', 'QR002', 1, true, 'Minor cuts and bruises', '09181234567', NOW(), NOW()),
('Pedro Reyes', 'QR003', 2, false, NULL, '09191234567', NOW(), NOW()),
('Ana Garcia', 'QR004', 2, false, NULL, '09201234567', NOW(), NOW()),
('Carlos Mendoza', 'QR005', 3, true, 'Hypertension medication needed', '09211234567', NOW(), NOW()),
('Sofia Rodriguez', 'QR006', 3, false, NULL, '09221234567', NOW(), NOW());

-- Insert mock vehicle data
INSERT INTO vehicles (plate_number, vehicle_type, driver_name, driver_phone, capacity, current_location_lat, current_location_lng, status, center_id, created_at, updated_at) VALUES
('ABC-1234', 'ambulance', 'Ramon Villanueva', '09151111111', 4, 14.6500, 120.9800, 'available', 1, NOW(), NOW()),
('DEF-5678', 'truck', 'Jose Tan', '09152222222', 20, 14.6600, 120.9900, 'in_transit', 2, NOW(), NOW()),
('GHI-9012', 'van', 'Antonio Cruz', '09153333333', 12, 14.6400, 120.9700, 'available', 3, NOW(), NOW()),
('JKL-3456', 'ambulance', 'Maria Reyes', '09154444444', 4, 14.6450, 120.9750, 'maintenance', 4, NOW(), NOW());

-- Insert mock hazard reports
INSERT INTO reports (type, description, latitude, longitude, severity, reporter_name, reporter_phone, is_resolved, reported_at) VALUES
('structural', 'Collapsed building wall on Main Street', 14.6520, 120.9820, 'high', 'John Doe', '09161111111', false, NOW()),
('flood', 'Flooded area near the river', 14.6480, 120.9780, 'medium', 'Jane Smith', '09162222222', false, NOW()),
('debris', 'Road blocked by fallen trees', 14.6560, 120.9860, 'low', 'Robert Johnson', '09163333333', true, NOW()),
('fire', 'Small fire in residential area', 14.6420, 120.9720, 'critical', 'Emily Davis', '09164444444', false, NOW()),
('structural', 'Cracked bridge support', 14.6540, 120.9840, 'high', 'Michael Brown', '09165555555', false, NOW());

-- Create spatial index for centers table (if using PostGIS)
-- CREATE INDEX idx_centers_location ON centers USING GIST (ST_MakePoint(longitude, latitude));

-- Create spatial index for reports table (if using PostGIS)
-- CREATE INDEX idx_reports_location ON reports USING GIST (ST_MakePoint(longitude, latitude));
