---
name: cal
description: 학사일정 — /cal 날짜[~날짜] [HH:MM-HH:MM] 이름 (예: /cal 10/31~11/1 수학여행)
user-invocable: true
disable-model-invocation: true
command-dispatch: tool
command-tool: jarvis_quick
---

# /cal

텔레그램 슬래시 명령. 모델을 거치지 않고 자비스 통합 명령(`jarvis.py quick cal`)이 곧바로 실행한다.
'10월 31일부터 11월 1일까지 수학여행', '다음주 화요일 오후 2시 총회', '수학여행 10/31 11/1' 처럼 날짜·시각을 말하듯이 쓴다. 시간만 있으면 한 시간짜리.
