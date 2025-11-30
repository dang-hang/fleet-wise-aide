-- Create manual_sections table to store document structure hierarchy
CREATE TABLE IF NOT EXISTS public.manual_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  first_page INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  heading_level INTEGER NOT NULL DEFAULT 1,
  parent_section_id UUID REFERENCES public.manual_sections(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_page_count CHECK (page_count > 0),
  CONSTRAINT valid_heading_level CHECK (heading_level >= 1 AND heading_level <= 6)
);

-- Enable RLS
ALTER TABLE public.manual_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert sections for their own manuals"
  ON public.manual_sections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.manuals
      WHERE manuals.id = manual_sections.manual_id
      AND manuals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sections for their own manuals"
  ON public.manual_sections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.manuals
      WHERE manuals.id = manual_sections.manual_id
      AND manuals.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can view all sections"
  ON public.manual_sections
  FOR SELECT
  USING (true);

-- Create indexes for efficient querying
CREATE INDEX idx_manual_sections_manual_id ON public.manual_sections(manual_id);
CREATE INDEX idx_manual_sections_heading_level ON public.manual_sections(heading_level);
CREATE INDEX idx_manual_sections_parent ON public.manual_sections(parent_section_id);

-- Add vehicle info extraction tracking to manuals table
ALTER TABLE public.manuals 
ADD COLUMN IF NOT EXISTS vehicle_year TEXT,
ADD COLUMN IF NOT EXISTS vehicle_make TEXT;

-- Create index for vehicle lookups
CREATE INDEX IF NOT EXISTS idx_manuals_vehicle ON public.manuals(vehicle_year, vehicle_make, vehicle_model);