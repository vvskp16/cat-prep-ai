import os
import json
import base64
import uuid
import re
from pathlib import Path
from ingestion import enrich_scraped_json_batch

# Directory Configurations
SOURCE_JSON_DIR = Path("dev_scripts/extraction/extracted_json")
IMAGE_DIR = Path("cat-frontend/public")
OUTPUT_DIR = Path("chroma_ready_docs")

os.makedirs(OUTPUT_DIR, exist_ok=True)

def process_all_files():
    json_files = list(SOURCE_JSON_DIR.glob("*.json"))
    print(f"Found {len(json_files)} files to process.")

    for file_path in json_files:
        print(f"\nProcessing {file_path.name}...")
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                batches = json.load(f)
        except Exception as e:
            print(f"  ❌ Failed to read {file_path.name}: {e}")
            continue

        output_data = []

        for batch_idx, batch in enumerate(batches):
            print(f"  -> Batch {batch_idx + 1}/{len(batches)}")
            
            # 1. EXTRACT INLINE MARKDOWN IMAGES
            image_paths = []
            context_body = ""
            if batch.get("parent_context"):
                context_body = batch["parent_context"].get("context_body", "")

            for q in batch.get("questions", []):
                question_text = q.get("question_text", "")
                solution_text = q.get("solution_text", "")
                
                # Combine all text for this question block
                combined_text = f"{context_body}\n{question_text}"
                
                # Pluck out the markdown image paths
                found_paths = re.findall(r'!\[.*?\]\((/images/.*?\.png)\)', combined_text)
                image_paths.extend(found_paths)

            # Deduplicate to save LLM tokens
            unique_image_paths = list(set(image_paths))

            # 2. ENCODE TO BASE64 FOR GPT-4o-MINI
            base64_images = []
            for path in unique_image_paths:
                # Resolve the relative URL to your local filesystem
                local_path = IMAGE_DIR / path.lstrip("/")
                if local_path.exists():
                    with open(local_path, "rb") as img_file:
                        base64_images.append(base64.b64encode(img_file.read()).decode("utf-8"))
                else:
                    print(f"  ⚠️ Warning: Image not found locally -> {local_path}")

            # 3. Call the LLM with the newly extracted images
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    # FIX 1: The function returns a tuple. We save it as raw_response.
                    raw_response = enrich_scraped_json_batch(base64_images=base64_images, scraped_json_data=batch, model="gpt-5.4-mini")
                    
                    # Extract the actual Pydantic model (which is at index 0)
                    metadata_payload = raw_response[0]
                    
                    # FIX 2: Use the correct Pydantic attribute: 'question_metadata_list'
                    if len(metadata_payload.question_metadata_list) != len(batch.get("questions", [])):
                        raise ValueError(f"Array length mismatch. Expected {len(batch.get('questions', []))} but got {len(metadata_payload.question_metadata_list)}.")
                    
                    # Merge metadata
                    for idx, q_meta in enumerate(metadata_payload.question_metadata_list):
                        batch["questions"][idx]["id"] = f"Q_{q_meta.subject.upper()}_{uuid.uuid4().hex[:8].upper()}"
                        batch["questions"][idx]["subject"] = q_meta.subject
                        batch["questions"][idx]["topic"] = q_meta.topic
                        batch["questions"][idx]["sub_topic"] = q_meta.sub_topic
                        batch["questions"][idx]["metadata_hooks"] = q_meta.metadata_hooks.model_dump()
                        batch["questions"][idx]["semantic_keywords"] = q_meta.semantic_keywords
                        batch["questions"][idx]["image_descriptions"] = q_meta.image_descriptions

                        batch["questions"][idx]["has_parent_context"] = True if batch.get("parent_context") else False
                        batch["questions"][idx]["parent_context"] = batch.get("parent_context")

                        image_desc_text = " ".join(q_meta.image_descriptions or [])
                        batch["questions"][idx]["combined_embed_text"] = (
                            f"Subject: {q_meta.subject}\n"
                            f"Topic: {q_meta.topic}\n"
                            f"Sub Topic: {q_meta.sub_topic}\n"
                            f"Context: {context_body}\n"
                            f"Question: {batch['questions'][idx].get('question_text', '')}\n"
                            f"Concepts & Keywords: {', '.join(q_meta.semantic_keywords)}\n"
                            f"Image Context: {image_desc_text}\n"
                            f"Core Trap: {q_meta.metadata_hooks.trap_type}"
                        ).strip()
                    
                    output_data.append(batch)
                    print("     ✅ Successfully enriched.")
                    break  # Success, exit retry loop
                    
                except Exception as e:
                    print(f"     ⚠️ Attempt {attempt + 1} failed: {e}")
                    if attempt == max_retries - 1:
                        print(f"     ❌ Skipping batch {batch_idx + 1} after {max_retries} failures.")

        # Save the enriched file
        output_file_path = OUTPUT_DIR / f"enriched_{file_path.name}"
        with open(output_file_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=4)
        
        print(f"✅ Saved enriched file to {output_file_path}")

if __name__ == "__main__":
    process_all_files()
    print("\n🎉 Bulk Enrichment Pipeline Completed!")