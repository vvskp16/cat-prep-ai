import os
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# 🛠️ Configurations
BASE_URL = "https://cracku.in"
IMAGE_DIR = "downloaded_images"
INPUT_HTML = "cracku_2025_raw.txt"
OUTPUT_JSON = "cracku_extracted_batches.json"

os.makedirs(IMAGE_DIR, exist_ok=True)

def download_image(img_url):
    """Downloads an image and returns the local file path."""
    if img_url.startswith("data:"):
        return img_url
        
    full_url = urljoin(BASE_URL, img_url)
    img_name = os.path.basename(urlparse(full_url).path)
    if not img_name:
        img_name = f"img_{hash(full_url)}.png"
        
    local_path = os.path.join(IMAGE_DIR, img_name)
    
    # Download only if it doesn't already exist locally
    if not os.path.exists(local_path):
        try:
            response = requests.get(full_url, stream=True, timeout=10)
            if response.status_code == 200:
                with open(local_path, 'wb') as f:
                    for chunk in response.iter_content(1024):
                        f.write(chunk)
            else:
                return full_url
        except Exception:
            return full_url
            
    return local_path

def process_element(element):
    """Extracts text, preserves LaTeX math, and embeds local image references."""
    if not element:
        return None
        
    el_copy = BeautifulSoup(str(element), 'html.parser')
    
    # 1. Process Math (Revert KaTeX to Raw LaTeX)
    for katex in el_copy.find_all(class_='katex'):
        annotation = katex.find('annotation', encoding='application/x-tex')
        if annotation:
            katex.replace_with(f"$${annotation.text}$$")
            
    # Strip residual rendered math elements to prevent duplication
    for junk in el_copy.find_all(class_=['katex-html', 'MathJax_Preview', 'MathJax', 'mjx-chtml']):
        junk.decompose()
        
    # 2. Process & Download Images
    for img in el_copy.find_all('img'):
        src = img.get('src')
        if src:
            local_path = download_image(src)
            img.replace_with(f" [Image: {local_path}] ")
            
    return el_copy.get_text(separator=' ', strip=True)

def parse_cracku_html(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
        
    batches = []
    current_passage = None
    current_batch = None
    
    # Target passages and questions sequentially
    elements = soup.find_all(lambda tag: 
        (tag.name == 'article' and tag.has_attr('data-qid')) or 
        (tag.name == 'div' and 'instructions-content' in tag.get('class', []))
    )
    
    for el in elements:
        # Handle Context / Passage
        if el.name == 'div':
            text = process_element(el)
            # Filter out generic placeholder instructions
            if text and "answer them individually" not in text.lower():
                current_passage = text
            else:
                current_passage = None
                
        # Handle Questions
        elif el.name == 'article':
            qid = el.get('data-qid')
            q_num = el.get('data-question-index')
            
            raw_question = process_element(el.find(class_='question-text'))
            raw_answer = None
            
            # Options Logic (MCQ)
            options_box = el.find(class_='options-box')
            if options_box:
                ans_index = options_box.get('data-answer')
                if ans_index:
                    correct_btn = options_box.find('button', attrs={'data-option': ans_index})
                    if correct_btn:
                        raw_answer = process_element(correct_btn.find(class_='option-content'))
            else:
                # TITA (Text Input) Logic
                tita_input = el.find('input', attrs={'data-answer': True})
                if tita_input:
                    raw_answer = tita_input.get('data-answer')
                    
            # Solution Logic (Linked outside the main article via ID)
            solution_div = soup.find(id=f"explanation{qid}")
            raw_solution = None
            if solution_div:
                sol_body = solution_div.find(class_='solution-body')
                raw_solution = process_element(sol_body if sol_body else solution_div)
                
            item = {
                "question_number": int(q_num) if q_num and q_num.isdigit() else None,
                "raw_question": raw_question,
                "raw_answer": raw_answer,
                "raw_solution": raw_solution
            }
            
            # Batching Logic Enforcement
            if current_passage:
                if not current_batch or current_batch.get('parent_context') != current_passage:
                    current_batch = {
                        "batch_type": "SET",
                        "parent_context": current_passage,
                        "items": [item]
                    }
                    batches.append(current_batch)
                else:
                    current_batch['items'].append(item)
            else:
                batches.append({
                    "batch_type": "STANDALONE",
                    "parent_context": None,
                    "items": [item]
                })
                current_batch = None
                
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(batches, f, indent=2, ensure_ascii=False)
        
    print(f"✅ Extracted {len(batches)} batches.")
    print(f"📂 Images saved to ./{IMAGE_DIR}/")

if __name__ == "__main__":
    parse_cracku_html(INPUT_HTML)