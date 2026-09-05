"""Check actual PDF pagination, all prose/stanzas, 12pt minimum, and selected paper bounds."""
import json
import logging
import re
import sys
import pdfplumber

logging.getLogger('pdfminer').setLevel(logging.ERROR)
normalize = lambda text: re.sub(r'\s+', '', text)
with open(sys.argv[2], encoding='utf-8') as expected:
    data = json.load(expected)
    works, paper = data['works'], data['paper']
with pdfplumber.open(sys.argv[1]) as pdf:
    assert pdf.metadata.get('Title', '').startswith('QA:'), 'Pagination did not complete'
    toc = json.loads(pdf.metadata['Title'][3:])
    assert len(toc) == len(works) == 100, 'Missing table of contents entry'
    texts = [page.extract_text() or '' for page in pdf.pages]
    for index, page_number in toc:
        assert normalize(works[index]['title']) in normalize(texts[page_number - 1]), f'Wrong TOC page: work {index + 1}'
    body = ''.join(normalize(re.sub(r'^\d+$', '', text, flags=re.M)) for text in texts[toc[0][1] - 1:])
    for work in works:
        body = body.replace(normalize(work['title'] + ' · 이어서'), '')
    for index, work in enumerate(works):
        for block in work['blocks']:
            assert normalize(block) in body, f'Lost paragraph or stanza: work {index + 1}'
    for number, page in enumerate(pdf.pages, 1):
        assert abs(page.width - paper['width'] * 72 / 25.4) < 1 and abs(page.height - paper['height'] * 72 / 25.4) < 1, f'Wrong paper size: {number}'
        for char in page.chars:
            if not char['text'].strip():
                continue
            assert char['size'] >= 11.9, f'Font below 12pt: page {number}'
            assert char['x0'] >= 25 and char['x1'] <= page.width - 25, f'Horizontal clipping: page {number}'
            assert char['top'] >= 20 and char['bottom'] <= page.height - 14, f'Vertical clipping: page {number}'
    assert '끄적끄적 아지트' in texts[-1], 'Missing colophon'
    print(f'PASS: 100 works, {len(pdf.pages)} {paper["id"]} pages, 100 correct TOC pages, no missing text/stanzas, minimum 12pt, no clipping.')
