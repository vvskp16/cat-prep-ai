# api.py
import io
import os
from random import shuffle
import uuid
import base64
import json
from datetime import datetime
import aiofiles
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pytesseract
import chromadb
from data_models import CATExtractionBatch, CATUnifiedQuestion, TestGenerationRequest
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

# Initialize ChromaDB client and collection
import chromadb
from chromadb.utils import embedding_functions
import os

# 1. Initialize the OpenAI Embedding Function (Must match ingestion exactly)
openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ.get("OPENAI_API_KEY"),
    model_name="text-embedding-3-small" # Or whatever you used during ingestion
)

# 2. Connect to the local folder
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# 3. Connect to the EXACT SAME collection name
collection = chroma_client.get_or_create_collection(
    name="cat_prep_questions", # MUST MATCH YOUR INGESTION SCRIPT
    embedding_function=openai_ef
)

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
        scraped_json_data=payload,
        base64_images=[]  # Assuming no images for this endpoint
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

@app.post("/api/generate-test")
async def generate_test(req: TestGenerationRequest):
    try:
        # 1. Build the Deterministic Metadata Filter
        conditions = []
        if req.subject:
            conditions.append({"subject": req.subject})
        if req.difficulty:
            conditions.append({"difficulty": req.difficulty})
        if req.topic:
            conditions.append({"topic": req.topic})
        if req.sub_topic:
            conditions.append({"sub_topic": req.sub_topic})
            
        where_clause = None
        if len(conditions) == 1:
            where_clause = conditions[0]
        elif len(conditions) > 1:
            where_clause = {"$and": conditions}

        # 2. Fetch a larger pool from ChromaDB to allow for randomization
        # This is where 'where_clause' is actively used!
        pool_results = collection.get(
            where=where_clause if where_clause else None,
            limit=req.limit * 5
        )
        
        if not pool_results or not pool_results['metadatas']:
            return {"count": 0, "test_questions": [], "time_config": {}}
            
        # 3. Zip and Shuffle the pool
        zipped_pool = list(zip(
            pool_results['ids'], 
            pool_results['metadatas'], 
            pool_results['documents']
        ))
        shuffle(zipped_pool)
        
        # 4. Construct the Final Test Payload
        # This is where 'final_questions' is initialized!
        final_questions = []
        seen_q_ids = set()
        seen_context_ids = set()
        
        for q_id, meta, doc in zipped_pool:
            if len(final_questions) >= req.limit:
                break 
                
            if q_id in seen_q_ids:
                continue
                
            context_id = meta.get("context_id")
            
            if context_id:
                # --- SET HANDLING (DILR / RC) ---
                if context_id in seen_context_ids:
                    continue 
                    
                seen_context_ids.add(context_id)
                
                set_results = collection.get(where={"context_id": context_id})
                
                for sq_id, smeta, sdoc in zip(set_results['ids'], set_results['metadatas'], set_results['documents']):
                    if sq_id not in seen_q_ids:
                        final_questions.append({
                            "id": sq_id,
                            "document": sdoc,
                            "metadata": smeta
                        })
                        seen_q_ids.add(sq_id)
            else:
                # --- STANDALONE HANDLING ---
                final_questions.append({
                    "id": q_id,
                    "document": doc,
                    "metadata": meta
                })
                seen_q_ids.add(q_id)

        # 5. Optional: Sort the final selected questions by difficulty
        if getattr(req, "sort_by_difficulty", False):
            # Sorts using the float value we ingested. Fallback to 5.0 if missing.
            final_questions.sort(key=lambda q: float(q["metadata"].get("difficulty_level", 5.0)))

        return {
            "count": len(final_questions),
            "test_questions": final_questions,
            "time_config": {
                "total_time_minutes": req.time_limit_minutes,
                "time_per_question_seconds": req.time_per_question_seconds
            }
        }
    
        # Return the payload cleanly to the frontend
        return {
            "count": len(final_questions),
            "test_questions": final_questions,
            "time_config": {
                "total_time_minutes": req.time_limit_minutes,
                "time_per_question_seconds": req.time_per_question_seconds
            }
        }

    except Exception as e:
        print(f"Error generating test: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug-db")
async def debug_db():
    try:
        # Get total number of items in the database
        total_count = collection.count()
        
        if total_count == 0:
            return {
                "status": "EMPTY",
                "message": "ChromaDB is completely empty! You need to run your ingestion script."
            }
            
        # If it has data, peek at the very first item to check the exact metadata schema
        sample = collection.peek(1)
        return {
            "status": "HAS_DATA",
            "total_questions_in_db": total_count,
            "sample_metadata": sample['metadatas'][0] if sample['metadatas'] else None
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)