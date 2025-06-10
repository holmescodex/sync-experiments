-- Migration to add erasure coding support to events table

-- Add is_parity column to track parity chunks
ALTER TABLE events ADD COLUMN is_parity BOOLEAN DEFAULT 0;

-- Update index to include parity flag for efficient queries
CREATE INDEX idx_file_parity ON events(file_id, is_parity);

-- Query to check erasure coding status of files
-- This helps track how many data vs parity chunks we have
CREATE VIEW file_erasure_status AS
SELECT 
  file_id,
  COUNT(CASE WHEN is_parity = 0 THEN 1 END) as data_chunks,
  COUNT(CASE WHEN is_parity = 1 THEN 1 END) as parity_chunks,
  COUNT(*) as total_chunks,
  ROUND(COUNT(CASE WHEN is_parity = 1 THEN 1 END) * 100.0 / COUNT(*), 2) as parity_percentage
FROM events
WHERE file_id IS NOT NULL
GROUP BY file_id;