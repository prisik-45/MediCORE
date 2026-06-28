-- Migration to remove reliability_score column from suppliers table
ALTER TABLE suppliers DROP COLUMN IF EXISTS reliability_score;
