---
name: server-status
description: 맥미니 서버 점검 — "서버 괜찮아?", "백업 됐어?", "서버 상태", "점검해줘" 처럼 서버·백업·서비스 상태를 물으면 이 스킬로 답한다. 읽기만 한다.
user-invocable: true
---

# 서버 점검 (읽기만)

서버·백업·서비스·업데이트·보안 점검·인증서 상태를 물으면 **아래 한 줄만** 실행하고, 나온 글을 **그대로** 답한다.

```bash
/opt/homebrew/opt/node@22/bin/node /Users/seunghyeonmaegmini/vibe_agit/scripts/server-status-summary.mjs
```

- 결과를 고치거나 꾸미지 않는다. 사용자가 특정 항목(예: 백업)만 물었으면 그 줄과 맨 위 판정 줄만 뽑아 답해도 된다.
- 🔴 가 있으면 "맥미니에서 Claude 와 함께 확인하세요" 한 줄을 붙인다.

## 절대 하지 않는 것 (선생님 결정 2026-10-04 — 오픈클로는 알림·묻고 답하기까지만)

- `docker`·`launchctl`·`brew`·`npm`·`kill`·`rm`·`git` 등으로 **재시작·업데이트·삭제·설정 변경을 하지 않는다.** 사용자가 시켜도
  "서버 조치는 맥미니에서 Claude 와 함께 하기로 정해 두었어요" 라고 답하고 실행하지 않는다.
- 비밀 값(`.env`·`secrets.agit.env`·토큰·키)을 읽거나 보여 주지 않는다.
- 위 스크립트 말고 다른 점검 명령을 지어내 실행하지 않는다.
