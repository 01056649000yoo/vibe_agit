---
name: proj
description: 프로젝트 기록 — /proj 프로젝트이름 내용 (예: /proj ai중점학교 연수 확정, 새 프로젝트는 /proj +새이름 | 내용)
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: jarvis_quick
---

# /proj

텔레그램 슬래시 명령. 모델을 거치지 않고 자비스 통합 명령(`jarvis.py quick proj`)이 곧바로 실행한다.
기존 프로젝트 이름으로 시작하면 나머지가 내용이다. '프로젝트[이름] 내용', '이름: 내용', '이름에 내용 기록해줘' 도 된다. 새 프로젝트는 '/proj +새이름 | 내용'.
