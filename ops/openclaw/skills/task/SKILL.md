---
name: task
description: 업무 추가 — /task [날짜] 할 일 (예: /task 10/31 공개수업 계획서 제출, 끝에 '완료'를 붙이면 완료 업무)
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: jarvis_quick
---

# /task

텔레그램 슬래시 명령. 모델을 거치지 않고 자비스 통합 명령(`jarvis.py quick task`)이 곧바로 실행한다.
말하듯이 쓰면 된다. 날짜는 문장 어디에 있어도 읽는다(10/31까지, 내일, 다음주 월요일, 이번주 금요일…). 끝에 '완료·끝'을 붙이면 완료 업무로 저장.
