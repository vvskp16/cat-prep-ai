import os
import json
import base64
import uuid
import re
import argparse
from pathlib import Path
from ingestion import enrich_scraped_json_batch

SOURCE_JSON_DIR = Path("dev_scripts/extraction/extracted_json")
IMAGE_DIR = Path("cat-frontend/public")
OUTPUT_DIR = Path("chroma_ready_docs")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def process_single_batch(file_name: str, target_batch_idx: int):
    file_path = SOURCE_JSON_DIR / file_name
    
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return

    print(f"\n🎯 Target Acquired: Processing batch {target_batch_idx} inside {file_name}...")
    
    with open(file_path, "r", encoding="utf-8") as f:
        batches = json.load(f)

    if target_batch_idx >= len(batches) or target_batch_idx < 0:
        print(f"❌ Batch index {target_batch_idx} is out of range. File has {len(batches)} batches.")
        return

    batch = batches[target_batch_idx]

    # 1. EXTRACT INLINE MARKDOWN IMAGES
    image_paths = []
    context_body = ""
    if batch.get("parent_context"):
        context_body = batch["parent_context"].get("context_body", "")

    for q in batch.get("questions", []):
        question_text = q.get("question_text", "")
        solution_text = q.get("solution_text", "")
        
        # Combine all text for this question block
        combined_text = f"{context_body}\n{question_text}\n{solution_text}"
        
        # Pluck out the markdown image paths
        found_paths = re.findall(r'!\[.*?\]\((/images/.*?\.png)\)', combined_text)
        image_paths.extend(found_paths)

    # Deduplicate to save LLM tokens
    unique_image_paths = list(set(image_paths))

    # 2. ENCODE TO BASE64 FOR GPT-4o-MINI
    base64_images = []
    for path in unique_image_paths:
        local_path = IMAGE_DIR / path.lstrip("/")
        if local_path.exists():
            with open(local_path, "rb") as img_file:
                base64_images.append(base64.b64encode(img_file.read()).decode("utf-8"))
        else:
            print(f"  ⚠️ Warning: Image not found locally -> {local_path}")

    # 3. Construct the text payload for the LLM
    deterministic_ocr_text = json.dumps(batch, indent=2)

    # 4. Call the LLM with the newly extracted images
    try:
        metadata_payload, _ = enrich_scraped_json_batch("gpt-5.4-mini", batch, base64_images)
        
        if len(metadata_payload.questions) != len(batch.get("questions", [])):
            raise ValueError(f"Array length mismatch. Expected {len(batch.get('questions', []))} but got {len(metadata_payload.questions)}.")
        
        for idx, q_meta in enumerate(metadata_payload.questions):
            batch["questions"][idx]["id"] = f"Q_{q_meta.subject.upper()}_{uuid.uuid4().hex[:8].upper()}"
            batch["questions"][idx]["subject"] = q_meta.subject
            batch["questions"][idx]["topic"] = q_meta.topic
            batch["questions"][idx]["sub_topic"] = q_meta.sub_topic
            batch["questions"][idx]["metadata_hooks"] = q_meta.metadata_hooks.model_dump()
            
            # NEW: Map the image descriptions
            batch["questions"][idx]["image_descriptions"] = q_meta.image_descriptions
            
            # Update the Vector DB combined text to include Image Context
            image_desc_text = " ".join(q_meta.image_descriptions)
            batch["questions"][idx]["combined_embed_text"] = (
                f"{context_body}\n{batch['questions'][idx].get('question_text', '')}\n"
                f"Concepts & Keywords: {', '.join(q_meta.semantic_keywords)}\n"
                f"Image Context: {image_desc_text}\n"
                f"Core Trap: {q_meta.metadata_hooks.trap_type}"
            )
        
        output_file_path = OUTPUT_DIR / f"debug_enriched_{file_name}_batch_{target_batch_idx}.json"
        with open(output_file_path, "w", encoding="utf-8") as f:
            json.dump([batch], f, indent=4)
            
        print(f"✅ Successfully enriched! Saved output to {output_file_path}")
        
    except Exception as e:
        print(f"❌ Enrichment failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich a single specific batch from a JSON file.")
    parser.add_argument("--file", required=True, help="The filename of the JSON file (e.g., cat-2022-slot-1.json)")
    parser.add_argument("--batch", required=True, type=int, help="The index of the batch to process (e.g., 14)")
    
    args = parser.parse_args()
    process_single_batch(args.file, args.batch)