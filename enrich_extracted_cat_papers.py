import os
import json
import base64
import uuid
import re
import time
from pathlib import Path
from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception_type
import openai
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
        
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost_usd = 0
        total_cost_inr = 0
        
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
                
                # Combine all text for this question block
                combined_text = f"{context_body}\n{question_text}"
                
                # Pluck out the markdown image paths
                found_paths = re.findall(r'!\[.*?\]\((/images/.*?\.png)\)', combined_text)
                image_paths.extend(found_paths)

            # Deduplicate to save LLM tokens
            unique_image_paths = list(set(image_paths))

            # 2. ENCODE TO BASE64 FOR GPT-5.4-MINI
            base64_images = []
            for path in unique_image_paths:
                # Resolve the relative URL to your local filesystem
                local_path = IMAGE_DIR / path.lstrip("/")
                if local_path.exists():
                    with open(local_path, "rb") as img_file:
                        base64_images.append(base64.b64encode(img_file.read()).decode("utf-8"))
                else:
                    print(f"  ⚠️ Warning: Image not found locally -> {local_path}")

            # 3. Call the LLM with the newly extracted images (resilient call)
            @retry(
                wait=wait_random_exponential(min=2, max=60),
                stop=stop_after_attempt(5),
                retry=retry_if_exception_type(openai.RateLimitError)
            )
            def safe_enrich_call(scraped_batch, b64_images):
                return enrich_scraped_json_batch(base64_images=b64_images, scraped_json_data=scraped_batch, model="gpt-5.4-mini")

            try:
                raw_response = safe_enrich_call(batch, base64_images)

                # Extract payload and token usage
                metadata_payload = raw_response[0]
                token_usage = raw_response[1]

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

                    # --- INLINE IMAGE DESCRIPTION INJECTION ---
                    # We replace markdown image tags in the visible text with
                    # the AI-generated descriptions so the enriched JSON
                    # contains exactly what the embedding model will see.
                    desc_list = list(q_meta.image_descriptions or [])

                    def truncate_desc(text: str, max_words: int = 50) -> str:
                        parts = str(text).split()
                        return " ".join(parts[:max_words]).strip()

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

                    raw_text = (
                        f"Context: {context_body}\n"
                        f"Question: {batch['questions'][idx].get('question_text', '')}"
                    )

                    inline_text = re.sub(r"!\[.*?\]\([^)]+\)", inject_description, raw_text)

                    # Append any leftover descriptions if there were more
                    # descriptions returned by the model than markdown tags.
                    if consumed < len(desc_list):
                        leftover = " ".join(f"[Image Description: {truncate_desc(d)}]" for d in desc_list[consumed:])
                        inline_text = f"{inline_text}\n\n{leftover}"

                    batch["questions"][idx]["combined_embed_text"] = (
                        f"Subject: {q_meta.subject}\n"
                        f"Topic: {q_meta.topic}\n"
                        f"Sub Topic: {q_meta.sub_topic}\n"
                        f"{inline_text}\n\n"
                        f"Concepts & Keywords: {', '.join(q_meta.semantic_keywords)}\n"
                        f"Core Trap: {q_meta.metadata_hooks.trap_type}"
                    ).strip()

                    # Remove the raw array from the final JSON to avoid
                    # redundancy and metadata bloat now that descriptions
                    # are inlined into `combined_embed_text`.
                    if "image_descriptions" in batch["questions"][idx]:
                        del batch["questions"][idx]["image_descriptions"]
                
                output_data.append(batch)
                
                # --- COST CALCULATION ---
                input_tokens = token_usage.prompt_tokens
                output_tokens = token_usage.completion_tokens
                cost_usd = (input_tokens / 1_000_000) * 0.75 + (output_tokens / 1_000_000) * 4.50
                cost_inr = cost_usd * 95.0
                
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens
                total_cost_usd += cost_usd
                total_cost_inr += cost_inr

                print(f"     ✅ Successfully enriched.")
                print(f"     📊 Tokens: {input_tokens} In | {output_tokens} Out | 💸 Cost: ₹{cost_inr:.4f}")
                # 3b. TPM defensive sleep
                print("     💤 Sleeping 1.5s to respect TPM limits...")
                time.sleep(1.5)
                # ------------------------

            except Exception as e:
                print(f"     ❌ Failed to enrich batch {batch_idx + 1}: {e}")
                print(f"     ❌ Skipping batch {batch_idx + 1} after failure.")

        # Save the enriched file
        output_file_path = OUTPUT_DIR / f"enriched_{file_path.name}"
        with open(output_file_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=4)
        
        print(f"  📊 Total Tokens for {file_path.name}: {total_input_tokens} In | {total_output_tokens} Out | 💸 Total Cost: ₹{total_cost_inr:.4f}")
        print(f"✅ Saved enriched file to {output_file_path}")

if __name__ == "__main__":
    process_all_files()
    print("\n🎉 Bulk Enrichment Pipeline Completed!")