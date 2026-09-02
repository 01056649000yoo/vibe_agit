# CLAUDE.md

이 저장소의 작업 지침 정본은 **[AGENTS.md](AGENTS.md)** 에 있다(Claude·GPT 등 모델 공통).
세션 시작 훅은 토큰을 아끼기 위해 짧은 **[SESSION_CONTEXT.md](SESSION_CONTEXT.md)** 만 주입하며,
상세 내용은 **[LLM 위키 인덱스](docs/wiki/README.md)** 를 따라 필요한 원문만 읽는다.
Claude도 매 세션 다음 규칙을 따른다:

- **시작 시**: `ROADMAP.md`(계획·현재 위치) + `WORKLOG.md` **최신 항목 몇 개**를 읽고,
  [docs/wiki/PITFALLS.md](docs/wiki/PITFALLS.md)(되풀이하지 말 것)를 훑는다.
  WORKLOG 를 통째로 읽지 않는다 — 지난 달치는 [docs/worklog/](docs/worklog/) 에 있고 `grep` 으로 찾는다.
- **작업 후**: `WORKLOG.md` 맨 위에 항목 추가 + `ROADMAP.md` 체크박스/결정 기록 갱신. git 밖 인프라 변경도 WORKLOG에 남긴다.
- **비밀 값은 문서/로그에 쓰지 않는다** (위치만 참조: `~/agit-supabase/secrets.agit.env`).

상세는 [AGENTS.md](AGENTS.md) 참조.
