"""
Parse 926词汇.txt into word bank JSON format.
"""
import json
import re
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, '926词汇.txt')
OUTPUT_JSON = os.path.join(BASE_DIR, 'data', 'vocabulary_notes.json')
OUTPUT_JS = os.path.join(BASE_DIR, 'data', 'vocabulary_notes.js')

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    text = f.read()

words = []
seen = set()
uncertain = []

# Pattern 1: "数字. word pos.释义"  e.g. "1. abdicate v.退位、放弃"
pattern1 = re.compile(r'^\d+\.?\s+([a-zA-Z\-]+(?:\s+[a-zA-Z\-]+)*)\s+([a-z]+\.?)\s*(.+)$')

# Pattern 2: "word pos.释义"  e.g. "abdicate v.退位、放弃" (no leading number)
pattern2 = re.compile(r'^([a-zA-Z\-]{2,}(?:\s+[a-zA-Z\-]+)*)\s+([a-z]+\.?)\s*(.+)$')

# Pattern 3: "word 释义"  e.g. "segment v.切分、分割 n.部分" (multiple POS)
pattern3 = re.compile(r'^([a-zA-Z\-]{2,}(?:\s+[a-zA-Z\-]+)*)\s+((?:[a-z]+\.\s*.+?)+)$')

for line in text.split('\n'):
    line = line.strip()
    if not line:
        continue

    # Pre-clean: strip [微信公众号:一烫] from raw line
    line = re.sub(r'\s*\[微信公众号[：:][^\]]+\]\s*', '', line)
    line = re.sub(r'\s*微信公众号[：:]\S+\s*', '', line)
    line = line.strip()

    # Skip headers and noise
    if line.startswith('#') or line.startswith('===') or line.startswith('---'):
        continue
    if '请在需要时' in line or '没问题，以下是' in line:
        continue
    if line.startswith('####') or line.startswith('达叔'):
        continue
    if re.match(r'^第.+张图片', line):
        continue

    # Try pattern 1: numbered entry
    m = pattern1.match(line)
    if not m:
        m = pattern2.match(line)
    if not m:
        # Try line that starts with word and has definition
        m = pattern3.match(line)

    if m:
        word = m.group(1).strip().lower()
        # Remove extra spaces in multi-word entries
        word = re.sub(r'\s+', ' ', word)

        # Get the translation part
        if len(m.groups()) >= 2:
            translation = m.group(m.lastindex).strip() if m.lastindex else line
        else:
            translation = line

        # Clean translation
        translation = translation.strip()

        # Remove [微信公众号:一烫] and similar junk
        translation = re.sub(r'\s*\[微信公众号[：:][^\]]+\]\s*', '', translation)
        translation = re.sub(r'\s*微信公众号[：:]\S+\s*', '', translation)
        translation = re.sub(r'\s*一烫\s*', '', translation)

        # Fix common OCR artifacts in translation
        translation = re.sub(r'\s+[a-z]\s+\([a-z]\)\.\s*', ' ', translation)  # remove broken "a (y)."
        translation = re.sub(r'(.)\s+[^\x00-\x7f]{1}\.$', r'\1.', translation)  # remove single CJK char before period "山."
        translation = re.sub(r'^[^\x00-\x7f]{1}\.\s*', '', translation)  # leading single CJK char + period

        # Strip trailing single junk CJK chars (OCR artifacts like 吉, 微 at line ends)
        if len(translation) > 2 and translation[-1] in '吉微':
            translation = translation[:-1]

        # Remove trailing particles that indicate noise
        translation = re.sub(r'\s+[^\x00-\x7f]{1}$', '', translation)  # trailing single CJK char

        translation = translation.strip()
        # Clean up double periods
        translation = re.sub(r'\.\.', '.', translation)

        # Validate word
        if re.match(r'^[a-z\- ]{2,}$', word) and not word.startswith('-'):
            if word not in seen:
                seen.add(word)
                words.append({
                    "word": word,
                    "phonetic": "",
                    "translation": translation,
                    "example": "",
                    "frequency": 0
                })
        else:
            uncertain.append(line)
        continue

    # Check if line looks like a word entry without number
    # e.g. "segment v.切分、分割 n.部分"
    if re.search(r'[a-z]+\.[^a-z]', line) and re.search(r'[一-鿿]', line):
        uncertain.append(line)
        continue

# Remove duplicates preserving order
unique = []
seen2 = set()
for w in words:
    if w['word'] not in seen2:
        seen2.add(w['word'])
        unique.append(w)

print(f"Parsed: {len(unique)} words")
print(f"Uncertain lines: {len(uncertain)}")

# Fix specific malformed entries from the file
fixes = {
    'dormant': 'adj. 休眠的、静止的',
    'elegant': 'adj. 优美的、优雅的',
    'freeze': 'v. 冻结',
    'vivid': 'adj. 生动的、逼真的',
    'fascinate': 'v. 入迷、使着迷',
    'obstruct': 'v. 阻碍、妨碍',
    'correlate': 'v. 使相互关联、和……相关',
    'segment': 'v. 切分、分割 n. 部分',
    'fraction': 'n. （小）部分、少量',
    'insidious': 'adj. 潜伏的、不易察觉的',
    'liberal': 'adj. 自由（主义）的、开明的 n. 自由主义者',
    'resistant': 'adj. 抵抗的、抗拒的',
    'thorny': 'adj. 棘手的、麻烦的',
}

for w in unique:
    if w['word'] in fixes:
        w['translation'] = fixes[w['word']]
        print(f"  Fixed: {w['word']}")

# Save JSON
with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(unique, f, ensure_ascii=False, indent=2)
print(f"JSON saved: {OUTPUT_JSON} ({len(unique)} words)")

# Save JS
json_str = json.dumps(unique, ensure_ascii=False, indent=2)
json_str = json_str.replace('`', '\\`').replace('${', '\\${')

js_content = f"""// Auto-generated from 926词汇.txt — 达叔926核心词
// Total words: {len(unique)}

(function() {{
    window.WORDWISE_BANKS = window.WORDWISE_BANKS || {{}};
    window.WORDWISE_BANKS['vocabulary_notes'] = {json_str};
}})();
"""

with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
    f.write(js_content)
print(f"JS saved: {OUTPUT_JS}")

# Save uncertain lines for review
if uncertain:
    review_path = os.path.join(BASE_DIR, 'data', '926_review.txt')
    with open(review_path, 'w', encoding='utf-8') as f:
        for i, line in enumerate(uncertain):
            f.write(f"{i+1}. {line}\n")
    print(f"Review: {review_path} ({len(uncertain)} lines to check)")
