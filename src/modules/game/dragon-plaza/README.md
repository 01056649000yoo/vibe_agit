# 우리반 수호룡 광장 (`dragon-plaza`)

반 친구의 수호룡이 한 교실에 모여 책상에 앉아 있는 학생 놀이터 모듈이다(2026-10-24 선생님 결정, 계획 `docs/CLASS_DRAGON_ROOM_PLAN.md`).
**기본 켜짐**, 교사가 정하거나 올릴 것은 없다. 친구 아지트를 서로 구경하는 교류의 장이라 "내 아지트를 꾸밀 동기"가 된다.

- 진입: `manifest.js` 의 `studentEntry`(놀이터 `나의 작가 수호룡` 바로 아래, `playground.order: 11`).
- 데이터(`plazaApi.js`): 열 때 한 번씩만 — 친구 목록(`친구 아지트`와 같은 `get_student_hideout_directory`, 최대 100명) + 내 정보 +
  새 글 후보(`get_class_public_writing_feed_v1` 최근 50편) + 이번 주 방문자(`get_my_hideout_visitors_v1`). 폴링·실시간 구독 없음.
- 순수 계산(`plazaModel.js`, 시험 `tests/dragonPlaza.test.mjs`): 자리(이름 가나다순 고정)·단계별 드래곤·프레임 빛 테두리·문패·새 글(이 기기에서 안 연 최근 7일 글)·칠판 문구.
- 책상(`PlazaDesk.jsx`): 앉은 그림이 있으면 그것을, 없으면 서 있는 기본 그림 + 코드로 그린 책상. 그림 `public/assets/dragons/desk/{종류}/level-{단계}.webp`·교실 `public/assets/class-room/classroom-day.webp`
  를 넣으면 코드 변경 없이 바뀐다(`deskArt.js` 가 종류마다 한 장을 확인). 만드는 규칙은 `docs/CLASS_DRAGON_ROOM_ART_BRIEF.md`.
- 친구 자리를 누르면 기존 `FriendProfileShell` 이 열린다. 그 안에서 **방문 기록**(`record_hideout_visit_v1`, `20261413`)이 남는다 — 광장이든 `친구 아지트` 목록이든 같은 곳.
- 교실에서는 순위·점수·포인트 보유량을 보여 주지 않는다.
- 개발실: `?dev-lab=dragon-plaza`.

## 그림 (2026-10-24, GPT 이미지 생성으로 만듦)
- 앉은 수호룡 4종 × 10단계 40장(`public/assets/dragons/desk/{종류}/level-{단계}.webp`, 768×768, 투명 배경)과 교실 배경(`public/assets/class-room/classroom-day.webp`, 1600×900)이 들어 있다.
  1단계는 책상 위 쿠션에 놓인 알, 2단계는 알껍데기를 쓴 갓 부화한 새끼, 3단계 이후는 뿔·날개·장식이 자라는 모습. 책상·의자·이름표 자리는 모든 그림에서 같은 위치라 코드가 이름·문패를 같은 자리에 올린다.
- 다시 만들 때: Codex(`codex exec`, 이미지 생성 도구)에 기존 그림(`public/assets/dragons/v2/…`)과 책상 기준 그림을 `-i` 로 첨부해 한 종류씩 만든다(의뢰서 `docs/CLASS_DRAGON_ROOM_ART_BRIEF.md`). 그림 한 장이 Codex 5시간 사용량의 1% 안팎.
- 문패마다 글씨 색이 달라(어두운 문패에는 밝은 글씨) `plaza.css` 의 `data-plate` 규칙이 공방 아지트 장면과 같은 값을 쓴다.
- 칠판 글씨는 교실 사진의 칠판 자리 위에 올린다(태블릿·PC, `cqw` 단위). 휴대폰은 칠판 상자를 따로 보여 준다.
- 시뮬레이션: `?dev-lab=dragon-plaza&plaza=40` 은 4종×10단계 40마리가 모두 앉은 교실이다.
