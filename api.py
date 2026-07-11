# api.py
import io
import os
from random import shuffle
import random
import uuid
import base64
import json
from datetime import datetime
import aiofiles
from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import openai
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

import re

@app.post("/api/approve")
async def approve_and_save_document(question_data: dict):
    """
    Receives approved JSON from the UI, injects image descriptions inline, 
    builds the embedding text, and saves it to the staging folder.
    """
    question_id = question_data.get("id", f"UNKNOWN_{uuid.uuid4().hex[:8]}")
    
    # 1. Extract context and set up iterator
    context_body = ""
    if question_data.get("has_parent_context") and question_data.get("parent_context"):
        context_body = question_data["parent_context"].get("context_body", "")

    desc_list = list(question_data.get("image_descriptions", []))
    
    def truncate_desc(text: str, max_words: int = 50) -> str:
        return " ".join(str(text).split()[:max_words]).strip()

    it = iter(desc_list)
    consumed = 0

    def inject_description(match):
        nonlocal consumed
        try:
            d = next(it)
            consumed += 1
            return f"[Image Description: {truncate_desc(d)}]"
        except StopIteration:
            return "[Image]"

    # 2. Combine text and run inline replacement
    raw_text = f"Context: {context_body}\nQuestion: {question_data.get('question_text', '')}"
    inline_text = re.sub(r"!\[.*?\]\([^)]+\)", inject_description, raw_text)

    # 3. Append leftovers (if the LLM output more descriptions than markdown tags)
    if consumed < len(desc_list):
        leftover = " ".join(f"[Image Description: {truncate_desc(d)}]" for d in desc_list[consumed:])
        inline_text = f"{inline_text}\n\n{leftover}"

    # 4. Build the final embedding string
    semantic_kw = ", ".join(question_data.get("semantic_keywords", []))
    trap = question_data.get("metadata_hooks", {}).get("trap_type", "")
    
    question_data["combined_embed_text"] = (
        f"Subject: {question_data.get('subject', '')}\n"
        f"Topic: {question_data.get('topic', '')}\n"
        f"Sub Topic: {question_data.get('sub_topic', '')}\n"
        f"{inline_text}\n\n"
        f"Concepts & Keywords: {semantic_kw}\n"
        f"Core Trap: {trap}"
    ).strip()

    # 5. Purge the obsolete array
    if "image_descriptions" in question_data:
        del question_data["image_descriptions"]

    # 6. Save the finalized schema
    file_path = os.path.join(CHROMA_DOCS_DIR, f"{question_id}.json")
    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(question_data, indent=4))
        
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
    sort: Optional[str] = "random" # Added explicit support for sorting

@app.post("/api/generate-test")
async def generate_test(payload: TestGenRequest):
    print(f"✅ Successfully received JSON payload: {payload.model_dump()}")
    
    # 1. Build your ChromaDB Where Clause
    and_conditions = []
    if payload.subject: and_conditions.append({"subject": {"$eq": payload.subject}})
    if payload.topic: and_conditions.append({"topic": {"$eq": payload.topic}})
    if payload.sub_topic: and_conditions.append({"sub_topic": {"$eq": payload.sub_topic}})
    if payload.min_difficulty_level is not None: and_conditions.append({"difficulty_level": {"$gte": payload.min_difficulty_level}})
    if payload.max_difficulty_level is not None: and_conditions.append({"difficulty_level": {"$lte": payload.max_difficulty_level}})
    if payload.question_type: and_conditions.append({"question_type": {"$eq": payload.question_type}})

    where_filter = None
    if len(and_conditions) == 1: where_filter = and_conditions[0]
    elif len(and_conditions) > 1: where_filter = {"$and": and_conditions}

    # Fetch a larger pool to allow sorting and intelligent set-expansion
    results = collection.get(where=where_filter, limit=200)
    
    if not results or not results.get("ids"):
        return {"questions": []}

    # 2. Helper function to parse ChromaDB metadata into your JSON schema
    def parse_meta(meta, doc_id, doc_body=""):
        options_dict = None
        if meta.get("question_type") == "MCQ":
            options_dict = {
                "A": meta.get("option_A", ""), "B": meta.get("option_B", ""),
                "C": meta.get("option_C", ""), "D": meta.get("option_D", "")
            }
            
        parent_context = None
        if str(meta.get("has_parent_context")).lower() == "true":
            parent_context = {
                "context_id": meta.get("context_id", ""),
                "context_type": meta.get("context_type", "passage"),
                "context_body": meta.get("context_body", "")
            }

        try:
            original_sources = json.loads(meta.get("original_sources", "[]")) if meta.get("original_sources") else []
        except Exception:
            original_sources = []

        return {
            "id": doc_id,
            "subject": meta.get("subject"),
            "question_type": meta.get("question_type"),
            "topic": meta.get("topic"),
            "sub_topic": meta.get("sub_topic"),
            "has_parent_context": str(meta.get("has_parent_context")).lower() == "true",
            "parent_context": parent_context,
            "question_text": meta.get("question_text", doc_body),
            "options": options_dict,
            "correct_answer": meta.get("correct_answer", ""),
            "solution_text": meta.get("solution_text", ""),
            "original_sources": original_sources,
            "metadata_hooks": {
                "trap_type": meta.get("trap_type", ""),
                "difficulty": meta.get("difficulty", "Medium"),
                "difficulty_level": float(meta.get("difficulty_level", 5.0)),
                "calculation_intensity": meta.get("calculation_intensity", "Medium")
            }
        }

    # 3. Parse and Sort the Initial Pool
    all_parsed = []
    for idx, meta in enumerate(results["metadatas"]):
        all_parsed.append(parse_meta(meta, results["ids"][idx], results["documents"][idx] if results.get("documents") else ""))
        
    # Apply user-requested sorting
    if payload.sort == "difficulty_asc":
        all_parsed.sort(key=lambda x: x["metadata_hooks"]["difficulty_level"])
    elif payload.sort == "difficulty_desc":
        all_parsed.sort(key=lambda x: x["metadata_hooks"]["difficulty_level"], reverse=True)
    else:
        random.shuffle(all_parsed) # Default random behavior
        
    # 4. Intelligent Set Expansion & Truncation
    final_questions = []
    added_ids = set()
    
    for q in all_parsed:
        # Enforce payload limit. 
        # (If the limit is 5 and we add a set of 4, we'll hit 6, which is desired. We break on the *next* iteration).
        if len(final_questions) >= payload.limit:
            break
            
        if q["id"] in added_ids:
            continue
            
        if q.get("has_parent_context") and q.get("parent_context"):
            # 🚀 CORE FIX: Fetch ALL siblings for the set explicitly, bypassing the previous filters
            ctx_id = q["parent_context"]["context_id"]
            siblings_results = collection.get(where={"context_id": {"$eq": ctx_id}})
            
            if siblings_results and siblings_results.get("ids"):
                siblings_parsed = []
                for s_idx, s_meta in enumerate(siblings_results["metadatas"]):
                    siblings_parsed.append(parse_meta(s_meta, siblings_results["ids"][s_idx], siblings_results["documents"][s_idx] if siblings_results.get("documents") else ""))
                    
                # Sort siblings chronologically by ID to maintain correct reading order
                siblings_parsed.sort(key=lambda x: x["id"])
                
                for sibling in siblings_parsed:
                    if sibling["id"] not in added_ids:
                        final_questions.append(sibling)
                        added_ids.add(sibling["id"])
        else:
            # It's a standard standalone question
            final_questions.append(q)
            added_ids.add(q["id"])
            
    return {"questions": final_questions}

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
    
    has_parent_context: Optional[str] = Field(None, description="Filter for questions that are part of a set/passage")

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
        if payload.has_parent_context is not None:
            and_conditions.append({"has_parent_context": payload.has_parent_context})
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
                    "context_body": meta.get("context_body", "")
                }

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
                "options": options_dict,
                "correct_answer": meta.get("correct_answer", ""),
                "solution_text": meta.get("solution_text", ""),
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
        # --- CONTIGUOUS CASELET PROTECTION STRATEGY ---
        base_pool = all_questions[:payload.limit]
        
        # 1. Identify Target Contexts in Order
        target_context_ids = []
        for q in base_pool:
            if q.get("has_parent_context") and q.get("parent_context"):
                ctx_id = q["parent_context"]["context_id"]
                if ctx_id not in target_context_ids:
                    target_context_ids.append(ctx_id)

        final_questions = []
        added_ids = set()

        # Step A: Append all sets contiguously (Groups siblings perfectly)
        for ctx_id in target_context_ids:
            for q in all_questions:
                if q.get("has_parent_context") and q.get("parent_context"):
                    if q["parent_context"]["context_id"] == ctx_id:
                        if q["id"] not in added_ids:
                            final_questions.append(q)
                            added_ids.add(q["id"])

        # Step B: Append the standalone questions from the base pool
        for q in base_pool:
            if not q.get("has_parent_context"):
                if q["id"] not in added_ids:
                    final_questions.append(q)
                    added_ids.add(q["id"])

        return final_questions

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Engine retrieval error: {str(e)}")

from pydantic import BaseModel
from typing import Optional

class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 10

# Initialize standard OpenAI client if not already done globally
openai_client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def expand_search_query(user_query: str) -> str:
    """Uses LLM to expand abbreviations using CAT taxonomy, preventing literal noun hallucination."""
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system", 
                    "content": (
                        "You are a search query optimizer for a CAT exam database. "
                        "Translate student shorthand into precise mathematical or logical concepts. "
                        "Context mappings: 'P&C' -> 'Permutation and Combination', 'TSD' -> 'Time Speed Distance'. "
                        "CRITICAL RULE: If the user searches for a literal object, person, or specific noun "
                        "(e.g., 'sunglass', 'train', 'Ramesh', 'apples'), DO NOT append broad academic "
                        "disciplines like 'geometry', 'optics', or 'physics'. Preserve their literal intent "
                        "and only expand actual mathematical abbreviations. Return ONLY the optimized query string."
                    )
                },
                {"role": "user", "content": user_query}
            ],
            temperature=0.0, # Dropped to 0 for maximum determinism
            max_tokens=50
        )
        expanded_text = response.choices[0].message.content.strip()
        # If the LLM just returns the same word, don't duplicate it
        if expanded_text.lower() == user_query.lower():
            return user_query
            
        return f"{user_query} {expanded_text}"
    except Exception as e:
        print(f"⚠️ Query expansion failed: {e}")
        return user_query


# 2. SIMPLIFIED SEARCH ENDPOINT
@app.post("/api/semantic-search")
async def semantic_search(request: SemanticSearchRequest):
    if not collection:
        raise HTTPException(status_code=500, detail="ChromaDB collection not initialized.")
    
    try:
        optimized_query = expand_search_query(request.query)
        print(f"🔍 Optimized Query: {optimized_query}")

        results = collection.query(
            query_texts=[optimized_query],
            n_results=request.limit,
            include=["metadatas", "distances"]
        )

        if not results["metadatas"] or not results["metadatas"][0]:
            return {"questions": []}

        distances = results["distances"][0]
        metadatas = results["metadatas"][0]
        
        valid_metadatas = []
        context_ids = set()

        # A safe, static ceiling. 0.85 is generous enough to catch expanded queries.
        MAX_DISTANCE_CEILING = 0.85 

        for i in range(len(distances)):
            dist = distances[i]
            meta = metadatas[i]

            # We ONLY use the hard ceiling now. No more dynamic gap drops.
            if dist > MAX_DISTANCE_CEILING:
                print(f"🚫 Cutoff Reached at {dist:.3f}")
                break 

            valid_metadatas.append(meta)
            
            if meta.get("has_parent_context") == "True" and meta.get("context_id"):
                context_ids.add(meta.get("context_id"))

        if not valid_metadatas:
            return {"questions": []}

        # Fetch siblings for Sets
        sibling_metadatas = []
        if context_ids:
            siblings = collection.get(where={"context_id": {"$in": list(context_ids)}})
            if siblings and siblings.get("metadatas"):
                sibling_metadatas = siblings["metadatas"]

        siblings_by_context = {}
        for sibling in sibling_metadatas:
            cid = sibling.get("context_id")
            if cid not in siblings_by_context:
                siblings_by_context[cid] = []
            siblings_by_context[cid].append(sibling)

        # RELEVANCE SORTING: Build the final list while strictly maintaining ChromaDB's order
        final_ordered_metadatas = []
        seen_ids = set()

        for meta in valid_metadatas:
            if meta["id"] in seen_ids:
                continue
                
            # 1. Add the highly relevant match
            final_ordered_metadatas.append(meta)
            seen_ids.add(meta["id"])

            # 2. Immediately append its siblings to keep the Set contiguous in the UI
            cid = meta.get("context_id")
            if meta.get("has_parent_context") == "True" and cid in siblings_by_context:
                sorted_siblings = sorted(siblings_by_context[cid], key=lambda x: x["id"])
                for sibling in sorted_siblings:
                    if sibling["id"] not in seen_ids:
                        final_ordered_metadatas.append(sibling)
                        seen_ids.add(sibling["id"])

        # Un-flatten back into frontend schema
        formatted_results = []
        for meta in final_ordered_metadatas:
            question_obj = {
                "id": meta.get("id"),
                "subject": meta.get("subject"),
                "question_type": meta.get("question_type"),
                "topic": meta.get("topic"),
                "sub_topic": meta.get("sub_topic"),
                "has_parent_context": meta.get("has_parent_context") == "True",
                "question_text": meta.get("question_text"),
                "correct_answer": meta.get("correct_answer"),
                "solution_text": meta.get("solution_text"),
                "semantic_keywords": json.loads(meta.get("semantic_keywords", "[]")),
                "original_sources": json.loads(meta.get("original_sources", "[]"))
            }

            if "option_A" in meta:
                question_obj["options"] = {
                    "A": meta.get("option_A"), "B": meta.get("option_B"), 
                    "C": meta.get("option_C"), "D": meta.get("option_D")
                }
            else:
                question_obj["options"] = None

            if question_obj["has_parent_context"]:
                question_obj["parent_context"] = {
                    "context_id": meta.get("context_id"), 
                    "context_type": meta.get("context_type"), 
                    "context_body": meta.get("context_body")
                }
            else:
                question_obj["parent_context"] = None
                
            question_obj["metadata_hooks"] = {
                "trap_type": meta.get("trap_type"), "difficulty": meta.get("difficulty"),
                "difficulty_level": float(meta.get("difficulty_level", 5.0)), 
                "calculation_intensity": meta.get("calculation_intensity")
            }

            formatted_results.append(question_obj)

        return {"questions": formatted_results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/api/question/{question_id}")
async def get_single_question(question_id: str):
    """Fetches a single standalone question by its exact ID."""
    if not collection:
        raise HTTPException(status_code=500, detail="ChromaDB collection not initialized.")
    
    try:
        results = collection.get(ids=[question_id])
        if not results["metadatas"]:
            return {"questions": []}
            
        meta = results["metadatas"][0]
        question_obj = {
            "id": meta.get("id"),
            "subject": meta.get("subject"),
            "question_type": meta.get("question_type"),
            "topic": meta.get("topic"),
            "sub_topic": meta.get("sub_topic"),
            "has_parent_context": meta.get("has_parent_context") == "True",
            "question_text": meta.get("question_text"),
            "correct_answer": meta.get("correct_answer"),
            "solution_text": meta.get("solution_text"),
            "semantic_keywords": json.loads(meta.get("semantic_keywords", "[]")),
            "original_sources": json.loads(meta.get("original_sources", "[]")),
            "metadata_hooks": {
                "trap_type": meta.get("trap_type"), "difficulty": meta.get("difficulty"),
                "difficulty_level": float(meta.get("difficulty_level", 5.0)), "calculation_intensity": meta.get("calculation_intensity")
            }
        }
        
        if "option_A" in meta:
            question_obj["options"] = {"A": meta.get("option_A"), "B": meta.get("option_B"), "C": meta.get("option_C"), "D": meta.get("option_D")}
        else:
            question_obj["options"] = None

        if question_obj["has_parent_context"]:
            question_obj["parent_context"] = {"context_id": meta.get("context_id"), "context_type": meta.get("context_type"), "context_body": meta.get("context_body")}
        else:
            question_obj["parent_context"] = None
            
        # Wrap in array so ExamEngine can map it normally
        return {"questions": [question_obj]}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch question: {str(e)}")

@app.get("/api/set/{context_id}")
async def get_full_set(context_id: str):
    if not collection:
        raise HTTPException(status_code=500, detail="ChromaDB collection not initialized.")
    
    try:
        # Deterministic metadata lookup (No vector search needed)
        results = collection.get(
            where={"context_id": context_id}
        )

        formatted_results = []
        if not results["metadatas"]:
            return {"questions": []}

        # Un-flatten the ChromaDB metadata back into our nested frontend schema
        for meta in results["metadatas"]:
            question_obj = {
                "id": meta.get("id"),
                "subject": meta.get("subject"),
                "question_type": meta.get("question_type"),
                "topic": meta.get("topic"),
                "sub_topic": meta.get("sub_topic"),
                "has_parent_context": meta.get("has_parent_context") == "True",
                "question_text": meta.get("question_text"),
                "correct_answer": meta.get("correct_answer"),
                "solution_text": meta.get("solution_text"),
                "semantic_keywords": json.loads(meta.get("semantic_keywords", "[]")),
                "original_sources": json.loads(meta.get("original_sources", "[]"))
            }

            # Reconstruct Options 
            if "option_A" in meta:
                question_obj["options"] = {
                    "A": meta.get("option_A"),
                    "B": meta.get("option_B"),
                    "C": meta.get("option_C"),
                    "D": meta.get("option_D")
                }
            else:
                question_obj["options"] = None

            # Reconstruct Parent Context
            if question_obj["has_parent_context"]:
                question_obj["parent_context"] = {
                    "context_id": meta.get("context_id"),
                    "context_type": meta.get("context_type"),
                    "context_body": meta.get("context_body")
                }
                
            # Reconstruct Metadata Hooks
            question_obj["metadata_hooks"] = {
                "trap_type": meta.get("trap_type"),
                "difficulty": meta.get("difficulty"),
                "difficulty_level": float(meta.get("difficulty_level", 5.0)),
                "calculation_intensity": meta.get("calculation_intensity")
            }

            formatted_results.append(question_obj)

        # Sort by ID to ensure questions appear in their original sequential order
        formatted_results.sort(key=lambda x: x["id"])

        return {"questions": formatted_results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch set: {str(e)}")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question_context: Dict[str, Any]
    messages: List[ChatMessage]
    model: str = "gpt-5.4-mini"

# Helper function to convert local images to Base64
def encode_image_to_base64(image_path: str):
    try:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    except Exception as e:
        print(f"Vision Error: Could not read image at {image_path}: {e}")
        return None

@app.post("/api/chat")
async def ai_tutor_chat(request: ChatRequest):
    try:
        # 1. Prepare the System Prompt
        context_str = json.dumps(request.question_context, indent=2)
        system_instruction = (
                "You are an elite CAT Prep AI Tutor. You are helping a student review a specific exam question.\n\n"
                "### YOUR INSTRUCTIONAL FRAMEWORK ###\n"
                "1. NEVER dump a massive wall of text or the entire solution at once.\n"
                "2. Be concise. Keep your responses under 100 words unless the student explicitly asks for a detailed breakdown.\n"
                "3. Focus ONLY on the specific conceptual roadblock the student is facing right now.\n"
                "4. SOCRATIC RULE: Always end your response with a short, targeted question that forces the student to take the next logical step themselves. Never do all the work for them.\n\n"
                "Below is the exact JSON context of the question (including the passage, question text, options, and official solution). Use this as your absolute source of truth. Do not hallucinate external numbers.\n\n"
                f"### QUESTION CONTEXT ###\n{context_str}"
            )

        openai_messages = [{"role": "system", "content": system_instruction}]
        
        # Add chat history
        for msg in request.messages:
            openai_messages.append({"role": msg.role, "content": msg.content})

        # --- THE MAGIC: VISION INTEGRATION ---
        # 2. Extract all markdown image paths from the question context
        image_paths = re.findall(r'!\[.*?\]\((/images/[^\)]+)\)', context_str)
        
        # Also check your unified schema's local_image_paths array just in case
        if "local_image_paths" in request.question_context:
            for path in request.question_context["local_image_paths"]:
                if path not in image_paths:
                    image_paths.append(path)

        # 3. If images exist, attach them to the LAST user message so the AI can "see" them
        if image_paths and len(openai_messages) > 1:
            last_user_msg_text = openai_messages[-1]["content"]
            
            # Convert the last user message from a String to a Multi-Modal Array
            multimodal_content = [{"type": "text", "text": last_user_msg_text}]
            
            # Resolve the path to your Next.js public directory
            frontend_public_dir = os.path.join(os.path.dirname(__file__), "cat-frontend", "public")
            
            for img_path in set(image_paths): # Use set to avoid duplicates
                clean_path = img_path.split("?")[0] # strip query params if any
                full_local_path = os.path.join(frontend_public_dir, clean_path.lstrip("/"))
                
                base64_image = encode_image_to_base64(full_local_path)
                if base64_image:
                    multimodal_content.append({
                        "type": "image_url",
                        "image_url": {
                            # Using jpeg/png dynamically based on standard web usage
                            "url": f"data:image/png;base64,{base64_image}" 
                        }
                    })
            
            # Override the text-only content with our new Vision-enabled content
            openai_messages[-1]["content"] = multimodal_content

        # 4. Call the LLM
        model_to_use = request.model
        if model_to_use not in ["gpt-5.4-mini", "gpt-4o", "o1-mini"]:
            model_to_use = "gpt-5.4-mini"
            
        completion = openai_client.chat.completions.create(
            model=model_to_use,
            messages=openai_messages,
        )

        reply_text = completion.choices[0].message.content

        return {"reply": reply_text}

    except Exception as e:
        print(f"Chat Error: {e}")
        return {"reply": f"System error: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
