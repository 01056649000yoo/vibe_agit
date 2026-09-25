# 끄적끄적 아지트 기술·방법론 단어 사전 (Tech & Methodology Glossary)

> **이 문서의 목적**:
> 바이브 코딩(AI 페어 프로그래밍)으로 빠르게 구축된 **끄적끄적 아지트**의 전체 구조와 기술 스택, 코딩 방법론, 보안 체계를 비전공자나 선생님도 한눈에 이해할 수 있도록 알기 쉽게 풀어서 설명한 **종합 기술 사전**입니다.
> 
> 각 항목마다 **① 쉬운 일상 비유**, **② 실제 내 앱 어디에 적용되었는지(파일/경로)**, **③ 어떻게 구현되어 작동하는지**, **④ 왜 이 방법을 썼는지(효과 및 바이브 코딩 팁)**를 구체적으로 정리했습니다.
> 
> *새로운 모듈이나 외부 라이브러리, RPC 함수가 추가되면 `npm run glossary:sync`를 통해 이 문서의 자동 갱신 대기열에 기록됩니다.*

---

## 🗺️ 끄적끄적 아지트 시스템 전체 조감도 (Overview)

학생과 선생님이 브라우저에서 버튼을 누르면 데이터가 어떻게 흐르는지 보여주는 전체 지도입니다.

```
[학생 / 선생님 웹 브라우저 (Chrome, Whale, Safari)]
   │
   │ HTTPS 통신 (도메인: 끄적끄적아지트.site)
   ▼
[맥미니 호스트 (Mac mini M2 - 학교/교실 자율 운영 인프라)]
   │
   ├─► [Caddy 리버스 프록시 (포트 80/443)]
   │     • 자동 SSL 인증서 발급/갱신 (Let's Encrypt)
   │     • 장애 발생 시 자동 점검 화면(Outage Fallback) 안내
   │     │
   │     ├─► 프론트엔드 요청 (/): Docker `agit-app` (Node/Nginx 포트 8300)
   │     │     • React 19 + Vite 7 기반 Single Page Application
   │     │     • 코어 셸 + 학급별 온오프 기능 모듈 (지연 로딩)
   │     │
   │     ├─► 백엔드 API 요청 (/rest/v1, /auth/v1): Docker `agit-kong` (포트 8100)
   │     │     • Supabase Kong API 게이트웨이 (JWT 인증 및 라우팅)
   │     │     │
   │     │     ├─► DB 엔진: Docker `agit-db` (PostgreSQL 17)
   │     │     │     - RLS (행 단위 보안 정책)로 다른 반/남의 글 침범 차단
   │     │     │     - PL/pgSQL RPC 함수 (원자적 비즈니스 로직 및 포인트 처리)
   │     │     │     - 멀티 스키마 분리 (public, samlink, app, writing_helper)
   │     │     │
   │     │     └─► AI/함수 엔진: Docker `agit-functions` (Deno Runtime)
   │     │           - `vibe-ai`: 비동기 댓글 안전 검사 큐, 맞춤법 검사
   │     │           - 사전 로컬 비속어 필터링 후 필요시 OpenAI API 호출
   │     │
   │     └─► 연구소 연동 (/lab): Next.js 기반 연구소 앱과 통합 쿠키 SSO
   │
   ▼
[외부 서비스 연동]
   • Google Cloud OAuth (선생님 구글 원클릭 로그인)
   • OpenAI API (gpt-4o-mini: 초등학생 맞춤형 댓글 안전도 및 글쓰기 검사)
```

---

## 📚 목차 (Categories)

1. [인프라 & 서버 아키텍처 (Infrastructure & Hosting)](#1-인프라--서버-아키텍처-infrastructure--hosting)
2. [데이터베이스 & 백엔드 방법론 (Database & Backend)](#2-데이터베이스--백엔드-방법론-database--backend)
3. [프론트엔드 & 리액트 코딩 기법 (Frontend & React Patterns)](#3-프론트엔드--리액트-코딩-기법-frontend--react-patterns)
4. [보안 & 인증 설계 (Security & Authorization)](#4-보안--인증-설계-security--authorization)
5. [성능 최적화 & 1,000명 하네스 (Performance & Scaling Harness)](#5-성능-최적화--1000명-하네스-performance--scaling-harness)
6. [AI 파이프라인 & 비용 절감 (AI Engine & Cost Optimization)](#6-ai-파이프라인--비용-절감-ai-engine--cost-optimization)
7. [테스트 & 품질 보증 (Testing & QA Harness)](#7-테스트--품질-보증-testing--qa-harness)
8. [바이브 코딩 핵심 방법론 (Vibe Coding Principles)](#8-바이브-코딩-핵심-방법론-vibe-coding-principles)
9. [신규 감지된 기술/모듈 자동 등록 대기열 (Auto-Sync Queue)](#9-신규-감지된-기술모듈-자동-등록-대기열-auto-sync-queue)

---

## 1. 인프라 & 서버 아키텍처 (Infrastructure & Hosting)

### 1.1 셀프 호스팅 (Self-hosting)
* **💡 쉬운 비유**: 비싼 월세를 내며 남의 건물(AWS, 클라우드)을 빌려 쓰는 대신, 내가 직접 산 컴퓨터(맥미니)에 매장을 차려 독립적으로 운영하는 방식입니다.
* **🏗️ 적용 위치**: 교실/연구실에 설치된 **Mac mini M2** 하드웨어.
* **⚙️ 구현 방법**: 맥미니 컴퓨터 위에 macOS, Docker, Caddy를 직접 설치하여 24시간 쉬지 않고 웹 서버와 DB를 자체 운영합니다.
* **🎯 왜 썼는가? (효과)**:
  * 매달 나가는 클라우드 서버 비용(수십~수백만 원)이 **0원**이 됩니다.
  * 학생들의 소중한 글과 일기 데이터가 외부 해외 클라우드가 아닌 우리 손 안의 하드웨어에 안전하게 보관됩니다.

### 1.2 도커 & 도커 컴포즈 (Docker & Docker Compose)
* **💡 쉬운 비유**: 이사 갈 때 가구와 짐을 규격화된 컨테이너 박스에 깔끔하게 넣어두면, 어떤 배나 트럭에 실어도 내용물 그대로 똑같이 작동하게 해주는 소프트웨어 포장 상자입니다.
* **🏗️ 적용 위치**: `~/agit-supabase/docker-compose.yml`, `docker-compose.pg17.yml`, `docker-compose.agit.yml`
* **⚙️ 구현 방법**:
  * 데이터베이스, 웹 서버, API 게이트웨이 등을 각각 독립된 컨테이너로 격리하여 띄웁니다.
  * 우리 앱은 설정 누락을 막기 위해 **3개 컴포즈 파일**(`기본 + PG17 + 아지트 전용 포트/시크릿`)이 항상 결합되어 구동되도록 환경변수(`COMPOSE_FILE`)로 묶어두었습니다.
* **🎯 왜 썼는가? (효과)**:
  * 맥미니의 OS가 업데이트되거나 다른 컴퓨터로 서버를 옮겨도 명령어 한 줄(`docker compose up -d`)이면 1분 만에 동일한 환경으로 완벽히 복구됩니다.

### 1.3 Caddy 리버스 프록시 (Reverse Proxy)
* **💡 쉬운 비유**: 건물의 **안내 데스크(로비 안내원)**입니다. 밖에서 손님이 "선생님 방 어디예요?" 하고 찾아오면, 손님이 내부 사정을 몰라도 알맞은 방(프론트엔드 포트 8300, API 포트 8100 등)으로 직접 안내해 줍니다.
* **🏗️ 적용 위치**: `/etc/caddy/Caddyfile`, [docs/OUTAGE_PLAN.md](file:///Users/seunghyeonmaegmini/vibe_agit/docs/OUTAGE_PLAN.md)
* **⚙️ 구현 방법**:
  * 인터넷에서 들어오는 `https://끄적끄적아지트.site` 요청을 받아 내부 도커 앱(`127.0.0.1:8300`)으로 연결합니다.
  * 무료 보안 인증서(HTTPS/SSL)를 자동으로 발급받고 알아서 갱신합니다.
  * 만약 내부 도커 컨테이너가 점검 중이거나 꺼져 있으면 Caddy가 감지하여 예쁜 "시스템 점검 중 안내 화면"([docs/OUTAGE_PLAN.md](file:///Users/seunghyeonmaegmini/vibe_agit/docs/OUTAGE_PLAN.md))을 즉시 띄웁니다.

### 1.4 API 게이트웨이 - Kong (API Gateway)
* **💡 쉬운 비유**: 공항의 **출입국 심사대**입니다. 데이터베이스에 직접 접근하려는 모든 요청의 신분증(JWT 토큰)을 검사하고 통과한 사람만 안전하게 들여보냅니다.
* **🏗️ 적용 위치**: Docker 컨테이너 `agit-kong` (내부 포트 8100)
* **⚙️ 구현 방법**: Supabase의 모든 DB 요청(`POST /rest/v1/...`)과 함수 호출(`POST /functions/v1/...`)이 Kong을 통과합니다.

### 1.5 Supavisor 커넥션 풀러 (Connection Pooler)
* **💡 쉬운 비유**: 은행 창구의 **번호표 시스템**입니다. 손님 1,000명이 한꺼번에 몰려와 은행원에게 동시에 말을 걸면 은행이 마비되므로, 창구 직원(DB 커넥션) 몇 명이 번호표 순서대로 빠르고 효율적으로 손님을 처리하도록 중계합니다.
* **🏗️ 적용 위치**: Docker profile `pooler` (Supavisor)
* **⚙️ 구현 방법**: 학생 수백 명이 동시에 접속해도 DB 연결 개수가 폭증해 PostgreSQL 서버가 다운되는 사태를 막아줍니다.

---

## 2. 데이터베이스 & 백엔드 방법론 (Database & Backend)

### 2.1 PostgreSQL 17 (관계형 데이터베이스)
* **💡 쉬운 비유**: 세상에서 가장 강력하고 믿을 수 있는 **디지털 금고 및 장부 시스템**입니다. 학생, 글, 댓글, 포인트 장부가 표(테이블) 형태로 정교하게 연결되어 저장됩니다.
* **🏗️ 적용 위치**: Docker 컨테이너 `agit-db` (PG17 엔진)
* **⚙️ 구현 방법**: 최신 PostgreSQL 17 엔진을 채택하여 쿼리 처리 속도를 극대화하고 메모리 효율을 높였습니다.

### 2.2 RLS (Row Level Security - 행 단위 보안 정책)
* **💡 쉬운 비유**: 아파트 사물함에 **각자의 지문 인식 자물쇠**를 채우는 것입니다. 같은 사물함 방에 들어가더라도 내 지문으로 열리는 칸의 우편물만 볼 수 있고, 옆 반 친구의 사물함은 투명인간처럼 보이지도 열리지도 않습니다.
* **🏗️ 적용 위치**: 모든 DB 테이블 (`public.student_posts`, `public.post_comments`, `public.students` 등)
* **⚙️ 구현 방법**:
  ```sql
  -- 예: 내 학급 글만 읽을 수 있는 RLS 정책
  CREATE POLICY "학급 학생만 글 읽기" ON public.student_posts
    FOR SELECT USING (class_id = (SELECT class_id FROM public.students WHERE auth_id = auth.uid()));
  ```
* **🎯 왜 썼는가? (효과)**:
  * 프론트엔드 개발자가 실수로 필터 코드를 빠뜨리더라도, 데이터베이스 엔진 자체에서 "너는 3반 학생이니 4반 글은 1건도 넘겨주지 않겠다"고 원천 차단하므로 개인정보 유출이 원천 방지됩니다.

### 2.3 RPC (Remote Procedure Call - 원격 프로시저 호출)
* **💡 쉬운 비유**: 식당에서 손님이 주방에 들어가서 고기 굽고 밥 푸는 게 아니라, 카운터에 **"1번 세트 메뉴 주세요!"**라고 주문서만 넣으면 주방 안에서 요리사가 완벽히 조리해서 완제품 한 접시로 내어주는 방식입니다.
* **🏗️ 적용 위치**: `supabase/migrations/` 내 모든 `CREATE FUNCTION public.xxx_v1()`
* **⚙️ 구현 방법**:
  * 프론트엔드가 DB 테이블을 이것저것 직접 수정하지 않고, `supabase.rpc('create_my_post_comment_v1', { p_post_id, p_content })` 단 한 번만 부릅니다.
  * DB 내부에서 ①학생 인증 확인 ②글자수(8~200자) 검증 ③댓글 INSERT ④알림 큐 등록 ⑤응답 JSON 생성을 0.001초 만에 일괄 처리합니다.
* **🎯 왜 썼는가? (효과)**:
  * 브라우저와 서버 사이의 통신 횟수가 5번에서 1번으로 줄어들어 속도가 극도로 빨라집니다.
  * 학생이 브라우저 개발자 도구를 켜서 포인트를 조작하려는 부정행위를 100% 차단합니다.

### 2.4 SECURITY DEFINER vs SECURITY INVOKER
* **💡 쉬운 비유**:
  * **SECURITY INVOKER**: 학생 신분증을 그대로 들고 도서관에 들어가는 것 (학생 권한만큼만 서가에 접근 가능).
  * **SECURITY DEFINER**: 학생이 요청하면, **관리자(사서 선생님)의 마스터키**를 잠깐 빌려 관리자 권한으로 특정 작업(예: 포인트 지급 장부 기록)을 안전하게 대신 실행해 주는 특수 함수입니다.
* **🏗️ 적용 위치**: 포인트 적립 RPC, 댓글 안전도 승인 RPC 등
* **⚙️ 주의점 & 보안 규칙**:
  * SECURITY DEFINER 함수는 무소불위의 권한을 가지므로, 반드시 함수 시작 부분에 `SET search_path TO 'public'`을 걸어 경로 하이재킹 공격을 막고, `auth.uid()` 검증을 거쳐야 합니다.

### 2.5 DB 트랜잭션 (BEGIN - COMMIT - ROLLBACK)
* **💡 쉬운 비유**: 은행 계좌 이체입니다. 내 통장에서 1만 원이 빠져나가는 것과 상대방 통장에 1만 원이 입금되는 것은 **"둘 다 성공하거나, 둘 다 취소되어야"** 합니다. 중간에 전기가 나가도 내 돈만 사라지는 일은 없어야 합니다.
* **🏗️ 적용 위치**: 모든 마이그레이션 파일(`BEGIN; ... COMMIT;`), 글 제출 및 포인트 적립 함수 내부.
* **⚙️ 구현 방법**: 처리 도중 단 하나라도 에러가 발생하면 DB가 `ROLLBACK`하여 이전 상태로 깨끗이 되돌립니다.

### 2.6 DB 마이그레이션 & 롤백 스모크 테스트 (Migration & Rollback Smoke)
* **💡 쉬운 비유**: 비행기에 승객을 태우기 전, 활주로에서 엔진을 시험 가동해보고 이상이 생기면 즉시 출발 전 상태로 리셋해보는 **사전 안전 시뮬레이션**입니다.
* **🏗️ 적용 위치**: `supabase/migrations/*.sql`, `tests/sql/*.smoke.sql`, `scripts/check-migrations.mjs`
* **⚙️ 구현 방법**:
  * DB 스키마나 함수를 바꿀 때 날짜 번호가 붙은 파일(예: `20261351_comment_max_chars_200.sql`)을 작성합니다.
  * `npm run migrate:check` 명령을 실행하면 실제 DB 복제본 위에서 트랜잭션을 열고 스모크 테스트를 실행한 뒤, 100% 완벽히 롤백되는지 자동 검증합니다.
* **🎯 왜 썼는가? (효과)**:
  * 배포 중 DB 문법 에러나 권한 에러로 서비스가 멈추는 대형 사고를 배포 전에 방지합니다.

### 2.7 스키마 격리 (Schema Isolation)
* **💡 쉬운 비유**: 큰 냉장고 안에서 반찬 칸, 신선실, 냉동실을 플라스틱 칸막이로 완전히 나눠 음식 냄새가 섞이지 않게 하는 것입니다.
* **🏗️ 적용 위치**: PostgreSQL 내 `public`(아지트 본체), `samlink`(샘링크 연동), `app`(자비스 앱), `writing_helper`(연구소)
* **⚙️ 구현 방법**: 하나의 DB 엔진 안에서 서로 다른 서비스들이 테이블 이름 충돌 없이 완전히 독립된 영역에서 동작합니다.

---

## 3. 프론트엔드 & 리액트 코딩 기법 (Frontend & React Patterns)

### 3.1 React 19 & Vite 7 (모던 컴포넌트 프레임워크 & 고속 번들러)
* **💡 쉬운 비유**: 레고 블록(컴포넌트)을 조립하여 완성품 화면을 만드는 최신 조립 시스템(React 19)과, 변경 사항을 0.05초 만에 빛의 속도로 화면에 조립해 보여주는 초고속 작업대(Vite 7)입니다.
* **🏗️ 적용 위치**: `src/App.jsx`, `vite.config.js`, `package.json`
* **⚙️ 구현 방법**: 페이지 전체를 새로고침하지 않고 바뀐 부분의 DOM만 똑똑하게 교체하여 부드러운 앱 경험을 제공합니다.

### 3.2 코어 셸 (Core Shell) vs 기능 모듈 (Feature Module)
* **💡 쉬운 비유**: 스마트폰의 **운영체제(iOS/Android)**와 **앱스토어 앱(카카오톡, 게임)**의 관계입니다. 스마트폰 본체(코어 셸)는 항상 켜져 있고 안전해야 하며, 카카오톡이나 게임(기능 모듈)은 원할 때 깔거나 끌 수 있습니다.
* **🏗️ 적용 위치**:
  * **코어 셸**: 학생 인증, 기본 글쓰기 에디터([StudentWriting.jsx](file:///Users/seunghyeonmaegmini/vibe_agit/src/components/student/StudentWriting.jsx)), 포인트 엔진([src/modules/points/](file:///Users/seunghyeonmaegmini/vibe_agit/src/modules/points/))
  * **기능 모듈**: 드래곤 키우기, 어휘의 탑, 학급 문집 2.5D 전시관([src/modules/](file:///Users/seunghyeonmaegmini/vibe_agit/src/modules/))
* **🎯 불변 규칙 (판정 기준)**:
  * *"이 기능이 꺼지면 국어 글쓰기 수업이 중단되는가?"* → Yes면 코어 셸, No면 모듈!
  * 선생님이 학급 설정에서 게임을 끄더라도 학생 글쓰기 수업은 아무런 영향 없이 100% 정상 작동합니다.

### 3.3 선언적 모듈 레지스트리 (Module Registry & Manifest)
* **💡 쉬운 비유**: 플러그 앤 플레이(Plug & Play) 콘센트입니다. 새 게임이나 글쓰기 도구를 만들었을 때, 메인 코드를 어지럽히지 않고 자기 소개서(`manifest.js`) 한 장만 레지스트리에 꽂아 넣으면 메인 메뉴에 자동으로 등록됩니다.
* **🏗️ 적용 위치**: [src/modules/registry.js](file:///Users/seunghyeonmaegmini/vibe_agit/src/modules/registry.js), 각 모듈 내 `manifest.js`
* **⚙️ 구현 방법**:
  ```javascript
  // manifest.js 예시
  export default {
    id: 'vocab-tower',
    name: '어휘의 탑',
    studentEntry: lazy(() => import('./StudentEntry.jsx')),
    teacherEntry: lazy(() => import('./TeacherEntry.jsx')),
    performance: { homeSummary: false, writesViaRpc: true }
  };
  ```

### 3.4 Zustand (경량 전역 상태 관리)
* **💡 쉬운 비유**: 학급 게시판의 **중앙 알림판**입니다. "현재 로그인한 학생이 누구인지", "읽지 않은 알림이 몇 개인지"를 알림판에 적어두면, 1층 교실이든 3층 도서관이든 누구나 손쉽게 확인하고 업데이트할 수 있습니다.
* **🏗️ 적용 위치**: `src/store/useAuthStore.js`, `src/store/useNotificationStore.js`
* **⚙️ 왜 썼는가? (효과)**:
  * 과거의 복잡한 Redux 대신 불필요한 코드 없이 매우 가볍고 빠르며, 컴포넌트 간 데이터 전달이 꼬이지 않습니다.

### 3.5 커스텀 훅 (Custom Hook / 관심사 분리)
* **💡 쉬운 비유**: 자동차의 **엔진 룸**과 **운전석 대시보드**의 분리입니다. 운전자는 운전대와 페달(UI 화면)에만 집중하고, 복잡한 연료 분사와 모터 제어(데이터 로직)는 엔진 룸의 전용 부품(커스텀 훅)이 알아서 처리합니다.
* **🏗️ 적용 위치**:
  * [src/hooks/usePostInteractions.js](file:///Users/seunghyeonmaegmini/vibe_agit/src/hooks/usePostInteractions.js): 댓글 작성, 유효성 검사, 수정, 삭제 처리 로직 전담.
  * `src/hooks/useStudentHome.js`: 학생 홈 화면 데이터 조회 및 동기화 전담.

### 3.6 지연 로딩 (Lazy Loading & Dynamic Import)
* **💡 쉬운 비유**: 뷔페 식당에서 100가지 음식을 한 번에 식탁에 다 가져다 놓으면 식탁이 부러지므로, 손님이 디저트 코너에 갔을 때 비로소 케이크를 신선하게 꺼내오는 방식입니다.
* **🏗️ 적용 위치**: `React.lazy()`, `import()`를 사용한 모든 하위 모듈과 모달창.
* **🎯 왜 썼는가? (효과)**:
  * 처음 앱을 켤 때 게임이나 관리자 페이지 코드까지 한꺼번에 다운로드하지 않으므로, 스마트폰이나 교실 태블릿에서 초기 로딩 속도가 3배 이상 빨라집니다.

### 3.7 주요 프론트엔드 라이브러리 생태계 (Frontend Libraries)
* **`@supabase/supabase-js` & `@supabase/ssr`**:
  * **💡 쉬운 비유**: 프론트엔드와 Supabase 백엔드 간의 **초고속 직통 전화선**입니다.
  * **🏗️ 적용 위치**: `src/lib/supabaseClient.js`, 인증 및 RPC 통신 전반.
  * **⚙️ 작동**: 브라우저와 SSR 서버 환경에서 JWT 세션을 유지하고, 테이블 쿼리와 보안 RPC를 단 몇 줄로 안전하게 호출합니다.
* **`framer-motion`**:
  * **💡 쉬운 비유**: 만화책에 생명을 불어넣는 **애니메이션 스튜디오**입니다.
  * **🏗️ 적용 위치**: 드래곤 인터랙션, 모달창 팝업, 축하 카드 애니메이션.
  * **⚙️ 작동**: 저사양 교실 태블릿에서도 끊김 없는 60fps 부드러운 화면 전환과 마이크로 인터랙션을 구현합니다.
* **`lucide-react`**:
  * **💡 쉬운 비유**: 모든 화면에서 동일한 감성을 주는 **규격화된 그래픽 표지판(아이콘)** 세트입니다.
  * **🏗️ 적용 위치**: [GuideInfoButton.jsx](file:///Users/seunghyeonmaegmini/vibe_agit/src/components/common/GuideInfoButton.jsx), 내비게이션 바, 액션 버튼.
* **`write-excel-file`**:
  * **💡 쉬운 비유**: 무거운 서버를 거치지 않고 **브라우저 안에서 즉석 인쇄되는 엑셀 프린터**입니다.
  * **🏗️ 적용 위치**: 학생 글 목록 엑셀 내보내기, 독서록 엑셀 다운로드.
  * **⚙️ 작동**: 수백 건의 글과 감상평 데이터를 서버 부하 0으로 브라우저 메모리에서 순식간에 `.xlsx` 파일로 변환합니다.
* **`canvas-confetti`**:
  * **💡 쉬운 비유**: 미션 완수 때 하늘에서 터지는 **오색 꽃가루 축포**입니다.
  * **🏗️ 적용 위치**: 글쓰기 제출 완료, 레벨업 및 보상 획득 화면.
* **`qrcode`**:
  * **💡 쉬운 비유**: 학급 아지트와 문집으로 바로 통하는 **디지털 문패(QR 코드)**입니다.
  * **🏗️ 적용 위치**: 학급 초대 코드 생성, 학급 문집/전시관 공유 URL 팝업.

### 3.8 핵심 기능 모듈 도메인 (Feature Module Domains in src/modules/)
* **`class-agit` (우리반 글 2.5D 전시관 & 학급 문집 출판)**:
  * **🏗️ 위치**: `src/modules/class-agit/` (`gallery`, `anthology`, `selection`, `api`)
  * **⚙️ 작동**: 학생들의 글을 메타버스 느낌의 2.5D 입체 갤러리로 꾸며 감상하고, 학기 말에는 실제 인쇄용 A4 PDF 문집으로 원클릭 편집/출판합니다.
* **`community` (친구 아지트 & 이웃 아지트)**:
  * **🏗️ 위치**: `src/modules/community/` (`friends-hideout`, `neighbor-agit`)
  * **⚙️ 작동**: 우리 반 친구들의 최신 글을 모아보는 학급 소셜 피드(`friends-hideout`)와, 다른 학교/학급과 코드로 연결되어 글을 상호 교류하는 연합 플랫폼(`neighbor-agit`)을 제공합니다.
* **`game` (드래곤 기르기 & 어휘의 탑)**:
  * **🏗️ 위치**: `src/modules/game/` (`dragon`, `vocab-tower`, `legacy`)
  * **⚙️ 작동**: 글을 쓰면 드래곤이 알에서 깨어나 진화하고, 초등 국어 필수 어휘를 퀴즈로 정복하는 학습 게이미피케이션 엔진입니다.
* **`tool` (전체 화면 학급 활동 도구함)**:
  * **🏗️ 위치**: `src/modules/tool/` (`class-board`, `class-notice`, `classroom-arrangement`, `meal-board`)
  * **⚙️ 작동**: 전자칠판용 스마트 대시보드(시계, 타이머, 공지), 오늘 급식 메뉴판, 학생 자리 배치 도구를 풀스크린 모달로 제공합니다.
* **`writing` (풍부한 글쓰기 파이프라인 & 발자국)**:
  * **🏗️ 위치**: `src/modules/writing/` (`diary`, `reading-log`, `spelling-learning`, `writing-footprint`, `idea-market`, `reactions`, `policy`, `evaluation` 등)
  * **⚙️ 작동**: 일기, 독서록/독서마라톤, 생각 시장, 성취기준 기반 국어과 평어 생성, 한 학기 성장 포트폴리오(글쓰기 발자국)를 모두 아우릅니다.

---

## 4. 보안 & 인증 설계 (Security & Authorization)

### 4.1 JWT (JSON Web Token) & `auth.uid()`
* **💡 쉬운 비유**: 워터파크에서 손목에 차는 **위조 불가능한 암호화 방수 팔찌**입니다. 팔찌 안에 "이 학생은 3반 김철수"라는 서명이 들어있어 매번 로그인하지 않아도 내가 누구인지 증명합니다.
* **🏗️ 적용 위치**: 모든 Supabase API 호출 헤더(`Bearer <token>`), DB 내부 `auth.uid()`
* **⚙️ 구현 방법**: 클라이언트가 변조할 수 없는 암호화된 토큰에서 사용자의 고유 ID(`auth.uid()`)를 DB가 직접 추출하여 권한을 판정합니다.

### 4.2 SSO (Single Sign-On / 통합 로그인) & Root Cookie
* **💡 쉬운 비유**: 롯데월드 자유이용권 하나로 어드벤처와 매직아일랜드를 모두 자유롭게 드나드는 것입니다.
* **🏗️ 적용 위치**: 아지트 본체와 아지트 연구소(`/lab`) 간의 세션 연동.
* **⚙️ 구현 방법**:
  * `sb-agit-auth-token`이라는 이름의 도메인 공용 쿠키(`Path=/`, `SameSite=Lax`)를 사용하여, 아지트에 로그인한 선생님이 연구소 메뉴로 이동해도 재로그인할 필요 없이 매끄럽게 연결됩니다.

### 4.3 3단계 역할 기반 권한 분리 (Role-based Access Control)
* **💡 쉬운 비유**: 학교 건물의 마스터키 등급 (학생 열쇠 / 담임교사 열쇠 / 교장선생님 마스터키)입니다.
* **🏗️ 적용 위치**: DB 함수 `public.auth_user_role()`, `classes` 및 `teachers` 테이블.
* **⚙️ 권한 체계**:
  1. **학생 (student)**: 자기 반 글 열람, 자기 글 쓰기, 내 댓글 관리. 남의 글 수정/삭제 절대 불가.
  2. **교사 (teacher)**: 자기 학급 학생 승인, 과제 출제, 학급 글 검토/피드백, 학급 문집 제작.
  3. **관리자 (admin)**: 플랫폼 전반 모니터링, 어휘 사전 승인, 이웃 아지트 롤아웃 관리.

### 4.4 레이트 리밋 (Rate Limiting) & 일일 쿼터 (Daily Quota)
* **💡 쉬운 비유**: 놀이공원의 패스트트랙 탑승권 하루 5회 제한입니다. 특정 학생이 버튼을 매크로로 연타하여 서버를 마비시키는 것을 방지합니다.
* **🏗️ 적용 위치**: `consume_comment_review_quota_v1(student_id)`
* **⚙️ 구현 방법**: 하루에 한 학생이 요청할 수 있는 AI 검사 횟수 및 댓글 작성 횟수에 안전 상한을 두어 DB 부하와 AI 비용 폭증을 방어합니다.

### 4.5 SQL Injection 방지
* **💡 쉬운 비유**: 편지 봉투 안에 편지만 넣어야 하는데, 편지에 "금고 문 열어라"라는 최면 주문을 적어 넣는 해킹 수법을 완벽히 차단하는 것입니다.
* **🏗️ 적용 위치**: 모든 RPC 매개변수 바인딩, `SET search_path TO 'public'`
* **⚙️ 구현 방법**: SQL 문을 문자열 더하기(`+`)로 합치지 않고, 매개변수화된 쿼리(`$1, $2`)를 사용하여 악의적인 입력도 단순 텍스트로 안전하게 처리합니다.

---

## 5. 성능 최적화 & 1,000명 하네스 (Performance & Scaling Harness)

교내 학생 1,000명이 동시에 접속해도 맥미니 서버가 지치지 않도록 설계된 엄격한 성능 규칙입니다.

### 5.1 공용 홈 부트스트랩 (Bootstrap Pattern)
* **💡 쉬운 비유**: 아침 등교 때 교문에서 학생들에게 **"오늘의 알림장, 시간표, 급식 메뉴"가 한 장에 인쇄된 종합 유인물**을 한 번에 나눠주는 것입니다.
* **🏗️ 적용 위치**: `public.get_student_home_bootstrap_v1`
* **⚙️ 구현 방법**:
  * 학생 홈 화면을 열 때 `students`, `classes`, `posts`, `notifications`, `titles` 테이블을 5번 따로 쿼리하지 않습니다.
  * 서버에서 이 모든 정보를 단 1개의 최적화된 JSON 응답으로 묶어 내려줍니다.
* **🎯 왜 썼는가? (효과)**: 1,000명이 접속해도 DB 요청 수가 5,000건에서 1,000건으로 80% 격감합니다.

### 5.2 N+1 문제 해결 (Batch Query & Aggregate)
* **💡 쉬운 비유**: 배달 기사님이 피자 30판을 배달할 때, 30번을 왔다 갔다 하는 게 아니라 큰 배달 가방에 30판을 한 번에 싣고 배달하는 방식입니다.
* **🏗️ 적용 위치**: 게시글 목록 조회 시 댓글 개수 및 좋아요 집계 쿼리.
* **⚙️ 구현 방법**: 글 20개를 가져온 뒤 각 글마다 댓글 수를 20번 쿼리하지 않고, `LEFT JOIN`과 `COUNT()` 집계 또는 CTE를 활용하여 한 번의 쿼리로 결합해 가져옵니다.

### 5.3 인메모리 캐싱 & TTL (In-Memory Cache & Time-To-Live)
* **💡 쉬운 비유**: 자주 묻는 질문(FAQ)의 답변을 교탁 위 메모지에 적어두고 5분 동안은 메모지만 보고 즉시 대답해 주는 것입니다.
* **🏗️ 적용 위치**: [src/lib/cache.js](file:///Users/seunghyeonmaegmini/vibe_agit/src/lib/cache.js) (`dataCache`, `classKey`)
* **⚙️ 구현 방법**: 자주 바뀌지 않는 학급 공지사항이나 학급 설정은 한 번 읽어온 뒤 메모리에 보관하며, 정해진 유효시간(TTL: 예 5분)이 지나기 전에는 DB를 다시 두드리지 않습니다.

### 5.4 웹소켓 대신 지연 분산 폴링 (Polling with Jitter)
* **💡 쉬운 비유**: 선생님과 학생 1,000명이 계속 전화를 끊지 않고 통화 중(웹소켓 상시 연결)이면 전화 교환국이 폭발하므로, 필요할 때만 1분~2분 간격으로 번갈아 가며 무전(HTTP)을 치는 방식입니다.
* **🏗️ 적용 위치**: [PERFORMANCE_HARNESS.md](file:///Users/seunghyeonmaegmini/vibe_agit/PERFORMANCE_HARNESS.md), `usePostInteractions.js`
* **⚙️ 구현 방법**:
  * 상시 웹소켓 연결을 기본 차단하고, 수신 주기에 무작위 시간(Jitter)을 섞어 1,000대의 기기가 정각에 동시에 서버를 때리는 '공명 현상(Thundering Herd)'을 방지합니다.

---

## 6. AI 파이프라인 & 비용 절감 (AI Engine & Cost Optimization)

### 6.1 Edge Function - vibe-ai (Deno 기반 서버리스)
* **💡 쉬운 비유**: 식당 주방 옆에 붙어 있는 **AI 전용 검사실**입니다. 학생이 글이나 댓글을 쓰면 AI 보안관이 독립된 방에서 안전 검사를 신속하게 수행합니다.
* **🏗️ 적용 위치**: `supabase/functions/vibe-ai/index.ts`
* **⚙️ 구현 방법**: Deno 런타임 환경에서 초고속으로 기동하며, OpenAI API 키를 브라우저에 절대 노출하지 않고 서버 사이드에서 안전하게 호출합니다.

### 6.2 비동기 대기열 & 임대 토큰 (Queue & Lease Token)
* **💡 쉬운 비유**: 놀이공원의 **줄서기 번호표와 타이머**입니다. AI 검사 요청이 폭주해도 서버가 죽지 않고 대기열(Queue)에 담아 3개씩 차례대로 검사합니다.
* **🏗️ 적용 위치**: `post_comments.ai_review_token`, `ai_review_lease_until`
* **⚙️ 구현 방법**:
  * 댓글이 작성되면 일단 `pending` 상태로 큐에 들어갑니다.
  * 워커가 댓글을 집어갈 때 임대 토큰(`lease_token`)을 부여하고 20초간 잠급니다(`FOR UPDATE SKIP LOCKED`).
  * 만약 AI 서버 응답이 지연되어도 다른 워커와 작업이 중복되지 않도록 완벽히 방어합니다.

### 6.3 사전 로컬 비속어 필터링 (Local Rule-based Filter - 비용 0원 절감)
* **💡 쉬운 비유**: 입구의 **자동 금속 탐지기**입니다. 명백한 위험물(비속어/욕설)은 비싼 감정사(OpenAI)를 부를 필요도 없이 입구 탐지기에서 즉시 삐- 소리를 내며 돌려보냅니다.
* **🏗️ 적용 위치**: [vibe-ai/index.ts](file:///Users/seunghyeonmaegmini/vibe_agit/supabase/functions/vibe-ai/index.ts#L73-L108)의 `INAPPROPRIATE_WORDS`
* **⚙️ 구현 방법**:
  * 욕설, 비하어, 패드립, 초성 욕설(`ㅅㅂ`, `ㅂㅅ` 등)을 로컬 정규식으로 먼저 검사합니다.
  * 비속어 감지 시 OpenAI 호출을 건너뛰고(`0원`), 다정한 교육용 안내 문구를 학생에게 즉각 전달합니다.

### 6.4 결정론적 AI (Deterministic AI) & 글자수 슬라이스
* **💡 쉬운 비유**: AI에게 "시적인 영감을 발휘해 자유롭게 상상해봐"라고 하지 않고, "이 기준표에 맞춰 객관식 채점관처럼 0 또는 1로만 딱 떨어지게 판정해"라고 지시하는 것입니다.
* **🏗️ 적용 위치**: `vibe-ai`의 `temperature: 0`, `maxOutputTokens: 100`, `slice(0, 200)`
* **🎯 왜 썼는가? (효과)**:
  * 같은 댓글에 대해 AI의 판정이 이랬다저랬다 바뀌지 않습니다.
  * 불필요한 장문 응답을 차단하여 토큰 비용과 대기 시간을 최소화합니다.

---

## 7. 테스트 & 품질 보증 (Testing & QA Harness)

### 7.1 Node.js 내장 테스트 러너 (`node --test`)
* **💡 쉬운 비유**: 복잡하고 무거운 외부 검사 장비(Jest 등)를 덕지덕지 달지 않고, 순정 엔진(Node.js 기본 기능) 자체로 1,300개 이상의 검사를 10초 만에 번개처럼 통과시키는 초경량 검사기입니다.
* **🏗️ 적용 위치**: `tests/*.test.mjs`, `package.json`의 `npm run test:all`
* **⚙️ 구현 방법**: `import test from 'node:test'`, `import assert from 'node:assert/strict'`를 사용하여 외부 의존성 없이 빠르고 안정적으로 실행됩니다.

### 7.2 아키텍처 회귀 방지 테스트 (`npm run test:architecture`)
* **💡 쉬운 비유**: 건물을 증축할 때 기둥이나 대들보를 건드리면 울리는 **안전 경보 시스템**입니다.
* **🏗️ 적용 위치**: `tests/performanceArchitecture.test.mjs`, `tests/securityArchitecture.test.mjs`
* **⚙️ 구현 방법**:
  * 누군가 실수로 학생 홈에 무거운 `SELECT *` 쿼리를 넣거나, WebSocket 연결을 몰래 열거나, 200자 상한을 깨뜨리는 코드를 작성하면 빌드 단계에서 즉시 빨간불을 켜며 배포를 중단시킵니다.

### 7.3 자동 체크리스트 스크립트 (`npm run checklist`)
* **💡 쉬운 비유**: 우주선 발사 5분 전 조종사가 체크리스트 판을 들고 "산소 밸브 열렸나? 통신 확인됐나?" 하나씩 소리 내어 확인하는 절차입니다.
* **🏗️ 적용 위치**: [scripts/checklist.mjs](file:///Users/seunghyeonmaegmini/vibe_agit/scripts/checklist.mjs)
* **⚙️ 구현 방법**: 마이그레이션 적용 여부, 고친 파일을 참조하는 다른 화면이 누락되지 않았는지 자동으로 대조하여 터미널에 짚어줍니다.

---

## 8. 바이브 코딩 핵심 방법론 (Vibe Coding Principles)

AI와 함께 코딩하면서도 시스템이 붕괴되지 않고 거대한 엔터프라이즈급 안정성을 유지할 수 있었던 **끄적끄적 아지트의 5대 원칙**입니다.

1. **정본 단일화 원칙 (Single Source of Truth)**:
   * 같은 상수나 규칙(예: 작가 레벨 점수, 댓글 금칙어 기준)을 여러 파일에 복사-붙여넣기 하지 않고 반드시 **단 한 곳의 파일에 원본을 두고 import**하여 사용합니다.
2. **모듈화 + 기본 OFF (Modularization & Default OFF)**:
   * 새로운 기능(신규 게임, 신규 도구)을 추가할 때 메인 코드를 수정하지 않고 새 폴더에 모듈로 만든 뒤, 교사가 켤 때만 켜지도록 설계하여 기존 시스템의 안전을 보장합니다.
3. **연구소 코드 이식 금지 (No Code Duplication)**:
   * 다른 앱(연구소 등)의 코드를 통째로 복사해 오지 않고, 오직 표준 RPC 데이터 연동 인터페이스로만 대화합니다.
4. **멱등성 (Idempotency) & Event Key**:
   * 네트워크 렉으로 학생이 '제출' 버튼을 따닥- 두 번 연타해도 글이 두 번 올라가거나 포인트가 2배로 지급되지 않도록 고유 이벤트 키(`event_key`)로 중복을 방지합니다.
5. **안전한 로컬 반복 후 한 번만 배포 (Local-First Iteration)**:
   * 코드를 수정할 때마다 원격에 배포하지 않고, 로컬 스모크 테스트와 단위 테스트로 100% 검증을 마친 뒤 사용자의 명시적 승인 하에 단 한 번만 배포합니다.

---

## 9. 신규 감지된 기술/모듈 자동 등록 대기열 (Auto-Sync Queue)

> 이 섹션은 `scripts/sync-tech-glossary.mjs` 스크립트가 실행될 때, 코드베이스에서 새로 추가된 라이브러리(`package.json`), 신규 기능 모듈(`src/modules/`), 신규 마이그레이션 RPC를 자동 감지하여 아래 목록에 동기화합니다.
> 
> *수동으로 새 항목을 위 사전 본문으로 옮겨 설명을 채워 넣으실 수 있습니다.*

<!-- AUTO_SYNC_START -->

> 💡 아래 항목들은 최근 코드베이스에 새로 도입되었으나 아직 사전 본문 해설에 포함되지 않은 기술/모듈입니다. (감지일: 2026-09-25)
> 위 본문 적절한 카테고리로 내용을 옮겨 ① 쉬운 비유, ② 적용 위치, ③ 작동 원리, ④ 도입 이유를 작성해 주세요.

### 📌 [신규 감지] @supabase/ssr (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] @supabase/supabase-js (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] canvas-confetti (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] framer-motion (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] lucide-react (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] qrcode (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] react-dom (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] write-excel-file (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] zustand (외부 라이브러리(패키지))
* **위치**: `package.json (dependencies)`
* **안내**: 새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] card-layout/card-layout (기능 모듈(Feature Module))
* **위치**: `src/modules/card-layout`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] class-agit/anthology (기능 모듈(Feature Module))
* **위치**: `src/modules/class-agit/anthology`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] class-agit/api (기능 모듈(Feature Module))
* **위치**: `src/modules/class-agit/api`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] class-agit/gallery (기능 모듈(Feature Module))
* **위치**: `src/modules/class-agit/gallery`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] class-agit/selection (기능 모듈(Feature Module))
* **위치**: `src/modules/class-agit/selection`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] community/friends-hideout (기능 모듈(Feature Module))
* **위치**: `src/modules/community/friends-hideout`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] community/neighbor-agit (기능 모듈(Feature Module))
* **위치**: `src/modules/community/neighbor-agit`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] dashboard/dashboard (기능 모듈(Feature Module))
* **위치**: `src/modules/dashboard`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] feedback/feedback (기능 모듈(Feature Module))
* **위치**: `src/modules/feedback`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] game/dragon (기능 모듈(Feature Module))
* **위치**: `src/modules/game/dragon`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] game/legacy (기능 모듈(Feature Module))
* **위치**: `src/modules/game/legacy`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] learning/learning (기능 모듈(Feature Module))
* **위치**: `src/modules/learning`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] tool/class-board (기능 모듈(Feature Module))
* **위치**: `src/modules/tool/class-board`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] tool/class-notice (기능 모듈(Feature Module))
* **위치**: `src/modules/tool/class-notice`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] tool/classroom-arrangement (기능 모듈(Feature Module))
* **위치**: `src/modules/tool/classroom-arrangement`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] tool/meal-board (기능 모듈(Feature Module))
* **위치**: `src/modules/tool/meal-board`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/diary (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/diary`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/drafts (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/drafts`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/editor-settings (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/editor-settings`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/engagement (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/engagement`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/evaluation (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/evaluation`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/idea-market (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/idea-market`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/lab-activities (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/lab-activities`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/mission-card-layout (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/mission-card-layout`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/mission-form (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/mission-form`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/mission-types (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/mission-types`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/mission-workspace (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/mission-workspace`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/policy (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/policy`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/presentation (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/presentation`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/reactions (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/reactions`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/reading-log (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/reading-log`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/references (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/references`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/spelling-learning (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/spelling-learning`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/submission-board (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/submission-board`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/title-status (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/title-status`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/tools (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/tools`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*

### 📌 [신규 감지] writing/writing-footprint (기능 모듈(Feature Module))
* **위치**: `src/modules/writing/writing-footprint`
* **안내**: 새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.
* **💡 쉬운 비유**: *(작성 대기 중)*
* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*
<!-- AUTO_SYNC_END -->
