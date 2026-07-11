import os
import json

# Absolute paths based on your system
FIX_DIR = r"C:\Users\kbnt5y\Documents\personal\CATPrepAI\cat-prep-ai-git\batches_to_fix"
TARGET_DIR = r"C:\Users\kbnt5y\Documents\personal\CATPrepAI\cat-prep-ai-git\chroma_ready_docs"

def apply_fixes():
    fixed_sets = {}
    fixed_standalones = {}

    if not os.path.exists(FIX_DIR):
        print(f"❌ Fix directory not found: {FIX_DIR}")
        return
        
    if not os.path.exists(TARGET_DIR):
        print(f"❌ Target directory not found: {TARGET_DIR}")
        return

    print("📥 Loading repaired batches into memory...")
    
    # 1. Load the pristine, fixed batches into memory dictionaries
    for filename in os.listdir(FIX_DIR):
        if not filename.endswith(".json"):
            continue
            
        filepath = os.path.join(FIX_DIR, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                batch = json.load(f)
                
                # Store SETs mapped by context_id
                if batch.get("batch_type") == "SET":
                    ctx_id = batch.get("parent_context", {}).get("context_id")
                    if ctx_id:
                        fixed_sets[ctx_id] = batch
                        print(f"   ✅ Loaded Fixed SET: {ctx_id}")
                        
                # Store STANDALONE questions mapped by their unique question text
                elif batch.get("batch_type") == "STANDALONE":
                    q_text = batch.get("questions", [{}])[0].get("question_text")
                    if q_text:
                        fixed_standalones[q_text] = batch
                        print("   ✅ Loaded Fixed STANDALONE item.")
        except Exception as e:
            print(f"⚠️ Error reading {filename}: {e}")

    if not fixed_sets and not fixed_standalones:
        print("⚠️ No valid fixed batches found in batches_to_fix.")
        return

    print(f"\n🔄 Scanning '{TARGET_DIR}' for bad data...")

    files_updated_count = 0
    sets_replaced = set()

    # 2. Iterate through original docs to find and replace
    for filename in os.listdir(TARGET_DIR):
        if not filename.endswith(".json"):
            continue
            
        filepath = os.path.join(TARGET_DIR, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                continue

            file_modified = False
            new_data = []
            
            triggered_ctx_ids_in_file = set()
            triggered_standalones_in_file = set()
            
            # Step A: Filter out the old, bad objects
            for item in data:
                # Handle flattened JSON structure (just in case)
                is_flat = "question_text" in item and "questions" not in item
                
                if is_flat:
                    ctx = item.get("parent_context")
                    ctx_id = ctx.get("context_id") if ctx and item.get("has_parent_context") else None
                    
                    if ctx_id and ctx_id in fixed_sets:
                        triggered_ctx_ids_in_file.add(ctx_id)
                        file_modified = True
                        continue # Drop the bad item
                        
                    q_text = item.get("question_text")
                    if not ctx_id and q_text in fixed_standalones:
                        triggered_standalones_in_file.add(q_text)
                        file_modified = True
                        continue # Drop the bad item
                        
                    new_data.append(item)
                
                # Handle structural nested Batch layout
                else:
                    if item.get("batch_type") == "SET":
                        ctx_id = item.get("parent_context", {}).get("context_id")
                        if ctx_id in fixed_sets:
                            triggered_ctx_ids_in_file.add(ctx_id)
                            file_modified = True
                            continue # Drop the bad batch
                        else:
                            new_data.append(item)
                    elif item.get("batch_type") == "STANDALONE":
                        q_text = item.get("questions", [{}])[0].get("question_text")
                        if q_text in fixed_standalones:
                            triggered_standalones_in_file.add(q_text)
                            file_modified = True
                            continue # Drop the bad batch
                        else:
                            new_data.append(item)
                    else:
                        new_data.append(item)

            # Step B: Inject the new, repaired batch objects
            for ctx_id in triggered_ctx_ids_in_file:
                new_data.append(fixed_sets[ctx_id])
                sets_replaced.add(ctx_id)
                print(f"   🔁 Healed SET {ctx_id} inside -> {filename}")
                
            for q_text in triggered_standalones_in_file:
                new_data.append(fixed_standalones[q_text])
                print(f"   🔁 Healed STANDALONE question inside -> {filename}")

            # Step C: Write the perfectly sanitized array back to disk
            if file_modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(new_data, f, indent=4, ensure_ascii=False)
                files_updated_count += 1

        except Exception as e:
            print(f"⚠️ Error processing {filename}: {e}")

    print(f"\n🎉 Done! Successfully healed {files_updated_count} master files in chroma_ready_docs.")
    
    # Failsafe Check
    missed_sets = set(fixed_sets.keys()) - sets_replaced
    if missed_sets:
        print(f"⚠️ Warning: The following fixed sets were loaded but could not be matched in chroma_ready_docs: {missed_sets}")

if __name__ == "__main__":
    apply_fixes()