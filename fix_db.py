import chromadb
import uuid

client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_collection(name="cat_prep_questions")

all_data = collection.get()

print(f"Scanning {len(all_data['ids'])} records to decouple UI text from Vector text...")
updated_count = 0

for i in range(len(all_data["ids"])):
    doc_id = all_data["ids"][i]
    doc_text = all_data["documents"][i]  # This is the massive combined text
    meta = all_data["metadatas"][i]
    
    if "Context Passage:" in doc_text and "Question:" in doc_text:
        # Slice the string for UI purposes
        parts = doc_text.split("Question:")
        passage_text = parts[0].replace("Context Passage:", "").strip()
        actual_question = parts[1].strip()
        
        # Inject the CLEAN strings into the Metadata NoSQL storage
        meta["has_parent_context"] = "True"
        meta["context_body"] = passage_text
        meta["context_type"] = "passage"
        meta["question_text"] = actual_question  # <-- The Magic Key!
        
        if not meta.get("context_id"):
            meta["context_id"] = f"CTX_{uuid.uuid4().hex[:8].upper()}"
            
        # We push the original massive 'doc_text' back in to preserve the rich embedding
        collection.update(ids=[doc_id], documents=[doc_text], metadatas=[meta])
        updated_count += 1
        
    else:
        # For standalone math questions, the whole doc is just the question
        meta["question_text"] = doc_text
        collection.update(ids=[doc_id], documents=[doc_text], metadatas=[meta])
        updated_count += 1

print(f"✅ Done! Decoupled display text for {updated_count} records.")