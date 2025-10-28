-- Create manuals table to store document metadata
CREATE TABLE public.manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  vehicle_model TEXT,
  year_range TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

-- Policies for manuals table
CREATE POLICY "Users can view all manuals"
ON public.manuals
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can upload their own manuals"
ON public.manuals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own manuals"
ON public.manuals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own manuals"
ON public.manuals
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create storage bucket for manuals
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuals', 'manuals', true);

-- Storage policies for manuals bucket
CREATE POLICY "Anyone can view manuals"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'manuals');

CREATE POLICY "Authenticated users can upload manuals"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'manuals');

CREATE POLICY "Users can update their own manual files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'manuals' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own manual files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'manuals' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_manuals_updated_at
BEFORE UPDATE ON public.manuals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();