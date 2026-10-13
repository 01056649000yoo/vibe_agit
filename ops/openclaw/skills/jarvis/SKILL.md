---
name: jarvis
description: 선생님의 반복 업무를 명령 한 번으로 끝낸다 — 업무 추가·완료(구글 태스크), 학사일정 추가(구글 캘린더), 프로젝트 기록 갱신, 메모 저장, PDF 찾기·요약·읽기, 구글 시트 만들기. "업무", "할일", "일정", "학사일정", "프로젝트", "메모", "pdf", "시트" 가 들어간 요청은 이 스킬을 먼저 쓴다. 다른 설명서·스크립트를 열어 읽지 않는다.
user-invocable: true
disable-model-invocation: false
---

# 자비스 통합 명령

모든 일은 아래 **한 가지 모양**의 명령 한 번으로 끝난다. 파일 만들기·DB 반영·구글 반영·확인을 스크립트가 알아서 한다.
실행 정책 때문에 **절대 경로 그대로** 쓰고, `cd`·`&&`·`python3 -c`·상대 경로·`rg`·`awk` 는 쓰지 않는다.

`J` = `/usr/bin/python3 -B /Users/seunghyeonmaegmini/Jarvis_Brain_Local/scripts/jarvis.py`

| 요청 | 명령 |
|---|---|
| 업무 추가 | `J task add --title "내용" [--date YYYY-MM-DD] [--done]` (날짜 없으면 오늘) |
| 업무 완료 | `J task done --match "키워드" [--date YYYY-MM-DD]` |
| 학사일정 | `J calendar add --title "이름" --start YYYY-MM-DD [--end YYYY-MM-DD] [--start-time HH:MM --end-time HH:MM] [--category 분류] [--note 메모]` |
| 프로젝트 기록 | `J project update --name "프로젝트" --text "내용" [--date YYYY-MM-DD]` (처음 만드는 프로젝트일 때만 `--create`) |
| 메모 | `J memo add --title "제목" --body "본문" [--tags 태그1,태그2] [--pinned]` |
| PDF 찾기 | `J pdf find "키워드"` → 정리본이 있으면 그대로 답한다 |
| PDF 읽기 | `J pdf read --id 번호 [--grep "키워드"] [--max 4000]` (정리본으로 모자랄 때만) |
| 구글 시트 | `J sheet create --title "제목" --tab "탭" --column "열" ...` (탭·열은 반복 지정, 받은 대로만) |

## 규칙
- 명령은 **한 번만** 실행하고, 출력 한 줄을 그대로 한 줄로 보고한다. 재확인 조회를 하지 않는다.
- 날짜는 "9/3", "다음 주 월요일" 같은 말을 오늘 날짜 기준으로 `YYYY-MM-DD` 로 바꿔서 준다. 모르면 한 줄로 묻는다.
- 종료 코드 2("이미 있습니다", "여러 건", "프로젝트가 없습니다")는 실패가 아니라 확인이 필요한 것이다. 출력 그대로 알리고 멈춘다. 사용자가 새로 만들라고 하면 그때만 `--create`.
- 막히거나 오류(종료 코드 1)면 다른 방법을 시도하지 말고 **출력 한 줄만 보고하고 멈춘다**.
- 시트 링크 권한은 사용자가 `보기`/`편집` 을 말했을 때만 `--permission link_viewer|link_editor`. 민감정보(학생 상담·비밀번호)는 시트에 넣지 않는다.
- 이 명령에 없는 일(첨부파일·엑셀 채우기·구글 문서·시간표·학기기록)은 아직 해당 스킬(`jarvis-route` 등)을 쓴다.
