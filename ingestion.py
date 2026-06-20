# ingestion.py
import os
from typing import Any, List
from openai import OpenAI
from data_models import CATExtractionBatch

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def extract_structured_cat_batch(
    model: str,
    base64_images: List[str], 
    deterministic_ocr_text: str
) -> tuple:
    
    content_payload = [
        {
            "type": "text",
            "text": (
                "CRITICAL GUARDRAIL: The following raw text block is your absolute alphanumeric anchor. "
                "You are forbidden from modifying constants, renaming option parameters, or changing variables.\n\n"
                f"### DETERMINISTIC OCR GROUND TRUTH ###\n{deterministic_ocr_text}"
            )
        }
    ]
    
    for idx, b64_str in enumerate(base64_images):
        content_payload.append({
            "type": "text",
            "text": f"--- Visual Workspace Asset Reference: Image_{idx + 1} ---"
        })
        content_payload.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64_str}"
            }
        })

# Updated: Explicit instruction covering anti-duplication, token-saving, and trap analysis
    system_instruction = (
        "You are a psychometric data parser for the CAT exam. Your mission is to map raw input streams "
        "into structured batch arrays. Use visual assets exclusively to map spatial parameters and decode context.\n\n"
        "ABSOLUTE RULES:\n"
        "1. Extract ONLY the exact questions present in the source image/text. NEVER duplicate a question. "
        "If the source contains only 1 question, return an array of length 1.\n"
        "2. DO NOT calculate, invent, or generate solution paths. Leave solution_text blank or extract only what is explicitly written.\n"
        "3. You MUST analyze the logical premise of the question and classify its primary structural pitfall into the 'trap_type' field "
        "(e.g., 'double-counting', 'unit-conversion', 'boundary-condition'). Provide exactly ONE dominant trap as a flat string."
        "4. MATH FORMATTING: You MUST format all mathematical expressions, variables, and equations using standard KaTeX syntax. "
        "Strictly use single dollar signs for inline math (e.g., $a - 6b + 6c = 4$) and double dollar signs for block math. "
        "DO NOT use \\( or \\) wrappers."
    )

    # Execute the OpenAI Structured Parse
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": content_payload}
        ],
        response_format=CATExtractionBatch
    )
    
    # Return both the parsed structure and usage statistics as a tuple
    return completion.choices[0].message.parsed, completion.usage