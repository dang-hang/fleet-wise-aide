import os
import sys
from supabase import create_client, Client
from manuals_db import ManualsDB
from processor import ManualProcessor, ManualIngestion
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Supabase
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set")
    sys.exit(1)

supabase: Client = create_client(url, key)

# Initialize V2 components
db = ManualsDB("manuals.db") # Name doesn't matter for Postgres
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("Error: OPENAI_API_KEY must be set")
    sys.exit(1)

processor = ManualProcessor(api_key=api_key)
ingestion = ManualIngestion(db, processor)

def migrate_data():
    print("Starting migration of legacy manuals...")
    
    # 1. Fetch legacy manuals
    try:
        response = supabase.table("manuals").select("*").execute()
        legacy_manuals = response.data
        print(f"Found {len(legacy_manuals)} legacy manuals.")
    except Exception as e:
        print(f"Error fetching legacy manuals: {e}")
        return

    for manual in legacy_manuals:
        print(f"\nProcessing: {manual.get('title')} ({manual.get('id')})")
        
        # Check if already migrated (by file_path)
        # We need to query v2_manuals directly
        db.cursor.execute("SELECT id FROM v2_manuals WHERE file_path = %s", (manual.get('file_path'),))
        existing = db.cursor.fetchone()
        
        if existing:
            print(f"Skipping - already exists in v2_manuals with ID {existing[0]}")
            continue
            
        # Extract metadata
        year_range = manual.get('year_range')
        year = 2020 # Default
        if year_range:
            # Try to parse first year from range like "2010-2012" or "2015"
            try:
                year = int(year_range.split('-')[0].strip())
            except:
                pass
                
        make = manual.get('vehicle_type', 'Unknown')
        model = manual.get('vehicle_model', 'Unknown')
        user_id = manual.get('user_id')
        file_path = manual.get('file_path')
        title = manual.get('title')
        
        if not file_path:
            print("Skipping - no file path")
            continue
            
        try:
            # Ingest
            new_id = ingestion.ingest_manual(
                pdf_path=file_path,
                year=year,
                make=make,
                model=model,
                uplifted=False, # Legacy manuals weren't uplifted
                user_id=user_id,
                file_name=title
            )
            print(f"Successfully migrated to v2_manuals ID: {new_id}")
            
        except Exception as e:
            print(f"Failed to migrate manual {manual.get('id')}: {e}")

if __name__ == "__main__":
    migrate_data()
