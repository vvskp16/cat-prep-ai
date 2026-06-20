# api.py
import os
import uuid
import base64
import json
from datetime import datetime
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from data_models import CATExtractionBatch, CATUnifiedQuestion
from ingestion import extract_structured_cat_batch

app = FastAPI(title="CAT Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories for local storage
FRONTEND_IMAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cat-frontend", "public", "images"))
CHROMA_DOCS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "chroma_ready_docs"))

os.makedirs(FRONTEND_IMAGE_DIR, exist_ok=True)
os.makedirs(CHROMA_DOCS_DIR, exist_ok=True)

@app.post("/api/test-extraction")
async def test_image_extraction(file: UploadFile = File(...)):
    # 1. Generate local filename
    timestamp = datetime.now().strftime("%d%m%y%H%M%S")
    safe_filename = f"Question_Image_{timestamp}.png"
    local_save_path = os.path.join(FRONTEND_IMAGE_DIR, safe_filename)
    
    # 2. Save image locally
    file_bytes = await file.read()
    with open(local_save_path, "wb") as f:
        f.write(file_bytes)
        
    base64_image = base64.b64encode(file_bytes).decode("utf-8")
    deterministic_ocr_text = "MOCK OCR: Assume standard math text is present."
    
    # 3. Trigger extraction
    extracted_batch = extract_structured_cat_batch(
        base64_images=[base64_image], 
        deterministic_ocr_text=deterministic_ocr_text
    )
    
    # 4. Inject Backend State
    final_questions = []
    shared_context_id = f"CTX_{uuid.uuid4().hex[:8].upper()}"
    
    for q in extracted_batch.questions:
        q_dict = q.model_dump(mode='json')
        q_dict["id"] = f"Q_{q.subject.upper()}_{uuid.uuid4().hex[:8].upper()}"
        
        if q_dict.get("has_parent_context") and q_dict.get("parent_context"):
            q_dict["parent_context"]["context_id"] = shared_context_id
            
        q_dict["local_image_paths"] = [f"/images/{safe_filename}"]
        final_questions.append(q_dict)
        
    return {"questions": final_questions}

# NEW: The Approval Endpoint
@app.post("/api/approve")
async def approve_and_save_document(question_data: dict):
    """
    Receives approved JSON from the UI and saves it as a flat file 
    in the dedicated ChromaDB staging folder.
    """
    question_id = question_data.get("id", f"UNKNOWN_{uuid.uuid4().hex[:8]}")
    file_path = os.path.join(CHROMA_DOCS_DIR, f"{question_id}.json")
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(question_data, f, indent=4)
        
    return {"status": "Success", "saved_path": file_path, "id": question_id}