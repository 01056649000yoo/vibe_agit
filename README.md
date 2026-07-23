# 끄적끄적 아지트 (vibe_agit)

> ## 🤝 AI 모델 협업 안내 (Claude · GPT 등 — 읽고 시작할 것)
> 이 저장소는 여러 AI 모델이 번갈아 작업합니다. **무엇을 하든 아래 두 파일을 먼저 읽으세요.**
> 1. **[ROADMAP.md](ROADMAP.md)** — 비전, "현재 위치", 진행할 스테이지, 대원칙, 결정 기록
> 2. **[WORKLOG.md](WORKLOG.md)** — 직전까지의 작업·변경·완료 내역 (최신이 위)
>
> **작업을 마치면 반드시** `WORKLOG.md` 맨 위에 항목을 추가하고 `ROADMAP.md`를 갱신하세요.
> git 밖 인프라 변경(맥미니 도커·Caddy·DNS)도 WORKLOG에 남깁니다. 비밀 값은 문서에 쓰지 않습니다.
> 모델 공통 규칙 전체: **[AGENTS.md](AGENTS.md)** (Claude는 [CLAUDE.md](CLAUDE.md)가 이를 가리킴).

초등 글쓰기 통합 플랫폼. React + Vite 프론트 + 자체호스팅 Supabase(맥미니). 2026 여름 이관·고도화 진행 중.

---

## 개발 환경 (React + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
