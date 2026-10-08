"""
맞춤법 회색 점선 실시간 창구(2026-10-08) — 맥미니 안(127.0.0.1)에서만 열린다.

  서버 함수 spelling-look-closer(학생 인증·학급 켜짐·횟수 제한) → 이 창구 → analyze.py(Kiwi·hunspell·MeCab)

  POST /analyze   머리글 X-Analyzer-Token 이 맞아야 한다.
                  {"paragraphs": [{"key": "...", "text": "..."}]}  (문단 12개·문단마다 1,500자까지)
                → {"results": [{"key": "...", "suggestions": [{start, end, original, suggestion, category}]}]}
                  start·end 는 JS 문자열 위치(UTF-16)다. 보일 것(visible)만 돌려준다.
  GET  /health    {"ok": true, "cross_check": true|false}  (글을 받지 않으므로 열쇠 없이)

학생 글은 저장하지도, 기록(로그)에 남기지도 않는다. 요청 수·걸린 시간만 남긴다.
열쇠는 SPELLING_ANALYZER_TOKEN 환경 변수, 없으면 ~/agit-supabase/secrets.agit.env 의 같은 이름 줄에서 읽는다.
한 번에 하나씩 처리한다(분석기·hunspell 파이프가 동시에 쓰기에 안전하지 않다). 문단 하나 보통 2ms.
"""
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze import Hunspell, Kiwi, Mecab, analyze  # noqa: E402

HOST = '127.0.0.1'
PORT = int(os.environ.get('SPELLING_ANALYZER_PORT', '8791'))
MAX_BODY = 64 * 1024
MAX_PARAGRAPHS = 12
MAX_PARAGRAPH_CHARS = 1500
SECRETS_FILE = os.path.expanduser('~/agit-supabase/secrets.agit.env')


def read_token():
    token = os.environ.get('SPELLING_ANALYZER_TOKEN', '').strip()
    if token or not os.path.exists(SECRETS_FILE):
        return token
    with open(SECRETS_FILE, encoding='utf-8') as file:
        for line in file:
            if line.startswith('SPELLING_ANALYZER_TOKEN='):
                return line.split('=', 1)[1].strip().strip('"\'')
    return ''


def utf16_index(text):
    """코드 포인트 위치 → JS(UTF-16) 위치. 그림 글자처럼 BMP 밖 글자는 JS 에서 두 칸이다."""
    out, n = [], 0
    for ch in text:
        out.append(n)
        n += 2 if ord(ch) > 0xFFFF else 1
    out.append(n)
    return out


def paragraph_result(kiwi, hun, mec, text):
    text = text[:MAX_PARAGRAPH_CHARS]
    index = utf16_index(text)
    found = []
    for item in analyze(kiwi, text, hun, mec):
        if not item.get('visible'):
            continue
        found.append({
            'start': index[item['start']], 'end': index[item['end']],
            'original': item['original'], 'suggestion': item['suggestion'], 'category': item['category']
        })
    return found


class Handler(BaseHTTPRequestHandler):
    server_version = 'agit-spelling-analyzer'
    timeout = 10

    def log_message(self, *args):  # 기본 로그는 주소·경로를 남긴다. 아래 _log 만 쓴다.
        return

    def _log(self, status, paragraphs=0, started=None):
        took = f'{(time.monotonic() - started) * 1000:.0f}ms' if started else '-'
        sys.stderr.write(f'{time.strftime("%Y-%m-%d %H:%M:%S")} {status} paragraphs={paragraphs} took={took}\n')

    def _json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != '/health':
            return self._json(404, {'error': 'not_found'})
        state = self.server.state
        return self._json(200, {'ok': True, 'cross_check': bool(state['hun'].fast and state['mec'].proc)})

    def do_POST(self):
        started = time.monotonic()
        state = self.server.state
        if self.path != '/analyze':
            return self._json(404, {'error': 'not_found'})
        given = self.headers.get('X-Analyzer-Token', '')
        if not state['token'] or not hmac.compare_digest(given, state['token']):
            self._log(401)
            return self._json(401, {'error': 'unauthorized'})
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BODY:
            self._log(413)
            return self._json(413, {'error': 'too_large'})
        try:
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            paragraphs = body.get('paragraphs') or []
            if not isinstance(paragraphs, list):
                raise ValueError
        except Exception:
            self._log(400)
            return self._json(400, {'error': 'bad_request'})
        results = []
        for paragraph in paragraphs[:MAX_PARAGRAPHS]:
            if not isinstance(paragraph, dict):
                continue
            # 입력기가 완성형(NFC)으로 맞춘 문단을 보낸다. 위치는 그 글 기준이다.
            key = str(paragraph.get('key', ''))[:80]
            text = str(paragraph.get('text', ''))
            try:
                results.append({'key': key, 'suggestions': paragraph_result(state['kiwi'], state['hun'], state['mec'], text)})
            except Exception:
                results.append({'key': key, 'suggestions': []})
        self._log(200, len(results), started)
        return self._json(200, {'results': results})


def main():
    token = read_token()
    if not token:
        sys.stderr.write('SPELLING_ANALYZER_TOKEN 이 없어 요청을 모두 거절합니다.\n')
    kiwi, hun, mec = Kiwi(), Hunspell(), Mecab()
    analyze(kiwi, '준비 운동', hun, mec)  # 예열 — 첫 요청이 느리지 않게
    server = HTTPServer((HOST, PORT), Handler)
    server.state = {'token': token, 'kiwi': kiwi, 'hun': hun, 'mec': mec}
    sys.stderr.write(f'listening {HOST}:{PORT} cross_check={bool(hun.fast and mec.proc)}\n')
    server.serve_forever()


if __name__ == '__main__':
    main()
