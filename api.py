# api.py
import io
import os
import uuid
import base64
import json
from datetime import datetime
import aiofiles
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pytesseract
from data_models import CATExtractionBatch, CATUnifiedQuestion
from ingestion import enrich_scraped_json_batch, extract_structured_cat_batch
from PIL import Image

app = FastAPI(title="CAT Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Explicitly tell pytesseract where the installed Windows application lives
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Directories for local storage
FRONTEND_IMAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cat-frontend", "public", "images"))
CHROMA_DOCS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "chroma_ready_docs"))

os.makedirs(FRONTEND_IMAGE_DIR, exist_ok=True)
os.makedirs(CHROMA_DOCS_DIR, exist_ok=True)

@app.post("/api/test-extraction")
async def extract_test_data(
    file: UploadFile = File(...),
    model: str = Form("gpt-5.4-mini") # <--- Add this form parameter
):
    # 1. Read file into memory
    image_bytes = await file.read()
    
    # 2. DETERMINISTIC OCR LAYER: Extract hard text to prevent hallucination
    image_obj = Image.open(io.BytesIO(image_bytes))
    deterministic_ocr_text = pytesseract.image_to_string(image_obj).strip()
    
    # Fallback if OCR fails on purely visual charts
    if not deterministic_ocr_text:
        deterministic_ocr_text = "No readable text found. Rely strictly on visual context."

    # 3. Convert image to Base64 for the Multi-Modal LLM Vision
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    
    # 4. Trigger extraction (Passing the OCR text into the prompt)
    parsed_batch, token_usage = extract_structured_cat_batch(
        model=model,
        base64_images=[base64_image], 
        deterministic_ocr_text=deterministic_ocr_text
    )

    # 5. Inject Backend State
    final_questions = []
    shared_context_id = f"CTX_{uuid.uuid4().hex[:8].upper()}"
    
    for q in parsed_batch.questions:
        # Convert the strict Pydantic model to a mutable dict for state injection
        q_dict = q.model_dump()
        
        # Securely inject server-side identifiers to protect against LLM hallucinations
        q_dict["id"] = f"Q_{q_dict['subject'].upper()}_{uuid.uuid4().hex[:8].upper()}"
        
        # Tie DILR/RC question sets together using the shared context token
        if q_dict.get("has_parent_context") and q_dict.get("parent_context"):
            q_dict["parent_context"]["context_id"] = shared_context_id
            
        # Bind the relative asset trace path for frontend image rendering
        # q_dict["local_image_paths"] = [f"/images/{safe_filename}"]
        final_questions.append(q_dict)
        
    # 6. Return both synchronized payloads back to the Next.js UI
    return {
        "questions": final_questions,
        "usage": {
            "prompt_tokens": token_usage.prompt_tokens,
            "completion_tokens": token_usage.completion_tokens,
            "total_tokens": token_usage.total_tokens
        }
    }

# NEW: The Approval Endpoint
@app.post("/api/approve")
async def approve_and_save_document(question_data: dict):
    """
    Receives approved JSON from the UI and saves it as a flat file 
    in the dedicated ChromaDB staging folder.
    """
    question_id = question_data.get("id", f"UNKNOWN_{uuid.uuid4().hex[:8]}")
    file_path = os.path.join(CHROMA_DOCS_DIR, f"{question_id}.json")
    
    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        json.dump(question_data, f, indent=4)
        
    return {"status": "Success", "saved_path": file_path, "id": question_id}

# api.py (Add this endpoint for your scraped JSON batches)
@app.post("/api/enrich-batch")
async def enrich_batch_data(
    payload: dict,  # The deterministic JSON from your scraper
    model: str = "gpt-5.4-mini"
):
    # 1. Ask the LLM ONLY for the metadata tags
    llm_metadata_batch, token_usage = enrich_scraped_json_batch(
        model=model,
        scraped_json_data=payload
    )

    # 2. Guardrail: Ensure LLM returned metadata for every question
    if len(llm_metadata_batch.question_metadata_list) != len(payload.get("questions", [])):
        raise HTTPException(status_code=500, detail="LLM Array Mismatch: The LLM did not return the correct number of metadata objects.")

    # 3. Zip and Merge
    final_batch = payload.copy()
    
    # Setup shared context for SETs
    shared_context_id = None
    if final_batch.get("batch_type") == "SET" and final_batch.get("parent_context"):
        shared_context_id = f"CTX_{uuid.uuid4().hex[:8].upper()}"
        final_batch["parent_context"]["context_id"] = shared_context_id

    # Iterate through the deterministic questions and inject the AI metadata
    for idx, question in enumerate(final_batch["questions"]):
        # Grab the corresponding AI metadata object and convert to dict
        ai_meta = llm_metadata_batch.question_metadata_list[idx].model_dump()
        
        # Merge AI tags directly into the question dictionary
        question.update(ai_meta)
        
        # Inject backend identifiers
        question["id"] = f"Q_{question['subject'].upper()}_{uuid.uuid4().hex[:8].upper()}"
        
        if shared_context_id:
            question["has_parent_context"] = True
            question["parent_context"] = final_batch["parent_context"]
        else:
            question["has_parent_context"] = False

    # 4. Final Safety Check: Validate the merged object against your strict global schema
    try:
        validated_batch = CATExtractionBatch(**final_batch)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Final Schema Validation Failed: {str(e)}")

    return {
        "enriched_batch": validated_batch.model_dump(),
        "usage": {
            "prompt_tokens": token_usage.prompt_tokens,
            "completion_tokens": token_usage.completion_tokens,
            "total_tokens": token_usage.total_tokens
        }
    }