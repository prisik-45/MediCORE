-- Migration to add Certifications column to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS certifications text;
