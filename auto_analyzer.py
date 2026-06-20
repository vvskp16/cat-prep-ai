import os
import json
from typing import Literal, Optional
from openai import OpenAI
from pydantic import BaseModel, Field

# Initialize OpenAI Client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ==========================================
# TASK 1.3: Define Strict Schema via Pydantic
# ==========================================
class ParentContext(BaseModel):
    context_id: str
    context_type: Literal["passage", "caselet_text", "table", "chart"]
    context_body: str

class Options(BaseModel):
    A: str
    B: str
    C: str
    D: str

class MetadataHooks(BaseModel):
    trap_type: str = Field(description="The underlying structural or logical trap (e.g., 'double-counting', 'boundary-condition', 'relative-speed-unit-clash')")
    difficulty: Literal["Easy", "Medium", "Hard"]
    calculation_intensity: Literal["Low", "Medium", "High"]

class CATUnifiedQuestion(BaseModel):
    id: str
    subject: Literal["Quant", "DILR", "VARC"]
    question_type: Literal["MCQ", "TITA"]
    topic: str
    sub_topic: str
    has_parent_context: bool
    parent_context: Optional[ParentContext] = None
    question_text: str
    options: Optional[Options] = None
    correct_answer: str
    solution_text: str
    metadata_hooks: MetadataHooks

# ==========================================
# TASK 1.2: Build Automated Analysis Loop
# ==========================================
def analyze_and_tag_questions(input_file: str, output_file: str):
    # Load raw, untagged data
    with open(input_file, "r") as f:
        raw_questions = json.load(f)
    
    processed_library = []
    
    SYSTEM_PROMPT = (
        "You are an expert psychometrician and elite CAT exam designer. Your job is to analyze "
        "the provided test question and classify its inner structural mechanics.\n\n"
        "Specifically, identify the 'trap_type' (e.g., 'double-counting', 'extreme-option', "
        "'boundary-condition'), determine structural difficulty based on historical trends, "
        "and calculate operational overhead ('calculation_intensity'). Maintain all original text "
        "and math parameters perfectly."
    )
    
    print(f"🚀 Starting ingestion pipeline for {len(raw_questions)} questions...")
    
    for idx, q in enumerate(raw_questions):
        print(f" Analyzing [{idx + 1}/{len(raw_questions)}] ID: {q['id']}...")
        
        # Format user prompt with the existing structural data
        user_content = f"Analyze this question and fill in the metadata hooks:\n\n{json.dumps(q, indent=2)}"
        
        try:
            # Call gpt-4o-mini with enforced structured output matching our target schema
            response = client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                response_format=CATUnifiedQuestion # Enforces exact schema execution
            )
            
            # The parsed object is guaranteed to match the Pydantic class
            structured_data = response.choices[0].message.parsed
            processed_library.append(structured_data.model_dump())
            
        except Exception as e:
            print(f"❌ Failed to parse question {q['id']}: {e}")
            continue

    # Save the finalized standardized payload locally
    with open(output_file, "w") as f:
        json.dump(processed_library, f, indent=2)
        
    print(f"\n Success! Finalized payload saved to: {output_file}")

if __name__ == "__main__":
    INPUT_PATH = "raw_questions.json"
    OUTPUT_PATH = "processed_library.json"
    
    if not os.environ.get("OPENAI_API_KEY"):
        print("🛑 Error: Please set your OPENAI_API_KEY environment variable before running.")
    else:
        analyze_and_tag_questions(INPUT_PATH, OUTPUT_PATH)