---
name: doc
description: 구글 문서로 저장 — /doc 제목 | 내용 (나만 보기)
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: jarvis_quick
---

# /doc

텔레그램 슬래시 명령. 모델을 거치지 않고 자비스 통합 명령(`jarvis.py quick doc`)이 곧바로 실행한다.
마크다운(# 제목, - 목록, | 표)을 쓸 수 있다.
