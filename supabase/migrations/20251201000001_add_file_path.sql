-- Add file_path and file_name to v2_manuals
alter table public.v2_manuals 
add column if not exists file_path text,
add column if not exists file_name text;
