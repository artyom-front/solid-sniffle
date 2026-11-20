#!/usr/bin/env python3
"""Пост-обработка docx: формат PAGE в футерах (ROMAN для секции TOC,
arabic для тела) + удаление пустых <w:pgNumType/> (WPS-совместимость).
Правило из skills/docx/references/toc.md."""
import re
import shutil
import sys
import zipfile

path = sys.argv[1] if len(sys.argv) > 1 else "download/git-bundle-autodeploy-guide.docx"
tmp = path + ".tmp"

with zipfile.ZipFile(path) as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

# document.xml: убрать пустые pgNumType (обложка)
doc = data["word/document.xml"].decode("utf-8")
doc, n_empty = re.subn(r"<w:pgNumType/>", "", doc)

# футеры: определить, какой футер относится к какой секции.
# Секции идут по порядку: TOC (ROMAN) затем тело (arabic).
# docx-js создаёт footerN.xml в порядке упоминания в document.xml.
footer_refs = re.findall(r'<w:footerReference[^>]*r:id="(rId\d+)"', doc)
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid2file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))

# первый footerReference в тексте документа = секция TOC, второй = тело
toc_footer = rid2file.get(footer_refs[0]) if footer_refs else None
body_footer = rid2file.get(footer_refs[-1]) if len(footer_refs) > 1 else None

changed = []
for fname, fmt in [(toc_footer, "ROMAN"), (body_footer, "arabic")]:
    if not fname:
        continue
    key = "word/" + fname
    if key not in data:
        continue
    xml = data[key].decode("utf-8")
    xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        data[key] = xml.encode("utf-8")
        changed.append(f"{fname}: PAGE -> \\* {fmt} ({n})")

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print(f"pgNumType удалено: {n_empty}; футеры: {'; '.join(changed) or 'не менялись'}")
