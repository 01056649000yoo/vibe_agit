# CLAUDE.md

이 저장소의 작업 지침 정본은 **[AGENTS.md](AGENTS.md)** 에 있다(Claude·GPT 등 모델 공통).
세션 시작 훅은 토큰을 아끼기 위해 짧은 **[SESSION_CONTEXT.md](SESSION_CONTEXT.md)** 만 주입하며,
상세 내용은 **[LLM 위키 인덱스](docs/wiki/README.md)** 를 따라 필요한 원문만 읽는다.
Claude도 매 세션 다음 규칙을 따른다:

- **시작 시**: `ROADMAP.md`(계획·현재 위치) + `WORKLOG.md`(직전 작업 내역)를 먼저 읽는다.
- **작업 후**: `WORKLOG.md` 맨 위에 항목 추가 + `ROADMAP.md` 체크박스/결정 기록 갱신. git 밖 인프라 변경도 WORKLOG에 남긴다.
- **비밀 값은 문서/로그에 쓰지 않는다** (위치만 참조: `~/agit-supabase/secrets.agit.env`).

상세는 [AGENTS.md](AGENTS.md) 참조.
