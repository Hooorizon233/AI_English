"""
OCR Vocabulary Extractor
从 英语词汇/ 文件夹的 PNG 图片中提取英语单词和中文释义
生成 JSON 词库文件

依赖安装:
  pip install pytesseract Pillow

Tesseract 安装 (Windows):
  下载安装: https://github.com/UB-Mannheim/tesseract/wiki
  安装时勾选 Chinese Simplified 语言包
  默认路径: C:\\Program Files\\Tesseract-OCR\\tesseract.exe

用法:
  python scripts/ocr_vocabulary.py
  python scripts/ocr_vocabulary.py --review   # 人工校对模式
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path

try:
    from PIL import Image, ImageFilter, ImageEnhance
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

try:
    import pytesseract
except ImportError:
    print("请先安装 pytesseract: pip install pytesseract")
    sys.exit(1)

# ===== Configuration =====
BASE_DIR = Path(__file__).parent.parent
IMAGE_DIR = BASE_DIR / "英语词汇"
OUTPUT_JSON = BASE_DIR / "data" / "vocabulary_notes.json"
OUTPUT_JS = BASE_DIR / "data" / "vocabulary_notes.js"
REVIEW_FILE = BASE_DIR / "data" / "vocabulary_notes_review.txt"

# Set Tesseract path (adjust if installed elsewhere)
if os.name == 'nt':
    # Windows common paths
    possible_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        os.path.expanduser(r'~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'),
        r'D:\Tesseract-OCR\tesseract.exe',
    ]
    for p in possible_paths:
        if os.path.exists(p):
            pytesseract.pytesseract.tesseract_cmd = p
            print(f"Found Tesseract: {p}")
            break
    else:
        print("=" * 60)
        print("Tesseract OCR 未找到！")
        print("请从以下地址下载安装:")
        print("  https://github.com/UB-Mannheim/tesseract/wiki")
        print("安装时务必勾选 Chinese Simplified 中文语言包")
        print()
        print("如果已安装但路径不在默认位置，请修改脚本中的 possible_paths")
        print("=" * 60)


def preprocess_image(img):
    """Preprocess image for better OCR accuracy"""
    # Convert to grayscale
    img = img.convert('L')

    # Increase contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Increase sharpness
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(2.0)

    # Apply slight blur to remove noise
    img = img.filter(ImageFilter.MedianFilter(3))

    # Threshold to make text black and background white
    # This helps with photos of notes where lighting is uneven
    img = img.point(lambda x: 0 if x < 140 else 255)

    return img


def ocr_image(image_path):
    """Run OCR on a single image"""
    print(f"Processing: {image_path.name} ({image_path.stat().st_size / 1024 / 1024:.1f} MB)")

    img = Image.open(image_path)

    # Try preprocessing
    processed = preprocess_image(img)

    # OCR with Chinese + English
    text = pytesseract.image_to_string(
        processed,
        lang='chi_sim+eng',
        config='--oem 3 --psm 6'  # OEM 3 = Default, PSM 6 = Assume uniform block of text
    )

    return text


def parse_text_to_words(text):
    """
    Parse OCR text into word-translation pairs.
    Handles common formats:
      - word translation
      - word  /phonetic/  translation
      - 1. word  translation
      - word  n. translation
    """
    lines = text.strip().split('\n')
    words = []
    uncertain = []

    # Common patterns
    patterns = [
        # word  translation (most common)
        re.compile(r'^(\d+[\.\)]\s*)?([a-zA-Z\-]+(?:[\s\-][a-zA-Z\-]+)*)\s{2,}(.+)$'),
        # word /phonetic/ translation
        re.compile(r'^([a-zA-Z\-]+)\s*/[^/]+/\s*(.+)$'),
        # word  n./v./adj. translation
        re.compile(r'^([a-zA-Z\-]+)\s+[nvad]+\..+$'),
    ]

    for line in lines:
        line = line.strip()
        if not line or len(line) < 3:
            continue

        # Skip non-word lines
        if re.match(r'^[\d\s\.\-_/#\*\(\)\[\]\{\}]+$', line):
            continue

        matched = False
        for pattern in patterns:
            m = pattern.match(line)
            if m:
                groups = m.groups()
                word = groups[1] if len(groups) > 2 and groups[1] else groups[0]
                word = word.strip().lower()

                # Find the translation (last group that has Chinese or meaningful text)
                translation = groups[-1].strip() if groups[-1] else line

                # Validate word looks like an English word
                if re.match(r'^[a-z\-]+$', word) and len(word) >= 2:
                    words.append({
                        "word": word,
                        "phonetic": "",
                        "translation": translation,
                        "example": ""
                    })
                    matched = True
                break

        if not matched:
            # Unmatched line — add to uncertain for manual review
            # Still try to extract if it has obvious word+Chinese structure
            has_english = bool(re.search(r'[a-zA-Z]{3,}', line))
            has_chinese = bool(re.search(r'[一-鿿]', line))
            if has_english and has_chinese:
                uncertain.append(line)

    return words, uncertain


def output_js(words, output_path):
    """Generate the JS wrapper file for the word bank"""
    json_str = json.dumps(words, ensure_ascii=False, indent=2)
    # Escape backticks and template literals
    json_str = json_str.replace('`', '\\`').replace('${', '\\${')

    js_content = f"""// Auto-generated from OCR — 词汇笔记
// Generated: {__import__('datetime').datetime.now().isoformat()}
// Total words: {len(words)}

(function() {{
    window.WORDWISE_BANKS = window.WORDWISE_BANKS || {{}};
    window.WORDWISE_BANKS['vocabulary_notes'] = {json_str};
}})();
"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"JS file written: {output_path}")


def main():
    global IMAGE_DIR, OUTPUT_JSON, OUTPUT_JS, REVIEW_FILE

    parser = argparse.ArgumentParser(description='OCR vocabulary extractor')
    parser.add_argument('--review', action='store_true', help='Review uncertain lines from a previous run')
    parser.add_argument('--output', type=str, help='Output JSON file path')
    args = parser.parse_args()

    if not os.path.exists(IMAGE_DIR):
        print(f"Image directory not found: {IMAGE_DIR}")
        # Check current directory
        alt_dir = Path("英语词汇")
        if alt_dir.exists():
            IMAGE_DIR = alt_dir.resolve()
            print(f"Using alternative path: {IMAGE_DIR}")

    images = sorted(IMAGE_DIR.glob("*.PNG")) + sorted(IMAGE_DIR.glob("*.png")) + \
             sorted(IMAGE_DIR.glob("*.JPG")) + sorted(IMAGE_DIR.glob("*.jpg"))
    if not images:
        print(f"No images found in {IMAGE_DIR}")
        sys.exit(1)

    print(f"Found {len(images)} images")
    print(f"Output: {OUTPUT_JSON}")
    print()

    all_words = []
    all_uncertain = []

    for img_path in images:
        try:
            text = ocr_image(img_path)
            words, uncertain = parse_text_to_words(text)
            all_words.extend(words)
            all_uncertain.extend(uncertain)
            print(f"  → {len(words)} words, {len(uncertain)} uncertain lines")
        except Exception as e:
            print(f"  → Error: {e}")

    # Deduplicate by word
    seen = set()
    unique_words = []
    for w in all_words:
        if w['word'] not in seen:
            seen.add(w['word'])
            unique_words.append(w)

    print(f"\n{'=' * 40}")
    print(f"Total words extracted: {len(all_words)}")
    print(f"After deduplication: {len(unique_words)}")
    print(f"Uncertain lines: {len(all_uncertain)}")

    # Save words as JSON
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(unique_words, f, ensure_ascii=False, indent=2)
    print(f"JSON saved: {OUTPUT_JSON}")

    # Generate JS file
    output_js(unique_words, OUTPUT_JS)

    # Save uncertain lines for manual review
    if all_uncertain:
        with open(REVIEW_FILE, 'w', encoding='utf-8') as f:
            f.write("=== 需要人工校对的文本行 ===\n")
            f.write("每行格式: 原始文本\n")
            f.write("校对后格式: 单词<TAB>释义\n")
            f.write("请将校对后的行保存为 vocabulary_notes_corrected.txt，再次运行本脚本\n\n")
            for i, line in enumerate(all_uncertain):
                f.write(f"{i + 1}. {line}\n")
        print(f"Review file saved: {REVIEW_FILE}")
        print(f"\n请查看 {REVIEW_FILE} 进行人工校对")
        print(f"校对完成后，将正确的单词-释义对保存为 vocabulary_notes_corrected.txt")
        print(f"格式: 每行一个单词，用 Tab 分隔单词和释义")
        print(f"       abandon<TAB>v. 放弃，抛弃")

    print(f"\n✅ Done! {len(unique_words)} words extracted.")
    print(f"   JSON: {OUTPUT_JSON}")
    print(f"   JS:   {OUTPUT_JS}")


if __name__ == '__main__':
    main()
