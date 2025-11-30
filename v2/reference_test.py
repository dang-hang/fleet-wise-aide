from manuals_db import ManualsDB
from rag import RAGSystem
import os

def test_query(query: str, pdf_path: str, api_key: str):
    """
    Test the RAG system with a given query
    """
    print("=" * 80)
    print("RAG SYSTEM TEST")
    print("=" * 80)
    
    # Initialize database
    db = ManualsDB("manuals.db")
    
    # Map manual_id to PDF path
    # manual_id 1 = 2023 Tahoe
    pdf_storage = {
        1: pdf_path
    }
    
    # Create RAG system
    rag = RAGSystem(db, api_key=api_key, pdf_storage=pdf_storage)
    
    # Run query
    print(f"\n📝 QUERY: {query}\n")
    
    try:
        result = rag.query(query, max_sections=5)
        
        print("\n" + "=" * 80)
        print("VEHICLE DETECTED")
        print("=" * 80)
        print(f"Year: {result.vehicle_info.year}")
        print(f"Make: {result.vehicle_info.make}")
        print(f"Model: {result.vehicle_info.model}")
        
        print("\n" + "=" * 80)
        print(f"RETRIEVED SECTIONS ({len(result.sections)})")
        print("=" * 80)
        for i, section in enumerate(result.sections, 1):
            print(f"\n{i}. {section.section_name}")
            print(f"   Pages: {section.first_page} to {section.first_page + section.length - 1}")
            print(f"   Length: {section.length} pages")
            print(f"   Relevance: {section.relevance_score}")
        
        print("\n" + "=" * 80)
        print(f"FOUND IMAGES ({len(result.images)})")
        print("=" * 80)
        if result.images:
            for i, img in enumerate(result.images[:10], 1):  # Show first 10
                print(f"{i}. Page {img.page}: x={img.x}%, y={img.y}%, w={img.w}%, h={img.h}%")
            if len(result.images) > 10:
                print(f"... and {len(result.images) - 10} more images")
        else:
            print("No images found in retrieved sections")
        
        print("\n" + "=" * 80)
        print("EXTRACTED TEXT PREVIEW")
        print("=" * 80)
        preview_length = 500
        if result.extracted_text:
            print(result.extracted_text[:preview_length])
            if len(result.extracted_text) > preview_length:
                print(f"\n... (truncated, total length: {len(result.extracted_text)} chars)")
        else:
            print("No text extracted")
        
        # Generate answer
        print("\n" + "=" * 80)
        print("GENERATING ANSWER...")
        print("=" * 80)
        answer = rag.answer_with_context(query, result)
        print(f"\n{answer}")
        
        return result
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    import sys
    
    # Configuration
    PDF_PATH = "1.pdf"  # CHANGE THIS
    API_KEY = os.getenv("OPENAI_API_KEY")
    
    if not API_KEY:
        print("Error: Please set OPENAI_API_KEY environment variable")
        print("Example: export OPENAI_API_KEY='your-key-here'")
        sys.exit(1)
    
    if not os.path.exists(PDF_PATH):
        print(f"Error: PDF not found at {PDF_PATH}")
        print("Please update PDF_PATH in the script")
        sys.exit(1)
    
    car_info = "{model: Tahoe, make: Chevrolet, year: 2023, prompt: "
    # Test queries
    test_queries = [
        "How do I change the oil in my 2023 Chevrolet Tahoe?",
        "What's the tire pressure for my 2023 Chevrolet Tahoe?",
        "How do I use the remote start feature?",
    ]
    
    if len(sys.argv) > 1:
        # Use custom query from command line
        query = " ".join(sys.argv[1:])
        test_query(query, PDF_PATH, API_KEY)
    else:
        # Run all test queries
        for query in test_queries:
            test_query(car_info + query + "}", PDF_PATH, API_KEY)
            print("\n\n")
            input("Press Enter to continue to next query...")