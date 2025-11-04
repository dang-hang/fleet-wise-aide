-- Fix security issue: Restrict manuals and related tables to owner only

-- Update manuals table SELECT policy
DROP POLICY IF EXISTS "Users can view all manuals" ON public.manuals;
CREATE POLICY "Users can view their own manuals" 
ON public.manuals 
FOR SELECT 
USING (auth.uid() = user_id);

-- Update manual_chunks SELECT policy to respect ownership
DROP POLICY IF EXISTS "Users can view all manual chunks" ON public.manual_chunks;
CREATE POLICY "Users can view their own manual chunks" 
ON public.manual_chunks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.manuals 
    WHERE manuals.id = manual_chunks.manual_id 
    AND manuals.user_id = auth.uid()
  )
);

-- Update manual_figures SELECT policy to respect ownership
DROP POLICY IF EXISTS "Users can view all manual figures" ON public.manual_figures;
CREATE POLICY "Users can view their own manual figures" 
ON public.manual_figures 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.manuals 
    WHERE manuals.id = manual_figures.manual_id 
    AND manuals.user_id = auth.uid()
  )
);

-- Update manual_pages SELECT policy to respect ownership
DROP POLICY IF EXISTS "Users can view all manual pages" ON public.manual_pages;
CREATE POLICY "Users can view their own manual pages" 
ON public.manual_pages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.manuals 
    WHERE manuals.id = manual_pages.manual_id 
    AND manuals.user_id = auth.uid()
  )
);

-- Update manual_spans SELECT policy to respect ownership
DROP POLICY IF EXISTS "Users can view all manual spans" ON public.manual_spans;
CREATE POLICY "Users can view their own manual spans" 
ON public.manual_spans 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.manuals 
    WHERE manuals.id = manual_spans.manual_id 
    AND manuals.user_id = auth.uid()
  )
);

-- Update manual_tables SELECT policy to respect ownership
DROP POLICY IF EXISTS "Users can view all manual tables" ON public.manual_tables;
CREATE POLICY "Users can view their own manual tables" 
ON public.manual_tables 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.manuals 
    WHERE manuals.id = manual_tables.manual_id 
    AND manuals.user_id = auth.uid()
  )
);