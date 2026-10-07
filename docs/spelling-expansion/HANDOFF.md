# 맞춤법 기본 자료 2,000개 늘리기 — 이어서 할 일 (밤샘 작업 인계)

> 선생님 결정(2026-10-07 밤): 2,000개를 밤사이 자동으로 준비·점검하고, **아침에 선생님은 결과(검토 페이지)만 확인**한다.
> **GPT(유료 API)는 쓰지 않는다** — 초안·설명·예문은 Claude 가 직접 쓴다. 무료 표준국어대사전 API만 쓴다.
> **실제 카탈로그에 합치거나 배포하지 않는다** — 선생님 승인 뒤에만(`scripts/merge-spelling-expansion.mjs`).
> 대답은 우리말 존댓말로.

## 지금 상태
- batch-01: 초안 242 → 점검·모의 실행 뒤 210개 남김.
  - 초안 `batch-01.pairs.tsv`, 점검 결과 `batch-01.check.json`, 뺀 것과 까닭 `batch-01.decisions.json`(drop 키 = 틀린 꼴)
  - 설명·예문: `batch-01.content-1/2/3.json` — **210개 모두 작성 완료**(23:15).
  - "그 다음 → 그다음"은 넣기로 선생님이 정함.

- batch-02: 초안 449 → 점검·모의 실행·사람 판단 뒤 257개, 설명은 `batch-02.content.tsv`(P/L/S/N 은 설명 틀).
- **실제 검사기 모의 실행 끝(10-08 새벽)**: 01·02 합쳐 464개(겹침 2개 뺌) — 오탐 0, 미탐 0, 바른 예문 오탐 0,
  학생 글 밑줄 48 → 약 1,000, 퀴즈 후보 500 → 964. 결과 `simulation-01-02.json`. 카탈로그는 되돌림.

- **검토 페이지 게시(10-08)**: https://claude.ai/artifact/1tyLpNvrgznP9AMWvkwPos (생성기: 스크래치 `build-review.mjs`, 묶음 01·02 = 464개). 선생님이 '빼기' 번호를 붙여 주면 `--exclude` 로 합친다.

- batch-03(실제 학생 오류 + 놀이·생활 낱말): 178 → 140. **01~03 실제 검사기 모의 실행(10-08)**: 604개, 모든 검사 통과, 학생 글 밑줄 48 → 1,660, 퀴즈 후보 500 → 1,104. 결과 `simulation-01-03.json`.

## 남은 순서
1. ~~batch-01 content-3 쓰기~~ 끝.
2. batch-02 ~ (합쳐 2,000개 목표, 정확성이 먼저 — 모자라면 모자란 대로 보고):
   - `batch-NN.pairs.tsv` 초안(형식은 batch-01 과 같음: `분류/세부\t검출\t틀린 꼴\t바른 꼴\t문맥`)
   - `node scripts/expand-spelling-base.mjs --batch NN --corpus <학생 글 csv>`
     학생 글 csv 는 git 밖: `docker exec agit-db psql -U postgres -d postgres -Atc "\copy (select content from student_posts where content is not null and char_length(content) > 50 order by created_at desc limit 4000) to stdout with csv" > <스크래치>/posts.csv`
   - 모의 실행에서 걸린 어절을 **사람 눈으로** 훑어 잘못된 밑줄(예: 만히→가만히, 비물→준비물)이 있으면 decisions 에 drop + 까닭
   - 남은 것의 설명(아이용 “~요”, 120자 이내)·바른 예문 2개를 content 파일에
3. 실제 엔진 모의 실행(작업 사본에서만): 카탈로그에 임시로 합쳐 `npm run spelling:check`(오탐·예문 검사) → 학생 글 4,000편 전후 밑줄 수 → 인형뽑기 퀴즈 표본 → **되돌림**(git checkout).
4. 검토 페이지(Artifact, 분류별·학생 글 횟수·뺀 것과 까닭·빼기 표시·번호 복사) 게시 → 링크를 선생님께.
5. WORKLOG 항목 + 커밋(푸시·배포 안 함).

## 기준(되풀이하지 말 것)
- exact 는 틀린 꼴이 **어떤 문맥에서도** 틀릴 때만. 다른 낱말을 품거나(가만히·준비물·텔레포트) 다른 뜻 낱말이면 뺀다.
- 제47항 허용(-아/-어 + 보조 용언 붙여 쓰기), 복수 표준어는 넣지 않는다.
- 사전의 `→ 바른말` 뜻풀이는 비표준 꼴이라는 뜻(삼춘 → 삼촌) — 틀린 꼴로 본다.
