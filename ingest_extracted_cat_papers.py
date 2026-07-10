import os
import glob
import json
import shutil
import sys
import time
import chromadb
from chromadb.utils import embedding_functions
import openai

# --- Configuration ---
# Point this to wherever your finalized/enriched JSON files live
JSON_DIRECTORY = "./chroma_ready_docs/*.json" 
DB_PATH = "./chroma_db"

# Pricing configuration for embeddings
EMBEDDING_MODEL = "text-embedding-3-small"
COST_PER_1M_TOKENS = 0.020  # $0.020 per 1 million tokens

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
    if os.path.exists(DB_PATH):
        choice = input(f"\n⚠️ Existing ChromaDB found at {DB_PATH}.\n"
                    "Wipe database? [y/N]: ").strip().lower()

        if choice == 'y':
            print(f"🚨 DANGER: Wiping database in 5 seconds...")
            print("   Press Ctrl+C immediately to ABORT the process.")
            
            try:
                # 5-second visual countdown
                for i in range(5, 0, -1):
                    print(f"   Deleting in {i}...", end="\r")
                    time.sleep(1)
                
                print("\n🧹 Deleting existing ChromaDB directory...")
                shutil.rmtree(DB_PATH)
                print("✅ Database successfully wiped.")
                
            except KeyboardInterrupt:
                print("\n\n🛑 ABORTED: Deletion cancelled. Skipping ingestion.")
                sys.exit(0) # Stops the script so you don't accidentally run ingestion on a half-wiped state
        else:
            print("⏭️ Skipping deletion. Proceeding to append to existing database.\n")
    
    # 2. Initialize fresh ChromaDB client
    client = chromadb.PersistentClient(path=DB_PATH)
    
    # 3. Setup OpenAI API and Embedding Function
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENAI_API_KEY environment variable not found.")
        return

    # Standard OpenAI client for explicit embedding calls (so we can get token counts)
    openai_client = openai.OpenAI(api_key=api_key)

    # We still attach the ChromaDB OpenAIEmbeddingFunction to the collection 
    # so that it knows how to embed natural language *queries* in the future natively.
    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name=EMBEDDING_MODEL
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
    total_pipeline_tokens = 0
    total_pipeline_cost = 0.0

    print("🚀 Starting Semantic Embedding & Ingestion Pipeline...")

    # 4. Ingestion Loop
    for file_path in json_files:
        print(f"\n📦 Processing file: {os.path.basename(file_path)}")
        file_tokens = 0
        file_cost = 0.0

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            # Handle if the root is an array of batches or a single batch dictionary
            batches = data if isinstance(data, list) else [data]

            for idx, batch in enumerate(batches):
                batch_type = batch.get("batch_type", "STANDALONE")
                questions = batch.get("questions", [])
                
                ids = []
                documents = []
                metadatas = []

                for q in questions:
                    q_id = q.get("id")
                    if not q_id:
                        continue # Skip invalid questions without IDs
                        
                    combined_embed_text = q.get("combined_embed_text", "")

                    if not combined_embed_text:
                        print(f"⚠️ Warning: Missing combined_embed_text for {q_id}")
                        continue

                    flat_meta = flatten_for_chroma(q, batch_type)

                    ids.append(q_id)
                    documents.append(combined_embed_text)
                    metadatas.append(flat_meta)

                # Batch Upsert into ChromaDB
                if ids:
                    try:
                        # explicitly request embeddings to get token usage metadata
                        response = openai_client.embeddings.create(
                            input=documents,
                            model=EMBEDDING_MODEL
                        )
                        
                        # Extract the vectors and cost data
                        embeddings = [data.embedding for data in response.data]
                        tokens_used = response.usage.total_tokens
                        batch_cost = (tokens_used / 1_000_000) * COST_PER_1M_TOKENS
                        
                        # Tally counts
                        file_tokens += tokens_used
                        file_cost += batch_cost
                        total_pipeline_tokens += tokens_used
                        total_pipeline_cost += batch_cost
                        total_questions += len(ids)

                        # Provide the explicit embeddings to ChromaDB
                        collection.add(
                            ids=ids,
                            embeddings=embeddings, # <--- By passing this, Chroma skips its own API call
                            documents=documents,
                            metadatas=metadatas
                        )
                        
                        print(f"    ↳ Batch {idx + 1}/{len(batches)} Ingested: {len(ids)} questions | Tokens: {tokens_used} | Cost: ${batch_cost:.6f}")
                    
                    except Exception as e:
                        print(f"    ❌ Error generating embeddings for Batch {idx + 1}: {e}")

        print(f"  🏁 File Summary | Tokens: {file_tokens} | Cost: ${file_cost:.6f}")

    print("\n" + "="*50)
    print(f"✅ Success! Ingested {total_questions} fully-enriched questions into fresh ChromaDB.")
    print(f"📊 Total Pipeline Tokens: {total_pipeline_tokens}")
    print(f"💰 Total Pipeline Cost:   ${total_pipeline_cost:.6f}")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()