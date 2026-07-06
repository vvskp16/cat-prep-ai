import os
import glob
import json
import shutil
import chromadb
from chromadb.utils import embedding_functions

# --- Configuration ---
# Point this to wherever your finalized/enriched JSON files live
JSON_DIRECTORY = "./chroma_ready_docs/*.json" 
DB_PATH = "./chroma_db"

def flatten_for_chroma(q: dict, batch_type: str) -> dict:
    """
    Exhaustively flattens ALL fields from the enriched JSON into 1D primitives.
    Lists and Dicts are safely converted to JSON strings to bypass ChromaDB's limits.
    """
    flat_meta = {
        "id": q.get("id", ""),
        "batch_type": batch_type,
        "subject": q.get("subject", ""),
        "question_type": q.get("question_type", ""),
        "topic": q.get("topic", ""),
        "sub_topic": q.get("sub_topic", ""),
        "has_parent_context": str(q.get("has_parent_context", False)),
        "question_text": q.get("question_text", ""), # Pure UI Question Text
        "correct_answer": q.get("correct_answer", ""),
        "solution_text": q.get("solution_text", ""),
        
        # Arrays to Strings
        "question_images": json.dumps(q.get("question_images", [])),
        "solution_images": json.dumps(q.get("solution_images", [])),
        "semantic_keywords": json.dumps(q.get("semantic_keywords", [])),
        "original_sources": json.dumps(q.get("original_sources", []))
    }

    # Flatten Options
    if q.get("options"):
        flat_meta["option_A"] = q["options"].get("A", "")
        flat_meta["option_B"] = q["options"].get("B", "")
        flat_meta["option_C"] = q["options"].get("C", "")
        flat_meta["option_D"] = q["options"].get("D", "")

    # Flatten Parent Context
    parent_ctx = q.get("parent_context")
    if parent_ctx:
        flat_meta["context_id"] = parent_ctx.get("context_id", "")
        flat_meta["context_type"] = parent_ctx.get("context_type", "")
        flat_meta["context_body"] = parent_ctx.get("context_body", "")
        flat_meta["context_images"] = json.dumps(parent_ctx.get("context_images", []))

    # Flatten Metadata Hooks
    hooks = q.get("metadata_hooks")
    if hooks:
        flat_meta["trap_type"] = hooks.get("trap_type", "")
        flat_meta["difficulty"] = hooks.get("difficulty", "")
        # ChromaDB supports floats, so we keep this as a number for numerical sorting (e.g., difficulty_level >= 7.5)
        flat_meta["difficulty_level"] = float(hooks.get("difficulty_level", 5.0))
        flat_meta["calculation_intensity"] = hooks.get("calculation_intensity", "")

    # Clean out any empty strings/nulls to keep metadata lean (Optional but good practice)
    return {k: v for k, v in flat_meta.items() if v is not None}

def main():
    # 1. Nuclear Option: Wipe the existing corrupted/outdated ChromaDB
    if os.path.exists(DB_PATH):
        print(f"🧹 Deleting existing ChromaDB directory at {DB_PATH}...")
        shutil.rmtree(DB_PATH)
    
    # 2. Initialize fresh ChromaDB client
    client = chromadb.PersistentClient(path=DB_PATH)
    
    # 3. Setup OpenAI Embedding Function
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENAI_API_KEY environment variable not found.")
        return

    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name="text-embedding-3-small"
    )

    # Create fresh collection
    collection = client.create_collection(
        name="cat_questions",
        embedding_function=openai_ef
    )

    json_files = glob.glob(JSON_DIRECTORY)
    if not json_files:
        print(f"⚠️ No JSON files found in {JSON_DIRECTORY}")
        return

    total_questions = 0

    # 4. Ingestion Loop
    for file_path in json_files:
        print(f"📦 Processing file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            # Handle if the root is an array of batches or a single batch dictionary
            batches = data if isinstance(data, list) else [data]

            for batch in batches:
                batch_type = batch.get("batch_type", "STANDALONE")
                questions = batch.get("questions", [])
                
                ids = []
                documents = []
                metadatas = []

                for q in questions:
                    q_id = q.get("id")
                    if not q_id:
                        continue # Skip invalid questions without IDs
                        
                    # --- The Golden Rule of Embedding ---
                    # --- The Golden Rule of Embedding ---
                    # 1. Grab the Context (if any)
                    context_text = ""
                    if q.get("has_parent_context") and q.get("parent_context"):
                        context_text = q["parent_context"].get("context_body", "")
                        
                    # 2. Grab the AI-Generated Semantic Keywords
                    keywords_list = q.get("semantic_keywords", [])
                    keywords_str = ", ".join(keywords_list) if isinstance(keywords_list, list) else ""
                    
                    # 3. Grab the Trap Type
                    trap = ""
                    if q.get("metadata_hooks"):
                        trap = q["metadata_hooks"].get("trap_type", "")
                        
                    # 4. Build the Ultimate Context-Rich Embedding String
                    # We inject the hidden keywords at the bottom so the Vector Model reads them!
                    combined_embed_text = (
                        f"Context: {context_text}\n\n"
                        f"Question: {q.get('question_text', '')}\n\n"
                        f"Concepts & Keywords: {keywords_str}\n"
                        f"Common Pitfall/Trap: {trap}"
                    ).strip()

                    # Flatten all fields for storage
                    flat_meta = flatten_for_chroma(q, batch_type)

                    ids.append(q_id)
                    documents.append(combined_embed_text)
                    metadatas.append(flat_meta)

                # Batch Upsert into ChromaDB
                if ids:
                    collection.add(
                        ids=ids,
                        documents=documents,
                        metadatas=metadatas
                    )
                    total_questions += len(ids)

    print(f"✅ Success! Ingested {total_questions} fully-enriched questions into fresh ChromaDB.")

if __name__ == "__main__":
    main()