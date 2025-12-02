import fitz  # PyMuPDF
import base64
from openai import OpenAI
from typing import List, Dict, Tuple
from dataclasses import dataclass
import json

@dataclass
class Section:
    section_name: str
    first_page: int
    length: int
    h_level: int

@dataclass
class ImageRegion:
    page: int
    x: int
    y: int
    w: int
    h: int

class ManualProcessor:
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
    
    def page_to_base64(self, page: fitz.Page, dpi: int = 150) -> str:
        """Convert PDF page to base64 encoded image"""
        pix = page.get_pixmap(dpi=dpi)
        img_bytes = pix.tobytes("png")
        return base64.b64encode(img_bytes).decode('utf-8')
    
    def extract_hierarchy_from_page(self, page_image_b64: str, page_num: int) -> List[Dict]:
        """Use ChatGPT Vision to identify sections and hierarchy on a page"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analyze this manual page and extract hierarchical sections.
                            
Return a JSON array of sections found on this page:
[
  {
    "section_name": "Section title",
    "h_level": 1-6 (1=main chapter, 2=subsection, etc),
    "starts_on_this_page": true/false
  }
]

Rules:
- h_level 1: Main chapters/major sections
- h_level 2-3: Subsections
- h_level 4-6: Minor subdivisions
- Only include sections that START on this page
- If no clear sections, return empty array []
"""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{page_image_b64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=1000
        )
        
        content = response.choices[0].message.content
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            print(f"Failed to parse JSON from page {page_num}: {content}")
            return []
    
    def detect_images_on_page(self, page_image_b64: str, page_num: int) -> List[ImageRegion]:
        """Use ChatGPT Vision to identify diagram/image regions"""
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Identify all diagrams, figures, charts, and images on this page.
                            
Return a JSON array of bounding boxes (as percentages of page dimensions):
[
  {
    "x": 10,  // left edge as % of page width
    "y": 20,  // top edge as % of page height
    "w": 50,  // width as % of page width
    "h": 30   // height as % of page height
  }
]

Only include significant images/diagrams, not decorative elements.
If no images, return empty array [].
"""
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{page_image_b64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )
        
        content = response.choices[0].message.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        try:
            regions = json.loads(content)
            return [
                ImageRegion(
                    page=page_num,
                    x=r['x'],
                    y=r['y'],
                    w=r['w'],
                    h=r['h']
                )
                for r in regions
            ]
        except (json.JSONDecodeError, KeyError):
            print(f"Failed to parse image regions from page {page_num}")
            return []
    
    def process_manual(
        self, 
        pdf_path: str, 
        year: int, 
        make: str, 
        model: str,
        batch_size: int = 5
    ) -> Tuple[List[Section], List[ImageRegion]]:
        """
        Process entire manual and extract sections + images
        
        Args:
            pdf_path: Path to PDF file
            year, make, model: Vehicle metadata
            batch_size: Process pages in batches to save API calls
        """
        doc = fitz.open(pdf_path)
        all_sections = []
        all_images = []
        
        current_section = None
        
        for page_num in range(len(doc)):
            print(f"Processing page {page_num + 1}/{len(doc)}...")
            page = doc[page_num]
            page_image = self.page_to_base64(page)
            
            # Extract hierarchy
            sections_on_page = self.extract_hierarchy_from_page(page_image, page_num)
            
            for section_data in sections_on_page:
                if section_data.get('starts_on_this_page', False):
                    # Close previous section
                    if current_section:
                        current_section.length = page_num - current_section.first_page
                        all_sections.append(current_section)
                    
                    # Start new section
                    current_section = Section(
                        section_name=section_data['section_name'],
                        first_page=page_num,
                        length=1,  # Will be updated when next section starts
                        h_level=section_data['h_level']
                    )
            
            # Detect images (optional: do this less frequently to save API costs)
            if page_num % 2 == 0:  # Check every other page
                images = self.detect_images_on_page(page_image, page_num)
                all_images.extend(images)
        
        # Close final section
        if current_section:
            current_section.length = len(doc) - current_section.first_page
            all_sections.append(current_section)
        
        doc.close()
        return all_sections, all_images


class ManualIngestion:
    def __init__(self, db: 'ManualsDB', processor: ManualProcessor):
        self.db = db
        self.processor = processor
    
    def ingest_manual(
        self, 
        pdf_path: str, 
        year: int, 
        make: str, 
        model: str,
        uplifted: bool = False
    ) -> int:
        """
        Ingest a manual into the database
        
        Returns:
            manual_id of the inserted manual
        """
        print(f"Ingesting manual: {year} {make} {model}")
        
        # Add manual record using execute_returning to get the ID
        manual_id = self.db.execute_returning(
            self.db.Commands.AddManual,
            year, make, model, 1 if uplifted else 0, 1  # active=1
        )
        
        print(f"Created manual with ID: {manual_id}")
        
        # Process PDF
        sections, images = self.processor.process_manual(
            pdf_path, year, make, model
        )
        
        # Insert sections
        print(f"Inserting {len(sections)} sections...")
        for section in sections:
            self.db.commit(
                self.db.Commands.AddSection,
                manual_id, section.section_name, section.first_page, 
                section.length, section.h_level
            )
        
        # Insert images
        print(f"Inserting {len(images)} images...")
        for img in images:
            self.db.commit(
                self.db.Commands.AddImage,
                manual_id, img.page, img.x, img.y, img.w, img.h
            )
        
        print(f"Manual ingestion complete. ID: {manual_id}")
        return manual_id
