---
name: time
description: 시간표 — /time 날짜 1교시 2교시 ... (예: /time 내일 영어 국어 국어 체육 음악 국어)
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: jarvis_quick
---

# /time

텔레그램 슬래시 명령. 모델을 거치지 않고 자비스 통합 명령(`jarvis.py quick time`)이 곧바로 실행한다.
바꾸지 않을 교시는 - 로 적는다. 날짜는 10/15·내일·1016 모두 된다.
