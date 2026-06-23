#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检测 recommended.json 里的可疑词汇（可能是虚构的/错误拼写的）
使用 pyspellchecker 库来验证单词是否真实存在
"""
import json
import re
import subprocess
import sys

# 先安装 pyspellchecker
subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyspellchecker', '-q'])

from spellchecker import SpellChecker

INPUT_FILE = r'd:\AI_English\data\recommended.json'
OUTPUT_CLEAN = r'd:\AI_English\data\recommended.json'
REPORT_FILE = r'd:\AI_English\removed_words_report.txt'

spell = SpellChecker()

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    words_list = json.load(f)

valid_words = []
removed_words = []

for entry in words_list:
    word = entry['word'].lower().strip()
    
    # 跳过过短的词（1个字母）
    if len(word) <= 1:
        removed_words.append((entry['word'], entry['translation'], 'too short'))
        continue
    
    # 检测是否包含数字（残留的带数字词）
    if re.search(r'\d', word):
        removed_words.append((entry['word'], entry['translation'], 'contains digits'))
        continue
    
    # 检测是否只是纯字母组成的合法词
    if not re.match(r'^[a-zA-Z\-\']+$', word):
        removed_words.append((entry['word'], entry['translation'], 'non-alpha chars'))
        continue
    
    # 用 spellchecker 验证
    # unknown() 返回拼写错误的词集合
    unknown = spell.unknown([word])
    if unknown:
        removed_words.append((entry['word'], entry['translation'], 'unknown word'))
    else:
        valid_words.append(entry)

# 写回干净的词库
with open(OUTPUT_CLEAN, 'w', encoding='utf-8') as f:
    json.dump(valid_words, f, ensure_ascii=False, indent=2)

# 写报告
with open(REPORT_FILE, 'w', encoding='utf-8') as f:
    f.write(f"移除词汇报告\n")
    f.write(f"原始词数: {len(words_list)}\n")
    f.write(f"保留词数: {len(valid_words)}\n")
    f.write(f"移除词数: {len(removed_words)}\n\n")
    f.write("=== 移除的词汇 ===\n")
    for word, trans, reason in removed_words[:200]:  # 最多显示200个
        f.write(f"  [{reason}] {word} - {trans}\n")

print(f"原始词数: {len(words_list)}")
print(f"保留词数: {len(valid_words)}")  
print(f"移除词数: {len(removed_words)}")
print(f"报告已写入: {REPORT_FILE}")
