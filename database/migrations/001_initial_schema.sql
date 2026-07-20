-- Migration 001: Initial Schema Creation
-- This migration creates the base database schema for RESQ-Route

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create centers table
CREATE TABLE IF NOT EXISTS centers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    capacity INTEGER NOT NULL,
    current_occupancy INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create evacuees table
CREATE TABLE IF NOT EXISTS evacuees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    shelter_id INTEGER REFERENCES centers(id) ON DELETE SET NULL,
    needs_medical_attention BOOLEAN DEFAULT false,
    medical_notes TEXT,
    phone_number VARCHAR(20),
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    driver_phone VARCHAR(20) NOT NULL,
    capacity INTEGER NOT NULL,
    current_location_lat DECIMAL(10, 8),
    current_location_lng DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'available',
    center_id INTEGER REFERENCES centers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    reporter_name VARCHAR(255),
    reporter_phone VARCHAR(20),
    is_resolved BOOLEAN DEFAULT false,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    assigned_to INTEGER
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_evacuees_shelter_id ON evacuees(shelter_id);
CREATE INDEX IF NOT EXISTS idx_evacuees_qr_code ON evacuees(qr_code);
CREATE INDEX IF NOT EXISTS idx_vehicles_center_id ON vehicles(center_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_reports_severity ON reports(severity);
CREATE INDEX IF NOT EXISTS idx_reports_is_resolved ON reports(is_resolved);
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON reports(reported_at);

-- Create spatial indexes if PostGIS is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        CREATE INDEX IF NOT EXISTS idx_centers_location ON centers USING GIST (ST_MakePoint(longitude, latitude));
        CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST (ST_MakePoint(longitude, latitude));
    END IF;
END $$;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_centers_updated_at BEFORE UPDATE ON centers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
