from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
try:
    from manuals_db import ManualsDB
    from rag import RAGSystem
    from processor import ManualProcessor, ManualIngestion
    from image_extractor import ImageExtractor, ImageRequest
except ModuleNotFoundError:
    # Allow importing as a package module (python -m v2.app)
    from v2.manuals_db import ManualsDB
    from v2.rag import RAGSystem
    from v2.processor import ManualProcessor, ManualIngestion
    from v2.image_extractor import ImageExtractor, ImageRequest
import os
from werkzeug.utils import secure_filename
import traceback
from io import BytesIO
from supabase import create_client, Client

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

# Configuration
UPLOAD_FOLDER = './uploads'
MANUALS_FOLDER = './manuals'
DATABASE_NAME = 'manuals.db'
ALLOWED_EXTENSIONS = {'pdf'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MANUALS_FOLDER'] = MANUALS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Create directories if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(MANUALS_FOLDER, exist_ok=True)

# Initialize database and RAG system
db = ManualsDB(DATABASE_NAME)
api_key = os.getenv('OPENAI_API_KEY')
if not api_key:
    raise RuntimeError("OPENAI_API_KEY environment variable must be set before starting the API server")

# Initialize Supabase
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

rag_system = RAGSystem(db, api_key=api_key, pdf_base_path=MANUALS_FOLDER + '/')
manual_processor = ManualProcessor(api_key=api_key)
manual_ingestion = ManualIngestion(db, manual_processor)
image_extractor = ImageExtractor(pdf_base_path=MANUALS_FOLDER + '/')


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ========== QUERY ENDPOINTS ==========

@app.route('/api/references', methods=['POST'])
def get_references():
    """
    Get all references (sections + images) for a query
    Body: {
        "query": "How do I change the oil?",
        "max_sections": 3  (optional, default 3)
    }
    
    Returns:
    {
        "query": "original query",
        "vehicle_info": {"year": 2023, "make": "Chevrolet", "model": "Tahoe"},
        "references": [
            {
                "type": "section",
                "manual_id": 1,
                "section_name": "Engine Oil",
                "first_page": 45,
                "last_page": 47,
                "length": 3,
                "relevance_score": 1.0
            },
            {
                "type": "image",
                "manual_id": 1,
                "page": 46,
                "x": 10,
                "y": 20,
                "w": 50,
                "h": 30,
                "image_url": "/api/images/extract/1/46?x=10&y=20&w=50&h=30"
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400
        
        query = data['query']
        max_sections = data.get('max_sections', 3)
        
        # Retrieve references
        result = rag_system.query(query, max_sections=max_sections)
        
        # Get manual_id from the retrieved sections
        # Query the database to find which manual these sections belong to
        manual_id = None
        if result.sections:
            # Get manual_id from first section's vehicle info
            db.cursor.execute("""
                SELECT manual_id FROM Manuals 
                WHERE make = ? AND model = ? AND year = ? AND active = 1
                LIMIT 1
            """, (result.vehicle_info.make, result.vehicle_info.model, result.vehicle_info.year))
            manual_result = db.cursor.fetchone()
            if manual_result:
                manual_id = manual_result[0]
        
        # Build unified references list
        references = []
        
        # Add section references
        for section in result.sections:
            references.append({
                "type": "section",
                "manual_id": manual_id,
                "section_name": section.section_name,
                "first_page": section.first_page,
                "last_page": section.first_page + section.length - 1,
                "length": section.length,
                "relevance_score": section.relevance_score
            })
        
        # Add image references with URLs
        for img in result.images:
            references.append({
                "type": "image",
                "manual_id": manual_id,
                "page": img.page,
                "x": img.x,
                "y": img.y,
                "w": img.w,
                "h": img.h,
                "image_url": f"/api/images/extract/{manual_id}/{img.page}?x={img.x}&y={img.y}&w={img.w}&h={img.h}"
            })
        
        response = {
            "query": query,
            "vehicle_info": {
                "year": result.vehicle_info.year,
                "make": result.vehicle_info.make,
                "model": result.vehicle_info.model
            },
            "references": references,
            "summary": {
                "total_references": len(references),
                "sections": len(result.sections),
                "images": len(result.images)
            }
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error in get_references: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/query', methods=['POST'])
def query_manual():
    """
    Query the RAG system (legacy endpoint - use /api/references instead)
    Body: {
        "query": "How do I change the oil?",
        "max_sections": 3  (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400
        
        query = data['query']
        max_sections = data.get('max_sections', 3)
        
        # Retrieve references
        result = rag_system.query(query, max_sections=max_sections)
        
        # Format response
        response = {
            'vehicle_info': {
                'year': result.vehicle_info.year,
                'make': result.vehicle_info.make,
                'model': result.vehicle_info.model
            },
            'sections': [
                {
                    'section_name': section.section_name,
                    'first_page': section.first_page,
                    'length': section.length,
                    'relevance_score': section.relevance_score
                }
                for section in result.sections
            ],
            'images': [
                {
                    'page': img.page,
                    'x': img.x,
                    'y': img.y,
                    'w': img.w,
                    'h': img.h
                }
                for img in result.images
            ],
            'extracted_text': result.extracted_text
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error in query: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/answer', methods=['POST'])
def get_answer():
    """
    Get answer with context
    Body: {
        "query": "How do I change the oil?",
        "max_sections": 3  (optional)
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400
        
        query = data['query']
        max_sections = data.get('max_sections', 3)
        
        # Retrieve references
        result = rag_system.query(query, max_sections=max_sections)
        
        # Generate answer
        answer = rag_system.answer_with_context(query, result)
        
        # Format response
        response = {
            'answer': answer,
            'vehicle_info': {
                'year': result.vehicle_info.year,
                'make': result.vehicle_info.make,
                'model': result.vehicle_info.model
            },
            'references': [
                {
                    'section_name': section.section_name,
                    'first_page': section.first_page,
                    'length': section.length
                }
                for section in result.sections
            ],
            'images_count': len(result.images)
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error in answer: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


# ========== MANUAL MANAGEMENT ENDPOINTS ==========

@app.route('/api/manuals', methods=['GET'])
def list_manuals():
    """Get all manuals"""
    try:
        db.cursor.execute("SELECT * FROM Manuals WHERE active = 1")
        manuals = db.cursor.fetchall()
        
        response = [
            {
                'manual_id': m[0],
                'year': m[1],
                'make': m[2],
                'model': m[3],
                'uplifted': bool(m[4]),
                'active': bool(m[5])
            }
            for m in manuals
        ]
        
        return jsonify(response), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manuals/<int:manual_id>', methods=['GET'])
def get_manual_details(manual_id):
    """Get details for a specific manual"""
    try:
        # Get manual info
        db.cursor.execute("SELECT * FROM Manuals WHERE manual_id = ?", (manual_id,))
        manual = db.cursor.fetchone()
        
        if not manual:
            return jsonify({'error': 'Manual not found'}), 404
        
        # Get sections
        db.cursor.execute("SELECT * FROM Sections WHERE manual_id = ?", (manual_id,))
        sections = db.cursor.fetchall()
        
        # Get images
        db.cursor.execute("SELECT COUNT(*) FROM Images WHERE manual_id = ?", (manual_id,))
        image_count = db.cursor.fetchone()[0]
        
        response = {
            'manual_id': manual[0],
            'year': manual[1],
            'make': manual[2],
            'model': manual[3],
            'uplifted': bool(manual[4]),
            'active': bool(manual[5]),
            'sections': [
                {
                    'section_name': s[1],
                    'first_page': s[2],
                    'length': s[3],
                    'h_level': s[4]
                }
                for s in sections
            ],
            'image_count': image_count
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manuals/<int:manual_id>', methods=['DELETE'])
def delete_manual(manual_id):
    """Soft delete a manual"""
    try:
        db.commit(db.Commands.RemoveManual, manual_id)
        return jsonify({'message': 'Manual deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manuals/upload', methods=['POST'])
def upload_manual():
    """
    Upload and ingest a new manual
    Form data:
        - file: PDF file
        - year: int
        - make: str
        - model: str
        - uplifted: bool (optional)
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only PDF files are allowed'}), 400
        
        # Get form data
        year = request.form.get('year', type=int)
        make = request.form.get('make')
        model = request.form.get('model')
        uplifted = request.form.get('uplifted', 'false').lower() == 'true'
        
        if not all([year, make, model]):
            return jsonify({'error': 'Year, make, and model are required'}), 400
        
        # Save file temporarily
        filename = secure_filename(file.filename)
        
        # If Supabase is configured, upload there
        if supabase:
            file_content = file.read()
            storage_path = f"{year}/{make}/{model}/{filename}"
            
            # Upload to Supabase Storage
            try:
                supabase.storage.from_('manuals').upload(
                    path=storage_path,
                    file=file_content,
                    file_options={"content-type": "application/pdf"}
                )
                
                # Ingest using storage path
                manual_id = manual_ingestion.ingest_manual(
                    pdf_path=storage_path,
                    year=year,
                    make=make,
                    model=model,
                    uplifted=uplifted
                )
            except Exception as e:
                # If upload fails (e.g. already exists), try to ingest anyway if it's there
                print(f"Upload failed or file exists: {e}")
                manual_id = manual_ingestion.ingest_manual(
                    pdf_path=storage_path,
                    year=year,
                    make=make,
                    model=model,
                    uplifted=uplifted
                )
        else:
            # Fallback to local storage
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(temp_path)
            
            # Ingest manual
            manual_id = manual_ingestion.ingest_manual(
                pdf_path=temp_path,
                year=year,
                make=make,
                model=model,
                uplifted=uplifted
            )
            
            # Move to manuals folder with proper naming
            final_path = os.path.join(app.config['MANUALS_FOLDER'], f'{manual_id}.pdf')
            os.rename(temp_path, final_path)
        
        return jsonify({
            'message': 'Manual uploaded and ingested successfully',
            'manual_id': manual_id
        }), 201
        
    except Exception as e:
        print(f"Error in upload: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


# ========== IMAGE EXTRACTION ENDPOINTS ==========

@app.route('/api/images/extract', methods=['POST'])
def extract_images():
    """
    Extract images from a manual
    Body: {
        "manual_id": 1,
        "images": [
            {"page": 5, "x": 10, "y": 20, "w": 50, "h": 30},
            {"page": 10, "x": 15, "y": 25, "w": 60, "h": 40}
        ],
        "dpi": 150  (optional, default 150)
    }
    
    Returns base64 encoded images
    """
    try:
        data = request.get_json()
        
        if not data or 'manual_id' not in data or 'images' not in data:
            return jsonify({'error': 'manual_id and images are required'}), 400
        
        manual_id = data['manual_id']
        image_specs = data['images']
        dpi = data.get('dpi', 150)
        
        # Validate manual exists
        db.cursor.execute("SELECT * FROM Manuals WHERE manual_id = ? AND active = 1", (manual_id,))
        if not db.cursor.fetchone():
            return jsonify({'error': 'Manual not found'}), 404
        
        # Convert to ImageRequest objects
        image_requests = []
        for spec in image_specs:
            try:
                image_requests.append(ImageRequest(
                    page=spec['page'],
                    x=spec['x'],
                    y=spec['y'],
                    w=spec['w'],
                    h=spec['h']
                ))
            except KeyError as e:
                return jsonify({'error': f'Missing required field: {e}'}), 400
        
        # Extract images
        extracted = image_extractor.extract_images(
            manual_id=manual_id,
            image_requests=image_requests,
            dpi=dpi
        )
        
        # Format response
        response = {
            'manual_id': manual_id,
            'images': [
                {
                    'page': img.page,
                    'x': img.x,
                    'y': img.y,
                    'w': img.w,
                    'h': img.h,
                    'format': img.format,
                    'data': img.image_data  # Base64 encoded
                }
                for img in extracted
            ],
            'count': len(extracted)
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error extracting images: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/images/extract/<int:manual_id>/<int:page>', methods=['GET'])
def extract_single_image(manual_id, page):
    """
    Extract a single image and return it as a file
    Query params:
        - x: int (percentage)
        - y: int (percentage)
        - w: int (percentage)
        - h: int (percentage)
        - dpi: int (optional, default 150)
    
    Returns the image file directly (PNG)
    """
    try:
        # Get query parameters
        x = request.args.get('x', type=int)
        y = request.args.get('y', type=int)
        w = request.args.get('w', type=int)
        h = request.args.get('h', type=int)
        dpi = request.args.get('dpi', default=150, type=int)
        
        if None in [x, y, w, h]:
            return jsonify({'error': 'x, y, w, h parameters are required'}), 400
        
        # Validate manual exists
        db.cursor.execute("SELECT * FROM Manuals WHERE manual_id = ? AND active = 1", (manual_id,))
        if not db.cursor.fetchone():
            return jsonify({'error': 'Manual not found'}), 404
        
        # Extract image
        img_bytes, img_format = image_extractor.extract_image_as_bytes(
            manual_id=manual_id,
            page=page,
            x=x,
            y=y,
            w=w,
            h=h,
            dpi=dpi
        )
        
        # Return as file
        return send_file(
            BytesIO(img_bytes),
            mimetype=f'image/{img_format}',
            as_attachment=False,
            download_name=f'manual_{manual_id}_page_{page}.{img_format}'
        )
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error extracting single image: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/images/from-query', methods=['POST'])
def extract_images_from_query():
    """
    Extract images that were found during a query
    Body: {
        "query": "How do I change the oil?",
        "max_sections": 3,  (optional)
        "dpi": 150  (optional)
    }
    
    Returns both the query result and extracted images
    """
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400
        
        query = data['query']
        max_sections = data.get('max_sections', 3)
        dpi = data.get('dpi', 150)
        
        # Retrieve references
        result = rag_system.query(query, max_sections=max_sections)
        
        # Get manual_id from first section (assuming all sections are from same manual)
        if not result.sections:
            return jsonify({
                'answer': 'No relevant sections found',
                'images': []
            }), 200
        
        # Get manual_id from database for the sections
        # We need to find which manual these sections belong to
        db.cursor.execute("""
            SELECT DISTINCT Sections.manual_id 
            FROM Sections 
            INNER JOIN Manuals ON Sections.manual_id = Manuals.manual_id
            WHERE Manuals.active = 1
            LIMIT 1
        """)
        manual_result = db.cursor.fetchone()
        
        if not manual_result:
            return jsonify({
                'answer': 'No active manual found',
                'images': []
            }), 200
        
        manual_id = manual_result[0]
        
        # Convert image references to requests
        image_requests = [
            ImageRequest(
                page=img.page,
                x=img.x,
                y=img.y,
                w=img.w,
                h=img.h
            )
            for img in result.images
        ]
        
        # Extract images if any
        extracted_images = []
        if image_requests:
            extracted = image_extractor.extract_images(
                manual_id=manual_id,
                image_requests=image_requests,
                dpi=dpi
            )
            extracted_images = [
                {
                    'page': img.page,
                    'format': img.format,
                    'data': img.image_data
                }
                for img in extracted
            ]
       