-- Fix search_path for match_chunks function
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
SECURITY DEFINER
SET search_path TO 'public'
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