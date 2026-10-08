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


# 의존 명사처럼 앞말과 늘 띄우는 명사(Kiwi 는 '때·점·뒤'를 일반 명사로 본다)
BOUND_LIKE = {'때', '점', '후', '전', '뒤', '중', '동안', '사이', '끝', '적', '줄', '뿐', '만큼', '대로', '채', '체', '척', '듯', '뻔', '김'}
AMBIGUOUS = ('한번', '못하', '못해', '못했', '안되', '안돼', '안됐', '잘하', '잘해', '잘했', '못되', '안하', '안해', '잘되', '잘돼')


def boundary_tokens(kiwi, phrase, cut):
    """phrase 의 cut 자리(공백) 앞 마지막 조각과 뒤 첫 조각."""
    tokens = kiwi.tokenize(phrase)
    left = [t for t in tokens if t.start + t.len <= cut]
    right = [t for t in tokens if t.start >= cut]
    return tokens, (left[-1] if left else None), (right[0] if right else None)


def classify(kiwi, item):
    """갈래와 거른 까닭. 갈래: particle_attach · modifier_noun · typo · other_spacing"""
    original, suggestion, kind = item['original'], item['suggestion'], item['kind']
    if original.startswith(AMBIGUOUS) or original.replace(' ', '').startswith(AMBIGUOUS):
        reason = 'ambiguous'
    else:
        reason = None
    if kind == 'typo':
        return 'typo', reason
    if kind == 'spacing_insert':
        phrase = suggestion
        cut = next((i for i, (a, b) in enumerate(zip(original + ' ', suggestion)) if a != b), len(original))
    else:
        phrase = original
        cut = next((i for i, (a, b) in enumerate(zip(original, suggestion + ' ')) if a != b), len(suggestion))
    tokens, left, right = boundary_tokens(kiwi, phrase, cut)
    if not left or not right:
        return 'other_spacing', reason
    if any(t.tag == 'NNP' for t in tokens):
        reason = reason or 'proper_noun'
    left_text, right_text = phrase[:cut].strip(), phrase[cut:].strip()
    if left_text and right_text and (right_text.startswith(left_text) or left_text == right_text[:len(left_text)]):
        reason = reason or 'repeat'
    if kind == 'spacing_insert':
        if right.tag == 'VX':
            return 'other_spacing', reason or 'auxiliary'
        if right.form == '데' and left.tag == 'ETM':
            return 'other_spacing', reason or 'neunde'
        # 관형형 어미(-ㄴ·-는·-ㄹ·-던) 뒤의 명사는 늘 띄운다(같은 색·흘릴 때·좋을 것). 굳은 합성어(작은아버지)는 Kiwi 가 한 낱말로 본다.
        if left.tag == 'ETM' and right.tag.startswith('NN'):
            return 'modifier_noun', reason
        if left.tag == 'NNB' and right.tag in ('VA', 'VV', 'VX', 'VCN'):
            return 'modifier_noun', reason   # 수 있다 · 것 같다 · 적 있다
        if left.tag.startswith(('NN', 'NP')) and right.form in BOUND_LIKE and right.tag in ('NNG', 'NNB'):
            return 'modifier_noun', reason   # 방학 때 · 수업 중
        return 'other_spacing', reason
    # 붙여 써야 할 듯: 띄운 뒷부분이 조사·서술격 조사·어미·접미사
    if right.tag.startswith('J') or right.tag in ('VCP', 'XSN', 'XSV', 'XSA') or right.tag.startswith('E'):
        return 'particle_attach', reason
    return 'other_spacing', reason


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
        try:
            item['category'], item['filter_reason'] = classify(kiwi, item)
        except Exception:
            item['category'], item['filter_reason'] = 'other_spacing', None
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
