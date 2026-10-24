---
name: code-map
description: 코드 지도(Graphify)로 파일을 통째로 읽지 않고 필요한 조각만 본다 — 영향 범위(affected)·연결(explain)·함수 하나의 소스(show)·DB 함수 최신 정의(rpc)·지도 갱신(update)·사용 평가(usage). 고치기 전에 "이걸 바꾸면 어디가 영향받나", "이 함수만 보여 줘", "이 RPC 지금 정의가 뭐야"를 알고 싶을 때 쓴다.
---

# 코드 지도 쓰기

세션을 열 때 지도는 이미 백그라운드로 최신화된다(`.claude/hooks/code-map-refresh.sh`). 조회할 때 낡았으면 알아서 다시 만든다. 직접 새로 만들려면 `npm run map -- update`.

## 큰 파일을 읽기 전에 먼저
| 알고 싶은 것 | 명령 (영문 이름) |
|---|---|
| 이 함수·컴포넌트 **소스만** (파일 전체를 읽지 않기) | `npm run map -- show buildSeat` (겹치면 `show 이름 파일일부`) |
| 이 **DB 함수의 최신 정의**·부르는 곳·권한 (낡은 정의 건너뜀) | `npm run map -- rpc get_my_title_status` |
| 이걸 고치면 **영향받는 곳** | `npm run map -- affected PlazaPostModal` |
| 이것이 무엇과 이어져 있나 | `npm run map -- explain DragonPlazaEntry` |
| 이름이 나오는 부분 지도 / 두 이름 사이 길 | `query "A B"` / `path "A" "B"` |

## 규칙
- 파일 하나를 통째로 `Read` 하기 전에 `show`/`rpc` 로 필요한 조각만 볼 수 있는지 먼저 본다. 주변 맥락이 더 필요하면 그때 그 줄 범위만 `Read`.
- 지도가 못 보는 것(RPC 이름 문자열·CSS 클래스·모듈 id·한글)은 `grep`. 지우거나 이름을 바꿀 때는 grep 으로도 한 번 더 센다.
- **쓴 뒤 평가 한 줄**: `npm run map -- note 도움됨|아님|놓침 "이유"` (놓침 = 지도가 못 봐서 grep). 집계는 `npm run map -- usage`. 2026-11-08 에 선생님께 보고한다.
- 자세한 설명·한계: [docs/wiki/CODE_MAP.md](../../../docs/wiki/CODE_MAP.md)
