# single_batch_enricher.py
import argparse
import json
import base64
import uuid
from pathlib import Path
from data_models import CATExtractionBatch
from ingestion import enrich_scraped_json_batch

SOURCE_JSON_DIR = Path("./dev_scripts/extraction/extracted_json")
IMAGE_DIR = Path("./cat-frontend/public")
OUTPUT_DIR = Path("./chroma_ready_docs")

def encode_image_to_base64(image_path: Path) -> str:
    if image_path.exists():
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    return None

def main():
    parser = argparse.ArgumentParser(description="Targeted Single Batch AI Tagging Utility")
    parser.add_argument("--file", type=str, required=True, help="Filename (e.g. cat_2019_slot2.json)")
    parser.add_argument("--batch", type=int, required=True, help="Specific batch array index to process (e.g. 0)")
    parser.add_argument("--model", type=str, default="gpt-4o-mini", help="LLM selection")
    args = parser.parse_args()

    file_path = SOURCE_JSON_DIR / args.file
    if not file_path.exists():
        print(f"❌ File location not found: {file_path.absolute()}")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    batches = data if isinstance(data, list) else [data]
    
    if args.batch < 0 or args.batch >= len(batches):
        print(f"❌ Invalid Index: Provided file has {len(batches)} batches. Index {args.batch} is out of bounds.")
        return

    batch = batches[args.batch]
    print(f"🎯 Target Acquired: Processing batch {args.batch} inside {args.file}...")

    # Build Images
    base64_images = []
    if batch.get("parent_context") and "context_images" in batch["parent_context"]:
        for img in batch["parent_context"]["context_images"]:
            b64 = encode_image_to_base64(IMAGE_DIR / img.lstrip("/"))
            if b64: base64_images.append(b64)
    for q in batch.get("questions", []):
        for img in q.get("question_images", []):
            b64 = encode_image_to_base64(IMAGE_DIR / img.lstrip("/"))
            if b64: base64_images.append(b64)

    # Call Model Direct
    try:
        llm_metadata, usage = enrich_scraped_json_batch(model=args.model, scraped_json_data=batch, base64_images=base64_images)
    except Exception as e:
        print(f"❌ LLM API Processing Error: {e}")
        return

    if len(llm_metadata.question_metadata_list) != len(batch.get("questions", [])):
        print(llm_metadata.question_metadata_list)
        print(batch.get("questions", []))
        print(f"❌ Count Mismatch Error: Target requires {len(batch['questions'])} blocks but model returned {len(llm_metadata.question_metadata_list)}.")
        return

    # Stitch Block
    shared_context_id = f"CTX_{uuid.uuid4().hex[:8].upper()}" if batch.get("batch_type") == "SET" else None
    if shared_context_id and batch.get("parent_context"):
        batch["parent_context"]["context_id"] = shared_context_id

    for idx, question in enumerate(batch["questions"]):
        question.update(llm_metadata.question_metadata_list[idx].model_dump())
        question["id"] = f"Q_{question['subject'].upper()}_{uuid.uuid4().hex[:8].upper()}"
        question["question_type"] = "MCQ" if question.get("options") else "TITA"
        question["has_parent_context"] = shared_context_id is not None
        question["parent_context"] = batch["parent_context"] if shared_context_id else None

    # Structural Validation Check
    try:
        CATExtractionBatch(**batch)
        print(f"🎉 Validation Flawless! Tokens Used: {usage.total_tokens}")
        
        # Save standalone debugger target output
        debug_out = OUTPUT_DIR / f"debug_enriched_{args.batch}_{args.file}"
        with open(debug_out, "w", encoding="utf-8") as out_f:
            json.dump(batch, out_f, indent=2, ensure_ascii=False)
        print(f"💾 Single item successfully stored here: {debug_out}")
    except Exception as validation_err:
        print(f"❌ Data Schema Enforcement Rejection: {validation_err}")

if __name__ == "__main__":
    main()