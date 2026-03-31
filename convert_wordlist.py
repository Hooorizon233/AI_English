#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重新生成 recommended.json：
- 去掉末尾数字的重复词（如 defect1 -> defect，已存在则跳过）
- 去掉普通重复词
- 只手动移除确实虚构/错误的极少数词
- 保留所有英式英语拼写（centre, cheque, aeroplane 等均保留）
"""
import re
import json

INPUT_FILE  = r'd:\AI_English\考研词汇表.txt'
OUTPUT_FILE = r'd:\AI_English\data\recommended.json'

# 确认要手动排除的词（真的不对的）
BLACKLIST = {
    'tid',        # 不是单词，应是 tide
    'uncheck',    # 释义明显错误
    'sapiens',    # 物种拉丁名，不适合词汇学习
    'coleslaw',   # 凉拌卷心菜，不是考研词汇
}

def clean_word(raw_word):
    return re.sub(r'\d+$', '', raw_word.strip()).strip()

def parse_line(line):
    line = line.strip()
    if not line:
        return None
    parts = line.split(None, 1)
    if len(parts) < 2:
        return None
    raw_word, translation = parts[0], parts[1]
    word = clean_word(raw_word)
    if not word:
        return None
    return word, translation.strip()

def main():
    words = []
    seen = set()
    skipped = []

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            result = parse_line(line)
            if result is None:
                continue
            word, translation = result

            wl = word.lower()

            # 黑名单
            if wl in BLACKLIST:
                skipped.append((word, 'blacklisted'))
                continue

            # 重复
            if wl in seen:
                skipped.append((word, 'duplicate'))
                continue

            seen.add(wl)
            words.append({
                "word": word,
                "phonetic": "",
                "translation": translation,
                "example": ""
            })

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    js_output = OUTPUT_FILE.replace('.json', '.js')
    bank_id = os.path.splitext(os.path.basename(OUTPUT_FILE))[0]
    with open(js_output, 'w', encoding='utf-8') as f:
        f.write("window.WORDWISE_BANKS = window.WORDWISE_BANKS || {};\n")
        f.write(f"window.WORDWISE_BANKS['{bank_id}'] = ")
        json.dump(words, f, ensure_ascii=False, separators=(',', ':'))
        f.write(";\n")

    print(f"Done! Total kept: {len(words)}, skipped: {len(skipped)}")
    # 显示跳过的词
    for w, reason in skipped[:50]:
        print(f"  [{reason}] {w}")

if __name__ == '__main__':
    main()
