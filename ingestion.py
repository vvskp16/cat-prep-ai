# ingestion.py
import os
from typing import Any, List
import httpx
import json
from openai import OpenAI
from data_models import CATExtractionBatch, LLMBatchEnrichment

# Initialize the client with SSL verification disabled
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
    http_client=httpx.Client(verify=False) # This bypasses the SSL block
)

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

    # Updated: Explicit instruction covering anti-duplication, token-saving, trap analysis, and difficulty correlation
    system_instruction = (
        "You are a psychometric data parser for the CAT exam. Your mission is to map raw input streams "
        "into structured batch arrays. Use visual assets exclusively to map spatial parameters and decode context.\n\n"
        "ABSOLUTE RULES:\n"
        "1. Extract ONLY the exact questions present in the source image/text. NEVER duplicate a question. "
        "If the source contains only 1 question, return an array of length 1.\n"
        "2. DO NOT calculate, invent, or generate solution paths. Leave solution_text blank or extract only what is explicitly written.\n"
        "3. You MUST analyze the logical premise of the question and classify its primary structural pitfall into the 'trap_type' field "
        "(e.g., 'double-counting', 'unit-conversion', 'boundary-condition'). Provide exactly ONE dominant trap as a flat string.\n"
        "4. MATH FORMATTING: You MUST format all mathematical expressions, variables, and equations using standard KaTeX syntax. "
        "Strictly use single dollar signs for inline math (e.g., $a - 6b + 6c = 4$) and double dollar signs for block math. "
        "DO NOT use \\( or \\) wrappers.\n"
        "5. DIFFICULTY CONSISTENCY: The 'difficulty' (Literal) and 'difficulty_level' (Float) MUST strictly align. "
        "Use this exact mapping: 1.0 to 3.9 maps to 'Easy'. 4.0 to 6.9 maps to 'Medium'. 7.0 to 10.0 maps to 'Hard'. "
        "Do not contradict these values (e.g., you cannot output 'Hard' with a 4.2 rating)."
    )

    # Execute the OpenAI Structured Parse
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": content_payload}
        ],
        response_format=LLMBatchEnrichment
    )
    
    # Return both the parsed structure and usage statistics as a tuple
    return completion.choices[0].message.parsed, completion.usage


def enrich_scraped_json_batch(model: str, scraped_json_data: dict) -> tuple:
    
    content_payload = [
        {
            "type": "text",
            "text": f"### RAW SCRAPED JSON ###\n{json.dumps(scraped_json_data, indent=2)}"
        }
    ]

    system_instruction = (
        "You are an AI data enricher for the CAT exam. You will be provided with a perfectly extracted JSON payload "
        "containing questions, options, solutions, and image references.\n\n"
        "ABSOLUTE RULES:\n"
        "1. DATA INTEGRITY: You MUST copy `question_text`, `options`, `correct_answer`, `solution_text`, and all image/source arrays "
        "EXACTLY as they appear in the provided JSON. Do NOT modify, calculate, or hallucinate a single character of these fields.\n"
        "2. METADATA GENERATION: Your sole job is to analyze the provided text and intelligently generate the missing fields: "
        "`subject`, `topic`, `sub_topic`, `metadata_hooks` (trap_type, difficulty_level, calculation_intensity), and `semantic_keywords`.\n"
        "3. Keep the `batch_type` and `parent_context` exactly as provided in the source JSON."
    )

    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": content_payload}
        ],
        response_format=CATExtractionBatch
    )
    
    return completion.choices[0].message.parsed, completion.usage