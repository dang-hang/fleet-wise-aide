-- Fix the generate_case_number function to handle concurrent requests safely
CREATE OR REPLACE FUNCTION public.generate_case_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_case_number TEXT;
  counter INTEGER;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    -- Get the next counter value
    SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM 6) AS INTEGER)), 0) + 1
    INTO counter
    FROM public.cases;
    
    -- Generate the case number
    new_case_number := 'CASE-' || LPAD(counter::TEXT, 3, '0');
    
    -- Check if this case number already exists
    IF NOT EXISTS (SELECT 1 FROM public.cases WHERE case_number = new_case_number) THEN
      RETURN new_case_number;
    END IF;
    
    -- Increment attempt counter
    attempt := attempt + 1;
    
    -- If we've tried too many times, throw an error
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique case number after % attempts', max_attempts;
    END IF;
    
    -- Add a small random delay to reduce contention
    PERFORM pg_sleep(random() * 0.1);
  END LOOP;
END;
$function$;