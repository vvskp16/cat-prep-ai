# ingest_extracted_cat_papers.py
import os
import json
import chromadb
from chromadb.utils import embedding_functions
from pathlib import Path

# Config Paths
INPUT_DIR = Path("./chroma_ready_docs")
CHROMA_DB_DIR = Path("./chroma_db")

def flatten_metadata(question: dict, batch_type: str) -> dict:
    """
    ChromaDB metadata requires strictly flat key-value pairs (str, int, float, bool).
    Nested dicts and complex lists are flattened here for vector filtering.
    """
    metadata = {
        "subject": question.get("subject", ""),
        "question_type": question.get("question_type", ""),
        "topic": question.get("topic", ""),
        "sub_topic": question.get("sub_topic", ""),
        "has_parent_context": question.get("has_parent_context", False),
        "batch_type": batch_type,
        "correct_answer": question.get("correct_answer", ""),
    }

    # 1. Flatten Options
    options = question.get("options")
    if options:
        metadata["option_A"] = options.get("A", "")
        metadata["option_B"] = options.get("B", "")
        metadata["option_C"] = options.get("C", "")
        metadata["option_D"] = options.get("D", "")

    # 2. Flatten AI Metadata Hooks
    hooks = question.get("metadata_hooks", {})
    metadata["trap_type"] = hooks.get("trap_type", "")
    metadata["difficulty"] = hooks.get("difficulty", "")
    metadata["difficulty_level"] = float(hooks.get("difficulty_level", 0.0))
    metadata["calculation_intensity"] = hooks.get("calculation_intensity", "")

    # 3. Flatten Parent Context (DILR/RC Sets)
    context = question.get("parent_context")
    if context:
        metadata["context_id"] = context.get("context_id", "")
        metadata["context_type"] = context.get("context_type", "")
        metadata["context_images"] = json.dumps(context.get("context_images", []))

    # 4. Serialize Arrays (Images, Sources, Keywords) into JSON strings
    metadata["semantic_keywords"] = json.dumps(question.get("semantic_keywords", []))
    metadata["question_images"] = json.dumps(question.get("question_images", []))
    metadata["solution_images"] = json.dumps(question.get("solution_images", []))
    metadata["original_sources"] = json.dumps(question.get("original_sources", []))

    # Clean out any accidental None values
    return {k: v for k, v in metadata.items() if v is not None}

def main():
    # 1. Initialize OpenAI Embedding Function (text-embedding-3-small)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENAI_API_KEY environment variable is not set.")
        return

    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=api_key,
        model_name="text-embedding-3-small"
    )

    # 2. Initialize ChromaDB Local Persistent Client
    client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))

    # 3. Create or Get the Vector Collection
    collection = client.get_or_create_collection(
        name="cat_prep_questions",
        embedding_function=openai_ef,
        metadata={"hnsw:space": "cosine"} # Best metric for OpenAI embeddings
    )

    if not INPUT_DIR.exists():
        print(f"❌ Source folder not found: {INPUT_DIR.absolute()}")
        return

    # 4. Ingestion Loop
    for file_path in INPUT_DIR.glob("*.json"):
        print(f"\n📄 Ingesting {file_path.name}...")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle both arrays of batches and single batch files
        batches = data if isinstance(data, list) else [data]

        for batch in batches:
            batch_type = batch.get("batch_type", "STANDALONE")
            
            for q in batch.get("questions", []):
                q_id = q["id"]

                # 5. Build Semantic Vector Document 
                # (Inject passage context into the question so the AI can find it semantically)
                document_text = q.get("question_text", "")
                if q.get("has_parent_context") and q.get("parent_context"):
                    passage = q["parent_context"].get("context_body", "")
                    document_text = f"Context Passage:\n{passage}\n\nQuestion:\n{document_text}"

                # 6. Apply Schema Flattening
                flat_metadata = flatten_metadata(q, batch_type)

                # 7. Upsert to ChromaDB
                try:
                    collection.upsert(
                        ids=[q_id],
                        documents=[document_text],
                        metadatas=[flat_metadata]
                    )
                    print(f"  ✅ Upserted {q_id}")
                except Exception as e:
                    print(f"  ❌ Failed to upsert {q_id}: {e}")

    print("\n🎉 Vector Database ingestion complete!")
    print(f"💾 Database saved to: {CHROMA_DB_DIR.absolute()}")

if __name__ == "__main__":
    main()