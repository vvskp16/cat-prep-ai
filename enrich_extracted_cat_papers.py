# batch_enricher.py
import os
import json
import base64
import uuid
from pathlib import Path
from data_models import CATExtractionBatch
from ingestion import enrich_scraped_json_batch

# Directory Configurations
SOURCE_JSON_DIR = Path("./dev_scripts/extraction/extracted_json")
IMAGE_DIR = Path("./cat-frontend/public")
OUTPUT_DIR = Path("./chroma_ready_docs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_RETRIES = 3

def encode_image_to_base64(image_path: Path) -> str:
    try:
        if image_path.exists():
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode('utf-8')
    except Exception as e:
        print(f"⚠️ Failed to encode image {image_path}: {e}")
    return None

def process_local_batch(file_path: Path, model: str = "gpt-4o-mini"):
    print(f"\n📂 Processing File: {file_path.name}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    is_list = isinstance(payload, list)
    batches_to_process = payload if is_list else [payload]
    enriched_batches = []

    for batch_idx, batch in enumerate(batches_to_process):
        base64_images = []

        # Gather Parent Context Images
        if batch.get("parent_context") and "context_images" in batch["parent_context"]:
            for img_rel_path in batch["parent_context"]["context_images"]:
                full_path = IMAGE_DIR / img_rel_path.lstrip("/")
                b64 = encode_image_to_base64(full_path)
                if b64: base64_images.append(b64)

        # Gather Question Specific Images
        for q in batch.get("questions", []):
            for img_rel_path in q.get("question_images", []):
                full_path = IMAGE_DIR / img_rel_path.lstrip("/")
                b64 = encode_image_to_base64(full_path)
                if b64: base64_images.append(b64)

        # --- RETRY LOOP INTEGRATION ---
        llm_metadata = None
        usage = None
        target_q_count = len(batch.get("questions", []))
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                print(f"📡 Querying LLM for Batch {batch_idx} (Attempt {attempt}/{MAX_RETRIES})...")
                llm_metadata, usage = enrich_scraped_json_batch(
                    model=model,
                    scraped_json_data=batch,
                    base64_images=base64_images
                )
                
                # Check sequence length matching guardrail
                if len(llm_metadata.question_metadata_list) == target_q_count:
                    break  # Valid length matched, break retry loop!
                else:
                    print(f"⚠️ Attempt {attempt} Mismatch: Expected {target_q_count} blocks, got {len(llm_metadata.question_metadata_list)}.")
                    llm_metadata = None  # Reset state
            except Exception as e:
                print(f"⚠️ Attempt {attempt} Error: {e}")
                llm_metadata = None

        if not llm_metadata:
            print(f"❌ Batch {batch_idx} of {file_path.name} failed after {MAX_RETRIES} attempts. Skipping.")
            continue

        # --- Zip & Merge Layer ---
        shared_context_id = None
        if batch.get("batch_type") == "SET" and batch.get("parent_context"):
            shared_context_id = f"CTX_{uuid.uuid4().hex[:8].upper()}"
            batch["parent_context"]["context_id"] = shared_context_id

        for idx, question in enumerate(batch["questions"]):
            ai_tags = llm_metadata.question_metadata_list[idx].model_dump()
            question.update(ai_tags)

            question["id"] = f"Q_{question['subject'].upper()}_{uuid.uuid4().hex[:8].upper()}"
            question["question_type"] = "MCQ" if question.get("options") else "TITA"
            
            if shared_context_id:
                question["has_parent_context"] = True
                question["parent_context"] = batch["parent_context"]
            else:
                question["has_parent_context"] = False
                question["parent_context"] = None

        # Schema Verification Shield
        try:
            validated_batch = CATExtractionBatch(**batch)
            enriched_batches.append(validated_batch.model_dump())
            print(f"✅ Batch {batch_idx} compiled flawlessly. Tokens: {usage.total_tokens}")
        except Exception as schema_error:
            print(f"❌ Final Validation Dropped on batch {batch_idx}: {schema_error}")

    if enriched_batches:
        output_file_path = OUTPUT_DIR / f"enriched_{file_path.name}"
        with open(output_file_path, "w", encoding="utf-8") as out_f:
            json.dump(enriched_batches if is_list else enriched_batches[0], out_f, indent=2, ensure_ascii=False)
        print(f"💾 Stored dataset to: {output_file_path}")

def run_pipeline():
    print("🚀 Initializing Batch Processing Pipeline...")
    json_files = list(SOURCE_JSON_DIR.glob("*.json"))
    for file_path in json_files:
        process_local_batch(file_path)
    print("\n🏁 Process Completed!")

if __name__ == "__main__":
    run_pipeline()