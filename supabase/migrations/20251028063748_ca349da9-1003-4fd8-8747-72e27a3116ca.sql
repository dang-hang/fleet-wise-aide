-- Add parsed_content column to manuals table to store extracted text
ALTER TABLE public.manuals 
ADD COLUMN parsed_content TEXT,
ADD COLUMN total_pages INTEGER;

-- Create a table to store document chunks with page numbers for better reference
CREATE TABLE public.manual_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(manual_id, page_number)
);

-- Enable RLS on manual_pages
ALTER TABLE public.manual_pages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for manual_pages
CREATE POLICY "Users can view all manual pages"
ON public.manual_pages
FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own manual pages"
ON public.manual_pages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuals
    WHERE manuals.id = manual_pages.manual_id
    AND manuals.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own manual pages"
ON public.manual_pages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.manuals
    WHERE manuals.id = manual_pages.manual_id
    AND manuals.user_id = auth.uid()
  )
);

-- Create index for faster searches
CREATE INDEX idx_manual_pages_manual_id ON public.manual_pages(manual_id);
CREATE INDEX idx_manual_pages_content ON public.manual_pages USING gin(to_tsvector('english', content));