import fitz  # PyMuPDF
from typing import List, Tuple
from dataclasses import dataclass
import base64
from io import BytesIO
from PIL import Image

@dataclass
class ImageRequest:
    page: int
    x: int  # Percentage
    y: int  # Percentage
    w: int  # Percentage
    h: int  # Percentage

@dataclass
class ExtractedImage:
    page: int
    x: int
    y: int
    w: int
    h: int
    image_data: str  # Base64 encoded
    format: str  # 'png', 'jpeg'

class ImageExtractor:
    def __init__(self, pdf_base_path: str = "./manuals/"):
        self.pdf_base_path = pdf_base_path
    
    def get_pdf_path(self, manual_id: int) -> str:
        """Construct PDF path from manual_id"""
        return f"{self.pdf_base_path}{manual_id}.pdf"
    
    def extract_image_from_page(
        self,
        pdf_path: str,
        page_num: int,
        x_percent: int,
        y_percent: int,
        w_percent: int,
        h_percent: int,
        dpi: int = 150
    ) -> Tuple[bytes, str]:
        """
        Extract a region from a PDF page as an image
        
        Args:
            pdf_path: Path to PDF file
            page_num: Page number (0-indexed)
            x_percent, y_percent, w_percent, h_percent: Bounding box as percentages
            dpi: Resolution for rendering
            
        Returns:
            Tuple of (image_bytes, format)
        """
        doc = fitz.open(pdf_path)
        
        if page_num >= len(doc):
            doc.close()
            raise ValueError(f"Page {page_num} does not exist in PDF")
        
        page = doc[page_num]
        
        # Get page dimensions
        page_rect = page.rect
        page_width = page_rect.width
        page_height = page_rect.height
        
        # Convert percentages to absolute coordinates
        x = (x_percent / 100.0) * page_width
        y = (y_percent / 100.0) * page_height
        w = (w_percent / 100.0) * page_width
        h = (h_percent / 100.0) * page_height
        
        # Create bounding box rectangle
        clip_rect = fitz.Rect(x, y, x + w, y + h)
        
        # Render the page at specified DPI
        mat = fitz.Matrix(dpi / 72, dpi / 72)  # 72 is default DPI
        pix = page.get_pixmap(matrix=mat, clip=clip_rect)
        
        # Convert to PNG bytes
        img_bytes = pix.tobytes("png")
        
        doc.close()
        
        return img_bytes, "png"
    
    def extract_images(
        self,
        manual_id: int,
        image_requests: List[ImageRequest],
        dpi: int = 150
    ) -> List[ExtractedImage]:
        """
        Extract multiple images from a PDF
        
        Args:
            manual_id: Manual ID
            image_requests: List of image regions to extract
            dpi: Resolution for rendering
            
        Returns:
            List of ExtractedImage objects with base64 encoded data
        """
        pdf_path = self.get_pdf_path(manual_id)
        extracted_images = []
        
        for req in image_requests:
            try:
                img_bytes, format = self.extract_image_from_page(
                    pdf_path=pdf_path,
                    page_num=req.page,
                    x_percent=req.x,
                    y_percent=req.y,
                    w_percent=req.w,
                    h_percent=req.h,
                    dpi=dpi
                )
                
                # Encode to base64
                img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                
                extracted_images.append(ExtractedImage(
                    page=req.page,
                    x=req.x,
                    y=req.y,
                    w=req.w,
                    h=req.h,
                    image_data=img_b64,
                    format=format
                ))
                
            except Exception as e:
                print(f"Error extracting image from page {req.page}: {e}")
                # Continue with other images
                continue
        
        return extracted_images
    
    def extract_image_as_bytes(
        self,
        manual_id: int,
        page: int,
        x: int,
        y: int,
        w: int,
        h: int,
        dpi: int = 150
    ) -> Tuple[bytes, str]:
        """
        Extract a single image and return raw bytes
        Useful for direct HTTP response
        """
        pdf_path = self.get_pdf_path(manual_id)
        return self.extract_image_from_page(
            pdf_path, page, x, y, w, h, dpi
        )


# Usage example
if __name__ == "__main__":
    extractor = ImageExtractor(pdf_base_path="./manuals/")
    
    # Extract images
    requests = [
        ImageRequest(page=5, x=10, y=20, w=50, h=30),
        ImageRequest(page=10, x=15, y=25, w=60, h=40),
    ]
    
    images = extractor.extract_images(manual_id=1, image_requests=requests)
    
    print(f"Extracted {len(images)} images")
    for img in images:
        print(f"  Page {img.page}: {img.format} ({len(img.image_data)} chars base64)")