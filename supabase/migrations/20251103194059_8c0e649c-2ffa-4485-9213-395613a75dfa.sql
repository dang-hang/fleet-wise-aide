-- Add vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Alter manuals table to add SHA256 hash and ensure total_pages exists
ALTER TABLE public.manuals 
ADD COLUMN IF NOT EXISTS sha256 text,
ADD COLUMN IF NOT EXISTS total_pages integer;

-- Create manual_spans table for precise text locations
CREATE TABLE IF NOT EXISTS public.manual_spans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  bbox jsonb NOT NULL,
  text text NOT NULL,
  font_name text,
  font_size real,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_spans_manual_id ON public.manual_spans(manual_id);
CREATE INDEX IF NOT EXISTS idx_manual_spans_page ON public.manual_spans(manual_id, page_number);

-- Create manual_chunks table with vector embeddings
CREATE TABLE IF NOT EXISTS public.manual_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536),
  span_ids uuid[],
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_chunks_manual_id ON public.manual_chunks(manual_id);
CREATE INDEX IF NOT EXISTS idx_manual_chunks_embedding ON public.manual_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create manual_figures table for extracted images/diagrams
CREATE TABLE IF NOT EXISTS public.manual_figures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  figure_index integer NOT NULL,
  bbox jsonb NOT NULL,
  storage_path text NOT NULL,
  caption text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(manual_id, page_number, figure_index)
);

CREATE INDEX IF NOT EXISTS idx_manual_figures_manual_id ON public.manual_figures(manual_id);

-- Create manual_tables table for extracted tables
CREATE TABLE IF NOT EXISTS public.manual_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  table_index integer NOT NULL,
  bbox jsonb NOT NULL,
  data jsonb NOT NULL,
  caption text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(manual_id, page_number, table_index)
);

CREATE INDEX IF NOT EXISTS idx_manual_tables_manual_id ON public.manual_tables(manual_id);

-- Enable RLS on all new tables
ALTER TABLE public.manual_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_tables ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manual_spans
CREATE POLICY "Users can view all manual spans"
ON public.manual_spans FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own manual spans"
ON public.manual_spans FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own manual spans"
ON public.manual_spans FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

-- RLS Policies for manual_chunks
CREATE POLICY "Users can view all manual chunks"
ON public.manual_chunks FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own manual chunks"
ON public.manual_chunks FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own manual chunks"
ON public.manual_chunks FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

-- RLS Policies for manual_figures
CREATE POLICY "Users can view all manual figures"
ON public.manual_figures FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own manual figures"
ON public.manual_figures FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own manual figures"
ON public.manual_figures FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

-- RLS Policies for manual_tables
CREATE POLICY "Users can view all manual tables"
ON public.manual_tables FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own manual tables"
ON public.manual_tables FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own manual tables"
ON public.manual_tables FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.manuals 
    WHERE id = manual_id AND user_id = auth.uid()
  )
);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  manual_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  manual_id uuid,
  content text,
  span_ids uuid[],
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mc.id,
    mc.manual_id,
    mc.content,
    mc.span_ids,
    mc.metadata,
    1 - (mc.embedding <=> query_embedding) as similarity
  FROM public.manual_chunks mc
  WHERE 
    mc.embedding IS NOT NULL
    AND (manual_filter IS NULL OR mc.manual_id = manual_filter)
  ORDER BY mc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;