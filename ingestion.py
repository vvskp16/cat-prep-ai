# ingestion.py
import os
from typing import List
from openai import OpenAI
from data_models import CATExtractionBatch

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def extract_structured_cat_batch(
    base64_images: List[str], 
    deterministic_ocr_text: str
) -> CATExtractionBatch:
    
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

    # Updated: Explicit instruction to prevent the 10-duplicate hallucination
    system_instruction = (
        "You are a psychometric data parser for the CAT exam. Your mission is to map raw input streams "
        "into structured batch arrays. Use visual assets exclusively to map spatial parameters and decode context.\n\n"
        "ABSOLUTE RULE: Extract ONLY the exact questions present in the source image/text. "
        "NEVER duplicate a question. If the source contains only 1 question, return an array of length 1."
    )

    completion = client.beta.chat.completions.parse(
        model="gpt-4o-mini", 
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": content_payload}
        ],
        response_format=CATExtractionBatch,
        temperature=0.0
    )
    
    return completion.choices[0].message.parsed