-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view their own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can view their own cases" ON cases;
DROP POLICY IF EXISTS "Users can view their own manuals" ON manuals;
DROP POLICY IF EXISTS "Users can view their own manual chunks" ON manual_chunks;
DROP POLICY IF EXISTS "Users can view their own manual figures" ON manual_figures;
DROP POLICY IF EXISTS "Users can view their own manual pages" ON manual_pages;
DROP POLICY IF EXISTS "Users can view their own manual spans" ON manual_spans;
DROP POLICY IF EXISTS "Users can view their own manual tables" ON manual_tables;

-- Create new SELECT policies that allow all authenticated users to view all data
CREATE POLICY "Authenticated users can view all vehicles"
ON vehicles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all cases"
ON cases FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manuals"
ON manuals FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manual chunks"
ON manual_chunks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manual figures"
ON manual_figures FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manual pages"
ON manual_pages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manual spans"
ON manual_spans FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all manual tables"
ON manual_tables FOR SELECT
TO authenticated
USING (true);