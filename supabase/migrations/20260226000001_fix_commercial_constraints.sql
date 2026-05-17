-- Fix Commercial Module Constraints and Integrity
-- 1. Update Property Types Constraint
ALTER TABLE commercial_properties DROP CONSTRAINT IF EXISTS commercial_properties_type_check;
ALTER TABLE commercial_properties ADD CONSTRAINT commercial_properties_type_check 
    CHECK (type IN ('HOUSE', 'APARTMENT', 'LAND', 'COMMERCIAL', 'BUILDING'));

-- 2. Update Deal Types Constraint (Matching frontend 'RENTAL' instead of 'RENT')
ALTER TABLE commercial_deals DROP CONSTRAINT IF EXISTS commercial_deals_type_check;
ALTER TABLE commercial_deals ADD CONSTRAINT commercial_deals_type_check 
    CHECK (type IN ('SALE', 'RENT', 'RENTAL', 'SERVICE'));

-- 3. Implement Cascade Delete for Properties
-- First, drop the existing foreign key
ALTER TABLE commercial_properties DROP CONSTRAINT IF EXISTS commercial_properties_parent_id_fkey;

-- Re-add it with ON DELETE CASCADE
ALTER TABLE commercial_properties 
    ADD CONSTRAINT commercial_properties_parent_id_fkey 
    FOREIGN KEY (parent_id) 
    REFERENCES commercial_properties(id) 
    ON DELETE CASCADE;

-- 4. Cleanup orphaned units (data quality maintenance)
-- Any property with a non-null parent_id that doesn't exist anymore
DELETE FROM commercial_properties 
WHERE parent_id IS NOT NULL 
AND parent_id NOT IN (SELECT id FROM commercial_properties);
