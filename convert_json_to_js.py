import os
import glob
import json

DATA_DIR = r'd:\AI_English\data'

def convert_all():
    json_files = glob.glob(os.path.join(DATA_DIR, '*.json'))
    for jf in json_files:
        bank_id = os.path.splitext(os.path.basename(jf))[0]
        js_file = os.path.join(DATA_DIR, f"{bank_id}.js")
        
        with open(jf, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        with open(js_file, 'w', encoding='utf-8') as f:
            f.write("window.WORDWISE_BANKS = window.WORDWISE_BANKS || {};\n")
            f.write(f"window.WORDWISE_BANKS['{bank_id}'] = ")
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
            f.write(";\n")
            
        print(f"Converted {jf} -> {js_file}")

if __name__ == '__main__':
    convert_all()
