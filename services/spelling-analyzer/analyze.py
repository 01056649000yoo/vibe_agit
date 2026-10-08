"""
맞춤법 '살펴볼 곳'(회색 점선) 분석기 — Kiwi 형태소 분석기(Apache-2.0)로 맥미니 안에서만 돈다(2026-10-08).
교차 확인: hunspell 한국어 사전(사전에 있는 말인가)·MeCab-ko(다른 분석기로 띄어쓰기 자리 보기). 둘 다 brew 로 깐 명령을 계속 켜 두고 쓴다.

표준 입력: 한 줄에 JSON 하나 {"id": ..., "text": ...}
표준 출력: 한 줄에 JSON 하나 {"id": ..., "suggestions": [{start, end, original, suggestion, kind}]}
  kind: spacing_insert(띄어 써야 할 듯) · spacing_remove(붙여 써야 할 듯) · typo(받침·글자 오타일 듯)
  category·filter_reason: 갈래와 거른 까닭. hunspell·mecab: 두 번째·세 번째 눈의 판정(True 같은 말 · False 반대 · None 모름).
  visible: 학생에게 회색 점선으로 보일지(visible() 한 곳에서 정한다).
  start/end 는 파이썬 문자열 위치(코드 포인트)이며, 어절 단위(띄어쓰기로 나뉜 덩어리)로 넓혀 돌려준다.

판정은 '살펴볼 곳'일 뿐이다 — 빨간 줄(확실히 틀림)은 앱의 규칙·기본 자료가 정한다.
학생 글은 이 프로세스 밖으로 나가지 않는다(네트워크를 쓰지 않는다).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

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


HUNSPELL_DICT = os.environ.get('AGIT_HUNSPELL_DICT', os.path.expanduser('~/agit-kiwi/hunspell-ko/ko'))
MECAB_DIC = os.environ.get('AGIT_MECAB_DIC', '/opt/homebrew/lib/mecab/dic/mecab-ko-dic')
def find_command(name):
    # 밤 작업(launchd)은 PATH 에 brew 경로가 없을 수 있다
    for path in (shutil.which(name), '/opt/homebrew/bin/' + name, '/usr/local/bin/' + name):
        if path and os.access(path, os.X_OK):
            return path
    return None


EDGE = re.compile(r'^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9]+$')


class Hunspell:
    """한국어 맞춤법 사전(hunspell-dict-ko, GPL-3·국립국어원 공동) — '사전에 있는 말인가'만 묻는다. 없으면 None 을 돌려준다.
    고칠 말 후보 만들기는 모르는 낱말마다 20~130ms 가 들어, 있는 말인지는 후보를 끈 빠른 사전(ko-fast.aff)으로 보고
    후보는 오타 갈래일 때만 원래 사전에 묻는다."""

    def __init__(self):
        self.fast, self.full, self.cache, self.hint_cache = None, None, {}, {}
        self.hint_spent = 0.0   # 이번 분석에서 후보 묻기에 쓴 시간(초) — 느린 후보 만들기가 실시간을 붙잡지 않게
        command = find_command('hunspell')
        if command and os.path.exists(HUNSPELL_DICT + '.dic'):
            fast = HUNSPELL_DICT + '-fast' if os.path.exists(HUNSPELL_DICT + '-fast.aff') else HUNSPELL_DICT
            self.fast, self.full = self._open(command, fast), self._open(command, HUNSPELL_DICT)
            self._ask(self.full, '떄문에')   # 예열 — 첫 후보 묻기는 느려 시간 예산을 넘긴다

    @staticmethod
    def _open(command, dictionary):
        proc = subprocess.Popen([command, '-d', dictionary, '-a', '-i', 'utf-8'], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8', bufsize=1)
        proc.stdout.readline()  # 첫 줄 안내문
        return proc

    @staticmethod
    def _ask(proc, word):
        proc.stdin.write('^' + word + '\n')
        proc.stdin.flush()
        lines = []
        while True:
            line = proc.stdout.readline()
            if not line.strip():
                return lines
            lines.append(line)

    def known(self, word):
        word = EDGE.sub('', word or '')
        if not self.fast or not word:
            return None
        if word not in self.cache:
            if len(self.cache) > 50000:
                self.cache.clear()
            self.cache[word] = all(line[0] in '*+-' for line in self._ask(self.fast, word))
        return self.cache[word]

    def hints(self, word):
        """사전이 내놓는 고칠 말 목록(느리다 — 오타 갈래에만)."""
        word = EDGE.sub('', word or '')
        if not self.full or not word or self.known(word):
            return []
        if word not in self.hint_cache:
            # 길게 붙여 쓴 덩어리는 후보 만들기가 수백 ms 걸리고 대개 띄어쓰기 문제다. 시간 예산을 넘겨도 묻지 않는다.
            if len(word) > HINT_MAX_LEN or self.hint_spent > HINT_TIME_BUDGET:
                return None   # 모름 → 오타 줄은 보이지 않는다
            started = time.monotonic()
            if len(self.hint_cache) > 20000:
                self.hint_cache.clear()
            lines = self._ask(self.full, word)
            self.hint_cache[word] = [h.strip() for line in lines if line.startswith('&') for h in line.split(':', 1)[1].split(',')]
            self.hint_spent += time.monotonic() - started
        return self.hint_cache[word]


class Mecab:
    """MeCab-ko(은전한닢, BSD) — Kiwi 와 따로 문장을 쪼개 보는 두 번째 눈. 없으면 None."""

    def __init__(self):
        self.proc = None
        command = find_command('mecab')
        if command and os.path.isdir(MECAB_DIC):
            self.proc = subprocess.Popen([command, '-d', MECAB_DIC], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.DEVNULL, text=True, encoding='utf-8', bufsize=1)

    def tokens(self, phrase):
        """[(시작, 끝, 겉꼴, 품사)] — 위치는 공백을 뺀 글자 순서."""
        if not self.proc:
            return None
        self.proc.stdin.write(phrase.replace('\n', ' ') + '\n')
        self.proc.stdin.flush()
        out, n = [], 0
        while True:
            line = self.proc.stdout.readline()
            if not line or line.strip() == 'EOS':
                break
            surface, _, feature = line.rstrip('\n').partition('\t')
            out.append((n, n + len(surface), surface, feature.split(',')[0]))
            n += len(surface)
        return out


def cross_check(hun, mec, item):
    """두 번째·세 번째 눈의 판정 — True 같은 말, False 반대, None 모름."""
    original, suggestion, kind = item['original'], item['suggestion'], item['kind']
    # hunspell: 지금 꼴이 사전에 없고, 고친 꼴은 모두 있다 → 같은 말
    before = [hun.known(w) for w in original.split()]
    after = [hun.known(w) for w in suggestion.split()]
    if None in before or None in after:
        h = None
    elif kind == 'spacing_remove':
        # '한테'처럼 조사도 홀로 사전에 있어 지금 꼴로는 못 가른다. 붙인 꼴이 사전에 없으면 반대.
        h = None if all(after) else False
    elif all(before):
        h = False   # 지금 꼴도 사전에 있는 말(앉게·역이지·그다음) — 고칠 까닭이 약하다
    elif kind == 'typo':
        # 오타는 더 엄격히: 사전이 스스로 내놓은 고칠 말에 Kiwi 제안이 있어야 같은 말(찻았다→차 샀다 는 못 지난다)
        hints = hun.hints(original) if len(original.split()) == 1 else []
        if hints is None:
            h = None
        else:
            h = True if EDGE.sub('', suggestion) in hints else (None if all(after) else False)
    else:
        h = True if all(after) else None
    # MeCab: 띄어쓰기만 본다. 공백을 뺀 글에서 같은 자리가 낱말 경계이고, 품사가 같은 규칙을 지나야 같은 말
    m = None
    if kind != 'typo':
        merged = (suggestion if kind == 'spacing_remove' else original).replace(' ', '')
        spaced = suggestion if kind == 'spacing_insert' else original
        cut = len(spaced.split(' ')[0].replace(' ', '')) if ' ' in spaced else None
        toks = mec.tokens(merged) if cut is not None else None
        if toks:
            left = [t for t in toks if t[1] <= cut]
            right = [t for t in toks if t[0] >= cut]
            if not left or not right or left[-1][1] != cut:
                m = False   # MeCab 은 그 자리를 낱말 안쪽으로 본다
            else:
                lt, rt = left[-1][3].split('+')[-1], right[0][3].split('+')[0]
                if kind == 'spacing_insert':
                    m = (lt == 'ETM' and rt.startswith('NN')) or ((lt == 'NNB' or left[-1][2] in ('수', '것', '적', '줄')) and rt in ('VA', 'VV', 'VX', 'VCN')) \
                        or (lt.startswith(('NN', 'NP')) and right[0][2] in BOUND_LIKE)
                else:
                    m = rt.startswith(('J', 'E')) or rt in ('VCP', 'XSN', 'XSV', 'XSA')
    return h, m


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


HINT_TIME_BUDGET = 0.08   # 한 번 분석에 후보 묻기로 쓰는 시간(초)
HINT_MAX_LEN = 8


# 회색 점선으로 보일 갈래(2026-10-08 선생님 결정: 잘 맞는 갈래만). 그 밖의 띄어쓰기는 기록만 한다.
SHOWN_CATEGORIES = ('particle_attach', 'modifier_noun', 'typo')
BOUND_EXCEPTION = re.compile(r'^\S+\s(적|척|뻔|체)')


def visible(item):
    """학생에게 회색 점선으로 보일지 — 실시간 창구와 밤 기록이 이 함수 하나를 쓴다(빨간 줄과 겹침은 부르는 쪽이 본다).
    전체 글 표본 채점으로 정했다(2026-10-08):
      · 꾸미는 말+명사: hunspell 이 반대하면 뺀다(검은색·저녁때·먹을게). '본 적·한 척·할 뻔·한 체'는 사전이 본적(本籍) 같은
        다른 낱말로 착각하므로 그대로 둔다.
      · 토씨 붙이기: 두 도구가 반대해도 Kiwi 가 대개 맞아(같다 고→같다고) 교차 확인을 쓰지 않는다.
      · 받침 오타: 사전이 스스로 내놓은 고칠 말에 Kiwi 제안이 있을 때만(약 92% 맞음).
    """
    if item.get('category') not in SHOWN_CATEGORIES or item.get('filter_reason'):
        return False
    if item['category'] == 'typo':
        return item.get('hunspell') is True
    if item['category'] == 'modifier_noun' and item.get('hunspell') is False:
        return bool(BOUND_EXCEPTION.match(item.get('suggestion', '')))
    return True


def analyze(kiwi, text, hun=None, mec=None):
    text = (text or '')[:MAX_TEXT]
    if hun:
        hun.hint_spent = 0.0
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
        item['hunspell'], item['mecab'] = None, None
        if hun and mec and item['category'] != 'other_spacing':
            try:
                item['hunspell'], item['mecab'] = cross_check(hun, mec, item)
            except Exception:
                pass
        item['visible'] = visible(item)
        out.append(item)
    return sorted(out, key=lambda item: item['start'])


def main():
    kiwi, hun, mec = Kiwi(), Hunspell(), Mecab()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            result = {'id': req.get('id'), 'suggestions': analyze(kiwi, req.get('text', ''), hun, mec)}
        except Exception as error:  # 한 편 때문에 전체가 멈추지 않게
            result = {'id': None, 'error': type(error).__name__}
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
