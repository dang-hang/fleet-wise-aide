-- Create cases table for storing diagnostic cases
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  vehicle_year TEXT NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  problem_description TEXT NOT NULL,
  diagnostic_result TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own cases" 
ON public.cases 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases" 
ON public.cases 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cases" 
ON public.cases 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cases" 
ON public.cases 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_cases_updated_at
BEFORE UPDATE ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.update_cases_updated_at();

-- Create function to generate case numbers
CREATE OR REPLACE FUNCTION public.generate_case_number()
RETURNS TEXT AS $$
DECLARE
  new_case_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM 6) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.cases;
  
  new_case_number := 'CASE-' || LPAD(counter::TEXT, 3, '0');
  RETURN new_case_number;
END;
$$ LANGUAGE plpgsql SET search_path = public;