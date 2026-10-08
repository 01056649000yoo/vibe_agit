#!/bin/bash
# 맞춤법 회색 줄 분석기 설치(맥미니, 2026-10-08). 새 기계에서 이 파일 하나로 같은 상태를 만든다.
#   Kiwi(Apache-2.0)        : ~/agit-kiwi/venv
#   MeCab-ko + 사전(BSD 등) : brew
#   hunspell(MPL 등) + 한국어 사전 hunspell-dict-ko(GPL-3, 서버 안에서만 쓰고 배포하지 않는다) : ~/agit-kiwi/hunspell-ko
# 학생 글은 이 도구들 밖으로 나가지 않는다(모두 네트워크 없이 돈다). 내려받기는 설치 때 한 번뿐.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="$HOME/agit-kiwi"
DICT_VERSION=0.7.94

[ -x "$BASE/venv/bin/python" ] || python3 -m venv "$BASE/venv"
"$BASE/venv/bin/pip" install -q -r "$HERE/requirements.txt"
brew list mecab-ko >/dev/null 2>&1 || brew install mecab-ko mecab-ko-dic
brew list hunspell >/dev/null 2>&1 || brew install hunspell

if [ ! -f "$BASE/hunspell-ko/ko.dic" ]; then
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/ko.zip" "https://github.com/spellcheck-ko/hunspell-dict-ko/releases/download/$DICT_VERSION/ko-aff-dic-$DICT_VERSION.zip"
  unzip -q "$tmp/ko.zip" -d "$tmp"
  mkdir -p "$BASE/hunspell-ko"
  cp "$tmp/ko-aff-dic-$DICT_VERSION/"{ko.aff,ko.dic,LICENSE.md} "$BASE/hunspell-ko/"
  rm -rf "$tmp"
fi
# 빠른 사전: '있는 말인가'만 묻는 용도로 고칠 말 후보 만들기를 끈다(모르는 낱말마다 20~130ms → 1ms 안).
cd "$BASE/hunspell-ko"
grep -v -E "^(TRY|MAXCPDSUGS|MAXNGRAMSUGS|REP|MAP|KEY|PHONE)( |$)" ko.aff > ko-fast.aff
printf 'MAXCPDSUGS 0\nMAXNGRAMSUGS 0\nNOSPLITSUGS\n' >> ko-fast.aff
ln -sf ko.dic ko-fast.dic
printf '%s\n' '{"id":1,"text":"떄문에 먹을것을 샀다."}' | "$BASE/venv/bin/python" -I "$HERE/analyze.py"
