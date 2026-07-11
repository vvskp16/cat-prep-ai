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
        "Do not contradict these values (e.g., you cannot output 'Hard' with a 4.2 rating).\n"
        "6. IMAGE DESCRIPTIONS: If the workspace diagrams contain charts, tables, or geometry, provide a concise (max 50 words) description of the nature of the data in the 'image_descriptions' array (e.g., 'Radar chart depicting import tariff percentages across five countries'). DO NOT describe specific data points. If there are no images, return an empty array."
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


# ingestion.py

def enrich_scraped_json_batch(model: str, scraped_json_data: dict, base64_images: List[str]) -> tuple:
    content_payload = [
        {
            "type": "text",
            "text": f"### RAW SCRAPED JSON BATCH ###\n{json.dumps(scraped_json_data, indent=2)}"
        }
    ]

    for b64_str in base64_images:
        content_payload.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64_str}",
                "detail": "high"
            }
        })

    system_instruction = (
        "You are an expert AI data enricher for the CAT exam. You are provided with a scraped JSON data batch "
        "and its workspace diagrams for reference.\n\n"
        "ABSOLUTE RULES:\n"
        "1. Your sole task is to analyze the problems and generate the missing psychometric tags.\n"
        "2. Do NOT copy or re-emit question texts, solutions, choices, or passages.\n"
        "3. You MUST output exactly one metadata block per question matching the array order and length of the input.\n"
        "4. DO NOT calculate, invent, or generate solution paths. Leave solution_text blank or extract only what is explicitly written.\n"
        "5. You MUST analyze the logical premise of the question and classify its primary structural pitfall into the 'trap_type' field "
        "(e.g., 'double-counting', 'unit-conversion', 'boundary-condition'). Provide exactly ONE dominant trap as a flat string.\n"
        "6. DIFFICULTY CONSISTENCY: The 'difficulty' (Literal) and 'difficulty_level' (Float) MUST strictly align. "
        "Use this exact mapping: 1.0 to 3.9 maps to 'Easy'. 4.0 to 6.9 maps to 'Medium'. 7.0 to 10.0 maps to 'Hard'. "
        "Do not contradict these values (e.g., you cannot output 'Hard' with a 4.2 rating).\n"
        "7. The numbers of questions in the output MUST match the input. "
        "Example: If the input has 4 questions, the output must have 4 metadata objects.\n"
        "8. The semantic_keywords field MUST contain 3-5 specific keywords, they should identify the passage or question intent clearly "
        "if the question itself is small in a passage or set of questions, then add keywords as per parent context.\n"
        "9. IMAGE DESCRIPTIONS: If the workspace diagrams contain charts, tables, or geometry, provide a concise (max 50 words) description of the nature of the data in the 'image_descriptions' array (e.g., 'Radar chart depicting import tariff percentages across five countries'). DO NOT describe specific data points. If there are no images, return an empty array."
    )

    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": content_payload}
        ],
        response_format=LLMBatchEnrichment
    )
    
    return completion.choices[0].message.parsed, completion.usage