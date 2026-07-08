import os
import json
import re
import uuid
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# ==========================================
# CONFIGURATION & URLS
# ==========================================
RAW_DIR = "raw_html"
JSON_DIR = "extracted_json"
IMAGE_SAVE_DIR = "extracted_images"
BASE_URL = "https://cracku.in"

os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(JSON_DIR, exist_ok=True)
os.makedirs(IMAGE_SAVE_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

CAT_URLS = [
    "https://cracku.in/cat-2025-slot-1-question-paper-solved",
]

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def clean_math_tags(text: str) -> str:
    if not text: return text
    cleaned = text.replace("$$", "$")
    cleaned = cleaned.replace('\xa0', ' ')
    return cleaned

def download_and_save_image(img_url: str) -> str:
    if not img_url: return ""
    if not img_url.startswith("http"):
        img_url = urljoin(BASE_URL, img_url)

    try:
        response = requests.get(img_url, stream=True, headers=HEADERS)
        response.raise_for_status()
        
        filename = f"img_{uuid.uuid4().hex[:8]}.png"
        local_path = os.path.join(IMAGE_SAVE_DIR, filename)
        
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(1024):
                f.write(chunk)
                
        return f"/images/{filename}"
    except Exception as e:
        print(f"  [!] Failed to download image {img_url}: {e}")
        return ""

def extract_content_with_inline_images(soup: BeautifulSoup, html_node) -> str:
    """Extracts text while strictly embedding images as inline Markdown."""
    if not html_node: return ""
    
    for img in html_node.find_all('img'):
        img_url = img.get('src')
        local_path = download_and_save_image(img_url)
        
        if local_path:
            # Replaces the HTML element directly with a Markdown equivalent
            markdown_img = soup.new_string(f"\n\n![Diagram]({local_path})\n\n")
            img.replace_with(markdown_img)
        else:
            img.decompose()
            
    raw_text = html_node.get_text(separator="\n", strip=True)
    clean_text = re.sub(r'\n{3,}', '\n\n', raw_text).replace('\xa0', ' ')
    return clean_text

# ==========================================
# PHASE 1: FETCHING SCRIPT
# ==========================================
def fetch_all_html():
    print(f"\n--- Phase 1: Downloading Raw HTML ({len(CAT_URLS)} Exams) ---")
    for url in CAT_URLS:
        exam_slug = url.split('/')[-1].replace("-question-paper-solved", "")
        file_path = os.path.join(RAW_DIR, f"{exam_slug}_raw.txt")
        
        if os.path.exists(file_path):
            print(f"⏭️  Skipping {exam_slug} (Already exists)")
            continue
            
        try:
            print(f"⬇️  Fetching {exam_slug}...")
            response = requests.get(url, headers=HEADERS)
            response.raise_for_status()
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
                
            time.sleep(2) # Polite delay
        except Exception as e:
            print(f"❌ Failed to fetch {url}: {e}")

# ==========================================
# PHASE 2: EXTRACTION SCRIPT
# ==========================================
def process_all_raw_files():
    print(f"\n--- Phase 2: Extracting JSON Batches ---")
    raw_files = [f for f in os.listdir(RAW_DIR) if f.endswith("_raw.txt")]
    
    for file_name in raw_files:
        exam_slug = file_name.replace("_raw.txt", "")
        output_json = os.path.join(JSON_DIR, f"{exam_slug}.json")
        file_path = os.path.join(RAW_DIR, file_name)
        
        print(f"⚙️  Processing {exam_slug}...")
        
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")

        batches = []
        current_context = None
        current_batch_questions = []

        def flush_batch():
            nonlocal current_batch_questions, current_context
            if current_batch_questions:
                batches.append({
                    "batch_type": "SET" if current_context else "STANDALONE",
                    "parent_context": current_context,
                    "questions": current_batch_questions
                })
                current_batch_questions = []

        elements = soup.find_all(lambda tag: 
            (tag.name == 'div' and tag.get('class') and 'instructions-body' in tag.get('class')) or 
            (tag.name == 'article' and tag.has_attr('data-qid'))
        )

        for el in elements:
            # 1. HANDLE CONTEXT
            if el.name == 'div':
                raw_text = el.get_text(separator="\n", strip=True)
                flush_batch()
                
                if "answer them individually" in raw_text.lower() or "stand alone" in raw_text.lower():
                    current_context = None
                else:
                    # FIX: Pass the passage element through the markdown embedding function
                    context_body = extract_content_with_inline_images(soup, el)
                    
                    current_context = {
                        "context_id": f"CTX_{uuid.uuid4().hex[:8].upper()}",
                        "context_type": "passage",
                        "context_body": clean_math_tags(context_body)
                    }
                    
            # 2. HANDLE QUESTION
            elif el.name == 'article':
                q_data = {}
                
                q_text_div = el.find('div', class_='question-text')
                q_text = extract_content_with_inline_images(soup, q_text_div)
                q_data['question_text'] = clean_math_tags(q_text) if q_text != "" else "MISSING_TEXT"
                
                options_box = el.find('div', class_='options-box')
                if options_box:
                    q_data['question_type'] = 'MCQ'
                    options = {}
                    correct_option_idx = options_box.get('data-answer')
                    correct_letter = None
                    
                    for btn in options_box.find_all('button', attrs={'data-option': True}):
                        opt_idx = btn.get('data-option')
                        opt_no_span = btn.find('span', class_='opt-no')
                        opt_letter = opt_no_span.get_text(strip=True) if opt_no_span else opt_idx
                        
                        opt_content = btn.find('div', class_='option-content')
                        # Run options through inline image extractor just in case
                        raw_opt_text = extract_content_with_inline_images(soup, opt_content) if opt_content else ""
                        options[opt_letter] = clean_math_tags(raw_opt_text)
                        
                        if opt_idx == correct_option_idx: correct_letter = opt_letter

                    q_data['options'] = options
                    q_data['correct_answer'] = correct_letter
                else:
                    q_data['question_type'] = 'TITA'
                    q_data['options'] = None
                    answer_input = el.find('input', attrs={'data-answer': True})
                    if answer_input:
                        q_data['correct_answer'] = answer_input.get('data-answer')
                    else:
                        answer_btn = el.find('button', attrs={'data-answer': True})
                        q_data['correct_answer'] = answer_btn.get('data-answer') if answer_btn else None

                qid = el.get('data-qid')
                sol_container = soup.find('div', id=f'explanation{qid}')
                if sol_container:
                    sol_div = sol_container.find('div', class_='solution-body')
                    sol_text = extract_content_with_inline_images(soup, sol_div)
                    q_data['solution_text'] = clean_math_tags(sol_text) if sol_text != "" else "MISSING_SOLUTION_TEXT"
                else:
                    q_data['solution_text'] = "MISSING_SOLUTION_TEXT"
                
                sources = []
                for a in el.find_all('a', href=True):
                    label = a.get_text(strip=True)
                    if label and label not in ["Download Solution PDF", "Share"]:
                        link = urljoin(BASE_URL, a['href']) if not a['href'].startswith('http') else a['href']
                        if not any(s['link'] == link for s in sources):
                            sources.append({"label": label, "link": link})
                q_data['original_sources'] = sources

                current_batch_questions.append(q_data)
                if not current_context: flush_batch()

        flush_batch()

        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(batches, f, indent=4)
            
        print(f"  ✅ Saved {len(batches)} batches to {output_json}")

if __name__ == "__main__":
    fetch_all_html()
    process_all_raw_files()
    print("\n🎉 Entire Extraction Pipeline Completed!")