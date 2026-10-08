"""
맞춤법 '살펴볼 곳'(회색 점선) 분석기 — Kiwi 형태소 분석기(Apache-2.0)로 맥미니 안에서만 돈다(2026-10-08).

표준 입력: 한 줄에 JSON 하나 {"id": ..., "text": ...}
표준 출력: 한 줄에 JSON 하나 {"id": ..., "suggestions": [{start, end, original, suggestion, kind}]}
  kind: spacing_insert(띄어 써야 할 듯) · spacing_remove(붙여 써야 할 듯) · typo(받침·글자 오타일 듯)
  start/end 는 파이썬 문자열 위치(코드 포인트)이며, 어절 단위(띄어쓰기로 나뉜 덩어리)로 넓혀 돌려준다.

판정은 '살펴볼 곳'일 뿐이다 — 빨간 줄(확실히 틀림)은 앱의 규칙·기본 자료가 정한다.
학생 글은 이 프로세스 밖으로 나가지 않는다(네트워크를 쓰지 않는다).
"""
import json
import sys

from kiwipiepy import Kiwi

MAX_TEXT = 6000  # 한 편 상한(아주 긴 붙여넣기로 오래 붙잡히지 않게)


def eojeol_span(text, start, end):
    """[start, end) 를 앞뒤 공백까지 넓혀 어절 하나로."""
    s, e = start, end
    while s > 0 and not text[s - 1].isspace():
        s -= 1
    while e < len(text) and not text[e].isspace():
        e += 1
    return s, e


def nonspace_index(text):
    """공백을 뺀 글자 순서 → 원문 위치."""
    return [i for i, ch in enumerate(text) if not ch.isspace()]


def space_after(text):
    """공백을 뺀 글자 순서에서 '이 글자 뒤에 띄어쓰기가 있다' 자리."""
    out, n = set(), -1
    for ch in text:
        if ch.isspace():
            if n >= 0:
                out.add(n)
        else:
            n += 1
    return out


def spacing_suggestions(kiwi, text):
    found = []
    pos = nonspace_index(text)
    if not pos:
        return found
    original = space_after(text)
    inserted = space_after(kiwi.space(text, reset_whitespace=False)) - original
    removed = original - space_after(kiwi.space(text, reset_whitespace=True))
    for kind, marks in (('spacing_insert', inserted), ('spacing_remove', removed)):
        for k in sorted(marks):
            if k + 1 >= len(pos):
                continue
            left, right = pos[k], pos[k + 1]
            # 문장 부호 뒤에 띄우라는 것은 맞춤법 줄로 다루지 않는다(마침표 뒤 띄어쓰기는 따로)
            if not ('가' <= text[left] <= '힣' and '가' <= text[right] <= '힣'):
                continue
            s, e = eojeol_span(text, left, left + 1)
            if kind == 'spacing_remove':
                e = eojeol_span(text, right, right + 1)[1]
                suggestion = text[s:left + 1] + text[right:e]
            else:
                cut = left + 1 - s
                word = text[s:e]
                suggestion = word[:cut] + ' ' + word[cut:]
            found.append({'start': s, 'end': e, 'original': text[s:e], 'suggestion': suggestion, 'kind': kind})
    return found


def typo_suggestions(kiwi, text):
    found = []
    tokens = kiwi.tokenize(text, typos='basic')
    by_eojeol = {}
    for t in tokens:
        s, e = eojeol_span(text, t.start, t.start + t.len)
        by_eojeol.setdefault((s, e), []).append(t)
    for (s, e), toks in by_eojeol.items():
        if not any(getattr(t, 'typo_cost', 0) > 0 for t in toks):
            continue
        try:
            fixed = kiwi.join([(t.form, t.tag) for t in toks])
        except Exception:
            continue
        original = text[s:e]
        if fixed and fixed != original and fixed.replace(' ', '') != original.replace(' ', ''):
            found.append({'start': s, 'end': e, 'original': original, 'suggestion': fixed, 'kind': 'typo'})
    return found


def analyze(kiwi, text):
    text = (text or '')[:MAX_TEXT]
    seen, out = set(), []
    typos = typo_suggestions(kiwi, text)
    # 오타가 있는 어절의 띄어쓰기 판정은 믿지 않는다('분노을' → '분노 을' 같은 엉뚱한 제안). 오타가 먼저다.
    typo_spans = [(t['start'], t['end']) for t in typos]
    spacing = [item for item in spacing_suggestions(kiwi, text)
               if not any(item['start'] < e and item['end'] > s for s, e in typo_spans)]
    for item in typos + spacing:
        key = (item['start'], item['end'], item['kind'])
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return sorted(out, key=lambda item: item['start'])


def main():
    kiwi = Kiwi()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            result = {'id': req.get('id'), 'suggestions': analyze(kiwi, req.get('text', ''))}
        except Exception as error:  # 한 편 때문에 전체가 멈추지 않게
            result = {'id': None, 'error': type(error).__name__}
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
