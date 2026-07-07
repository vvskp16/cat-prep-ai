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
# api.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import chromadb

app = FastAPI(title="CAT Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    name="cat_questions", # MUST MATCH YOUR INGESTION SCRIPT
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

# Define the exact structure of the JSON body coming from Next.js
class TestGenRequest(BaseModel):
    subject: Optional[str] = None
    limit: int = 5
    min_difficulty_level: Optional[float] = None
    max_difficulty_level: Optional[float] = None
    topic: Optional[str] = None
    sub_topic: Optional[str] = None
    question_type: Optional[str] = None

# Pass the model into the endpoint
@app.post("/api/generate-test")
async def generate_test(payload: TestGenRequest):
    
    print(f"✅ Successfully received JSON payload: {payload.model_dump()}")
    
    # Build your ChromaDB Where Clause using the payload
    and_conditions = []
    
    if payload.subject:
        and_conditions.append({"subject": {"$eq": payload.subject}})
    if payload.topic:
        and_conditions.append({"topic": {"$eq": payload.topic}})
    if payload.min_difficulty_level is not None:
        and_conditions.append({"difficulty_level": {"$gte": payload.min_difficulty_level}})
    if payload.max_difficulty_level is not None:
        and_conditions.append({"difficulty_level": {"$lte": payload.max_difficulty_level}})

    where_filter = None
    if len(and_conditions) == 1:
        where_filter = and_conditions[0]
    elif len(and_conditions) > 1:
        where_filter = {"$and": and_conditions}

    # Fetch from ChromaDB
    results = collection.get(
        where=where_filter, 
        limit=100
    ) 
    
    if not results or not results.get("ids"):
        return []

    # Process your metadatas...
    questions = results["metadatas"]
    
    # (Optional: Add your sorting logic here)

    # 7. Return exact limited slice to frontend
    return {"questions": questions[:payload.limit]}

@app.get("/api/taxonomy")
async def get_taxonomy(subject: str):
    """
    Dynamically aggregates topics, sub-topics, and traps directly from ChromaDB 
    based on the currently selected subject.
    """
    try:
        # Query ChromaDB for all documents matching the selected subject
        results = collection.get(
            where={"subject": {"$eq": subject}},
            include=["metadatas"]
        )
        
        taxonomy = {}
        traps = set()
        
        # Iterate over all metadata records to build the hierarchy dynamically
        for meta in results.get("metadatas", []):
            if not meta: continue
            
            topic = meta.get("topic")
            sub_topic = meta.get("sub_topic")
            trap = meta.get("trap_type")
            
            # 1. Build the Topic -> Sub-Topic Cascading Dictionary
            if topic and str(topic).strip() and str(topic).lower() != "none":
                if topic not in taxonomy:
                    taxonomy[topic] = set()
                if sub_topic and str(sub_topic).strip() and str(sub_topic).lower() != "none":
                    taxonomy[topic].add(sub_topic)
                    
            # 2. Collect Unique Trap Types
            if trap and str(trap).strip() and str(trap).lower() != "none":
                traps.add(trap)
                
        # Convert Python Sets to sorted Lists so it's JSON serializable
        formatted_taxonomy = {k: sorted(list(v)) for k, v in taxonomy.items()}
        
        return {
            "taxonomy": formatted_taxonomy,
            "traps": sorted(list(traps))
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch taxonomy: {str(e)}")

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

class SearchRequest(BaseModel):
    question_id: Optional[str] = Field(None, description="Unique ID of the question")
    subject: Optional[str] = Field(None, description="Broad subject area (e.g., VARC, QA, DILR)")
    topic: Optional[str] = Field(None, description="High-level topic (e.g., Verbal Ability, Arithmetic)")
    sub_topic: Optional[str] = Field(None, description="Granular classification (e.g., Odd Sentence Out)")
    question_type: Optional[str] = Field(None, description="Format type: MCQ or TITA")
    
    # Qualitative and Quantitative Difficulty Filters
    difficulty: Optional[str] = Field(None, description="Qualitative difficulty level: Easy, Medium, Hard")
    min_difficulty_level: Optional[float] = Field(None, description="Minimum numerical difficulty boundary (inclusive)")
    max_difficulty_level: Optional[float] = Field(None, description="Maximum numerical difficulty boundary (inclusive)")
    
    limit: int = Field(10, description="The targeted base quantity of questions to retrieve")


@app.post("/api/search")
async def search_questions(payload: SearchRequest):
    try:
        client = chromadb.PersistentClient(path="./chroma_db")
        collection = client.get_collection(name="cat_questions")
        
        and_conditions = []
        
        # 1. Standard exact matches
        if payload.question_id:
            and_conditions.append({"id": payload.question_id})
        if payload.subject:
            and_conditions.append({"subject": payload.subject})
        if payload.topic:
            and_conditions.append({"topic": payload.topic})
        if payload.sub_topic:
            and_conditions.append({"sub_topic": payload.sub_topic})
        if payload.question_type:
            and_conditions.append({"question_type": payload.question_type})
        if payload.difficulty:
            and_conditions.append({"difficulty": payload.difficulty})

        # 2. Dynamic Range Queries for numerical difficulty metrics
        if payload.min_difficulty_level is not None:
            and_conditions.append({"difficulty_level": {"$gte": payload.min_difficulty_level}})
        if payload.max_difficulty_level is not None:
            and_conditions.append({"difficulty_level": {"$lte": payload.max_difficulty_level}})

        # Synthesize into ChromaDB's logical dictionary tree structure
        where_filter = None
        if len(and_conditions) == 1:
            where_filter = and_conditions[0]
        elif len(and_conditions) > 1:
            where_filter = {"$and": and_conditions}

        # Execute query against ChromaDB
        results = collection.get(
            where=where_filter,
            limit=100
        )

        if not results or not results.get("ids"):
            return []

        # Parse flattened documents back into rich nested objects
        all_questions = []
        for i in range(len(results["ids"])):
            meta = results["metadatas"][i]
            doc_body = results["documents"][i]
            
            options_dict = None
            if meta.get("question_type") == "MCQ":
                options_dict = {
                    "A": meta.get("option_A", ""),
                    "B": meta.get("option_B", ""),
                    "C": meta.get("option_C", ""),
                    "D": meta.get("option_D", "")
                }

            parent_context = None
            if str(meta.get("has_parent_context")).lower() == "true":
                parent_context = {
                    "context_id": meta.get("context_id", ""),
                    "context_type": meta.get("context_type", "passage"),
                    "context_body": meta.get("context_body", ""),
                    "context_images": json.loads(meta.get("context_images", "[]"))
                }

            question_images = json.loads(meta.get("question_images", "[]"))
            solution_images = json.loads(meta.get("solution_images", "[]"))
            original_sources = json.loads(meta.get("original_sources", "[]"))
            semantic_keywords = json.loads(meta.get("semantic_keywords", "[]"))

            q_obj = {
                "id": results["ids"][i],
                "subject": meta.get("subject"),
                "question_type": meta.get("question_type"),
                "topic": meta.get("topic"),
                "sub_topic": meta.get("sub_topic"),
                "has_parent_context": str(meta.get("has_parent_context")).lower() == "true",
                "parent_context": parent_context,
                "question_text": meta.get("question_text", doc_body), 
                "question_images": question_images,
                "options": options_dict,
                "correct_answer": meta.get("correct_answer", ""),
                "solution_text": meta.get("solution_text", ""),
                "solution_images": solution_images,
                "original_sources": original_sources,
                "semantic_keywords": semantic_keywords,
                "metadata_hooks": {
                    "trap_type": meta.get("trap_type", ""),
                    "difficulty": meta.get("difficulty", "Medium"),
                    "difficulty_level": float(meta.get("difficulty_level", 5.0)),
                    "calculation_intensity": meta.get("calculation_intensity", "Medium")
                }
            }
            all_questions.append(q_obj)

        # Caselet Protection Strategy
        selected_questions = []
        seen_context_ids = set()
        
        base_pool = all_questions[:payload.limit]
        
        for q in base_pool:
            if q["has_parent_context"] and q["parent_context"]:
                seen_context_ids.add(q["parent_context"]["context_id"])

        for q in all_questions:
            if q["has_parent_context"] and q["parent_context"]:
                if q["parent_context"]["context_id"] in seen_context_ids:
                    if q not in selected_questions:
                        selected_questions.append(q)
            else:
                if len(selected_questions) < payload.limit and q not in selected_questions:
                    selected_questions.append(q)

        return selected_questions

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Engine retrieval error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
