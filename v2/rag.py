import fitz  # PyMuPDF
from openai import OpenAI
from typing import List, Optional, Tuple
from dataclasses import dataclass
import json

@dataclass
class VehicleInfo:
    year: Optional[int]
    make: Optional[str]
    model: Optional[str]

@dataclass
class SectionReference:
    section_name: str
    first_page: int
    length: int
    relevance_score: float = 1.0

@dataclass
class ImageReference:
    page: int
    x: int
    y: int
    w: int
    h: int

@dataclass
class RetrievalResult:
    sections: List[SectionReference]
    images: List[ImageReference]
    extracted_text: str
    vehicle_info: VehicleInfo


class QueryProcessor:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
    
    def extract_vehicle_info(self, user_query: str) -> VehicleInfo:
        """Extract year/make/model from natural language query"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """Extract vehicle information from user queries.
                    
Return JSON:
{
  "year": 2020,  // null if not mentioned
  "make": "Honda",  // null if not mentioned
  "model": "Civic"  // null if not mentioned
}

Examples:
- "How do I change oil in my 2020 Honda Civic?" -> {"year": 2020, "make": "Honda", "model": "Civic"}
- "What's the tire pressure for a Civic?" -> {"year": null, "make": null, "model": "Civic"}
- "My 2019 Toyota needs maintenance" -> {"year": 2019, "make": "Toyota", "model": null}
"""
                },
                {
                    "role": "user",
                    "content": user_query
                }
            ],
            max_tokens=100
        )
        
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        try:
            data = json.loads(content)
            return VehicleInfo(
                year=data.get('year'),
                make=data.get('make'),
                model=data.get('model')
            )
        except json.JSONDecodeError:
            print(f"Failed to parse vehicle info: {content}")
            return VehicleInfo(None, None, None)
    
    def identify_relevant_topics(self, user_query: str) -> List[str]:
        """Extract key topics/keywords from query for section filtering"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """Extract key automotive topics from the query.
                    
Return JSON array of relevant topics/keywords:
["oil change", "maintenance", "engine"]

Focus on:
- Maintenance tasks
- Vehicle systems (engine, transmission, brakes, etc.)
- Parts/components
- Problems/symptoms

Return empty array if query is too general.
"""
                },
                {
                    "role": "user",
                    "content": user_query
                }
            ],
            max_tokens=100
        )
        
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return []


class SectionRetriever:
    def __init__(self, db: 'ManualsDB', pdf_base_path: str = "./manuals/"):
        """
        Args:
            db: ManualsDB instance
            pdf_base_path: Directory where PDFs are stored as {manual_id}.pdf
        """
        self.db = db
        self.pdf_base_path = pdf_base_path
    
    def get_pdf_path(self, manual_id: int) -> str:
        """Construct PDF path from manual_id"""
        return f"{self.pdf_base_path}{manual_id}.pdf"
    
    def get_sections_for_vehicle(
        self, 
        vehicle_info: VehicleInfo,
        user_id: str = None
    ) -> List[Tuple[SectionReference, int]]:
        """
        Query database for sections matching vehicle info
        Returns list of (SectionReference, manual_id) tuples
        """
        if not any([vehicle_info.year, vehicle_info.make, vehicle_info.model]):
            return []
        
        # Use query() for SELECT statements
        results = self.db.query(
            self.db.Commands.GetSections,
            vehicle_info.make or '%', 
            vehicle_info.model or '%', 
            vehicle_info.year or 0,
            user_id
        )
        
        # GetSections returns: manual_id, section_name, first_page, length
        sections = []
        for row in results:
            sections.append((
                SectionReference(
                    section_name=row[1],
                    first_page=row[2],
                    length=row[3]
                ),
                row[0]  # manual_id
            ))
        
        return sections
    
    def filter_sections_by_relevance(
        self,
        sections: List[Tuple[SectionReference, int]],
        topics: List[str]
    ) -> List[Tuple[SectionReference, int]]:
        """Filter sections by keyword matching"""
        if not topics:
            return sections
        
        filtered = []
        for section, manual_id in sections:
            section_lower = section.section_name.lower()
            # Check if any topic appears in section name
            for topic in topics:
                if topic.lower() in section_lower:
                    section.relevance_score = 1.0
                    filtered.append((section, manual_id))
                    break
        
        # If no matches, return all sections (fallback)
        return filtered if filtered else sections
    
    def extract_text_from_section(
        self,
        pdf_path: str,
        first_page: int,
        length: int
    ) -> str:
        """Extract text from specified page range"""
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num in range(first_page, min(first_page + length, len(doc))):
            page = doc[page_num]
            text_parts.append(page.get_text())
        
        doc.close()
        return "\n\n".join(text_parts)
    
    def get_images_for_pages(
        self,
        manual_id: int,
        first_page: int,
        length: int,
        user_id: str = None
    ) -> List[ImageReference]:
        """Get all images within a page range for a specific manual"""
        results = self.db.query(
            self.db.Commands.GetImage,
            manual_id,
            first_page, 
            first_page + length - 1,
            user_id
        )
        
        # GetImage returns: manual_id, page, x, y, w, h
        images = []
        for row in results:
            images.append(ImageReference(
                page=row[2], # page is 3rd column in v2_images.*
                x=row[3],
                y=row[4],
                w=row[5],
                h=row[6]
            ))
        
        return images


class RAGSystem:
    def __init__(
        self,
        db: 'ManualsDB',
        api_key: str,
        pdf_base_path: str = "./manuals/"
    ):
        """Main RAG pipeline orchestrator."""
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required to initialize RAGSystem")

        self.db = db
        self.query_processor = QueryProcessor(api_key)
        self.retriever = SectionRetriever(db, pdf_base_path)
        self.client = OpenAI(api_key=api_key)
    
    def query(
        self,
        user_query: str,
        max_sections: int = 3,
        user_id: str = None
    ) -> RetrievalResult:
        """
        Main RAG pipeline: query -> retrieve -> return references
        """
        print(f"Processing query: {user_query}")
        
        # Step 1: Extract vehicle info
        vehicle_info = self.query_processor.extract_vehicle_info(user_query)
        print(f"Vehicle: {vehicle_info.year} {vehicle_info.make} {vehicle_info.model}")
        
        # Step 2: Get relevant sections
        sections_with_ids = self.retriever.get_sections_for_vehicle(vehicle_info, user_id)
        print(f"Found {len(sections_with_ids)} sections")
        
        # Step 3: Filter by relevance
        topics = self.query_processor.identify_relevant_topics(user_query)
        print(f"Topics: {topics}")
        
        filtered_sections = self.retriever.filter_sections_by_relevance(
            sections_with_ids, topics
        )[:max_sections]
        
        # Step 4: Extract text from top sections
        extracted_text = ""
        all_images = []
        final_sections = []
        
        for section, manual_id in filtered_sections:
            # Get PDF path using manual_id
            pdf_path = self.retriever.get_pdf_path(manual_id)
            
            text = self.retriever.extract_text_from_section(
                pdf_path,
                section.first_page,
                section.length
            )
            extracted_text += f"\n\n=== {section.section_name} ===\n{text}"
            final_sections.append(section)
            
            # Get images for this section
            images = self.retriever.get_images_for_pages(
                manual_id,
                section.first_page,
                section.length,
                user_id
            )
            all_images.extend(images)
            
        return RetrievalResult(
            sections=final_sections,
            images=all_images,
            extracted_text=extracted_text,
            vehicle_info=vehicle_info
        )    def answer_with_context(
        self,
        user_query: str,
        retrieval_result: RetrievalResult
    ) -> str:
        """Generate answer using retrieved context"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": f"""You are an automotive manual assistant. Answer questions using ONLY the provided manual excerpts.

Vehicle: {retrieval_result.vehicle_info.year} {retrieval_result.vehicle_info.make} {retrieval_result.vehicle_info.model}

Manual Sections Retrieved:
{retrieval_result.extracted_text}

Rules:
- Only use information from the manual excerpts above
- Cite section names when referencing information
- If the manual doesn't contain the answer, say so
- Be concise and practical
"""
                },
                {
                    "role": "user",
                    "content": user_query
                }
            ],
            max_tokens=500
        )
        
        return response.choices[0].message.content


# Usage example
if __name__ == "__main__":
    from manuals_db import ManualsDB
    
    # Initialize
    db = ManualsDB("manuals.db")
    
    # PDFs stored as ./manuals/1.pdf, ./manuals/2.pdf, etc.
    rag = RAGSystem(db, api_key="your-openai-api-key", pdf_base_path="./manuals/")
    
    # Query
    user_query = "How do I change the oil in my 2020 Honda Civic?"
    
    # Retrieve references
    result = rag.query(user_query)
    
    print("\n=== RETRIEVED SECTIONS ===")
    for section in result.sections:
        print(f"- {section.section_name} (pages {section.first_page}-{section.first_page + section.length})")
    
    print(f"\n=== FOUND {len(result.images)} IMAGES ===")
    
    # Generate answer with context
    answer = rag.answer_with_context(user_query, result)
    print(f"\n=== ANSWER ===\n{answer}")