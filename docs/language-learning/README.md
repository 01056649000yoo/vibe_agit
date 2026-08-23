# 공통 언어 학습 콘텐츠

속담·사자성어를 `오늘의 말 미션` 한 화면에만 묶지 않고, 향후 속담·사자성어의 탑과 다른 학습 활동이
같은 원본·문제·진도를 재사용하기 위한 데이터 계약이다.

## 현재 상태

- 검수용 원본: [`data/source-import-v1.json`](data/source-import-v1.json)
- 자동 검사: `npm run language:content:check`
- 다시 가져오기: `node scripts/audit-language-learning-content.mjs --source-dir <옛 앱의 src/data> --write`
- DB 토대: `20261160_learning_content_catalog.sql`
- **아직 학생에게 제공하지 않는다.** 모든 항목과 문제는 `source_imported`이고 학년군·내용 난이도·
  선택형 확인 문제를 정하지 않았다.

| 원본 | 항목 | 병합 결과 |
|---|---:|---|
| 속담 기본팩 | 85 | 표현·뜻 + 원본 초성 빈칸 문제 1종 |
| 사자성어 기본팩 3파일 | 100 | 표현·한자·뜻·예문 + 문장 완성·초성·뜻 맞히기 3종 |
| 합계 | 185 | 원본 문제 변형 385개 |

속담 중 원본 `answer`에 빠진 낱말만 있던 41개는 `quiz`의 초성 자리에 답을 넣어 완성 표현 초안을
복원했다. 이 항목에는 `expression_reconstructed` 신호가 있어 사람이 문장과 띄어쓰기를 확인해야 한다.
58번은 원본 초성 `ㄱ ㅁ`과 답 `멍에(ㅁ ㅇ)`가 맞지 않아 `unresolved_initials`로 별도 표시했다.

## 한 원본, 여러 학습 경험

```text
learning_content_items          표현·뜻·한자·예문
        │
        ├─ learning_content_questions     문제 변형·서버 채점 정답
        └─ learning_content_collections   학습 묶음과 순서
                         │
                         ├─ 오늘의 말 미션
                         └─ 향후 속담·사자성어의 탑

두 경험의 답안 ──> learning_item_progress (기존 공통 학습 엔진)
```

일일 미션과 탑은 별도 항목을 만들지 않는다. 둘 다 같은
`content_type + collection_key + item_key`를 `learning_engine_record_answer_v1`에 넘긴다. 따라서 일일
미션의 첫 정답은 `familiar`, 나중에 탑에서 다른 문제 유형까지 연속 정답이면 `mastered`로 이어진다.

`collection_key`는 엔진이 해석하지 않는다. 학년군 검수를 마친 뒤 콘텐츠 쪽에서 묶음을 정하고, 일일
미션도 탑도 그 키를 그대로 사용해야 한다. 일일 미션 전용 묶음을 따로 만들면 같은 표현의 진도가 갈라지므로
금지한다.

## 항목 계약

한 항목은 다음 정보만 소유한다. 화면·포인트·하루 날짜처럼 특정 경험에만 필요한 값은 넣지 않는다.

```js
{
  itemKey: 'idiom:source-011',
  contentType: 'idiom',
  expression: '고진감래',
  hanja: '苦盡甘來',
  definition: '고생 끝에 낙이 온다.',
  example: '...',
  gradeBands: ['g34', 'g56'], // 검수 뒤 지정
  contentLevel: 2,            // 1~5, 문제 난이도와 별개
  themes: ['노력', '인내'],
  reviewStatus: 'published'
}
```

- `gradeBands`: `g34`, `g56`만 사용한다. 같은 표현을 학년군별로 복제하지 않는다.
- `contentLevel`: 표현 자체의 추상성·낯섦을 1~5로 나타낸다.
- `difficulty`: 각 문제의 풀이 난이도다. 같은 표현도 3·4학년은 뜻 고르기, 5·6학년은 문맥·직접 입력으로
  다르게 낼 수 있다.
- `reviewStatus`: `source_imported → editorial_review → teacher_confirmed → published` 순서다.
- 원본 ID는 `source.pack + source.sourceId`에 보존한다. ID가 비어 있는 구간을 새 번호로 메우지 않는다.

## 문제 유형

| 유형 | 역할 | 현재 원본 |
|---|---|---|
| `meaningChoice` | 학습 직후 뜻 확인, 일일 미션 기본 | 검수하며 새로 작성 |
| `clozeInput` | 표현·문장 빈칸 직접 입력 | 속담 85, 사자성어 100 |
| `initialsInput` | 초성을 보고 표현 입력 | 사자성어 100 |
| `definitionInput` | 뜻을 보고 표현 입력 | 사자성어 100 |
| `usageChoice` | 알맞은 사용 장면 선택 | 후속 심화 문제 |

선택형 보기는 다른 항목을 기계적으로 섞어 바로 공개하지 않는다. 오답도 뜻이 겹치지 않고 문맥상 오해가
없는지 검수해야 한다. `correct_answer`와 `accepted_answers`가 든 문제표는 브라우저 직접 권한이 없으며,
학생 RPC도 제출 전에는 정답을 반환하지 않는다.

## 학생 제공 전 승격 조건

항목 한 개를 `published`로 바꾸려면 다음이 모두 필요하다.

1. 완성 표현·뜻·한자·예문의 맞춤법과 초등학생 적합성 확인
2. `g34 / g56` 학년군과 내용 난이도 지정
3. 최소 한 개의 검수된 `meaningChoice` 확인 문제 작성
4. 모든 `reviewFlags` 해결
5. 학습 묶음에 한 번만 배치하고 문제 난이도·허용 정답 확인

DB 제약은 학년군·난이도·미해결 신호가 남은 항목과 문제의 `published` 저장을 거부한다. 네 카탈로그 표는
익명·학생·교사 브라우저뿐 아니라 `service_role`에도 직접 권한을 주지 않는다. 후속 승격·출제는 실제 역할과
학급을 다시 확인하는 전용 `SECURITY DEFINER` RPC로만 연결한다.

## 다음 구현 순서

1. 3·4학년용 속담 10개 + 사자성어 10개, 5·6학년용 각 10개의 겹침 가능한 시범 40개를 검수한다.
2. 항목별 `meaningChoice`와 설명을 작성하고 검수 완료 팩을 DB에 승격한다.
3. 오늘의 학급 공통 항목 스냅샷·학생 완료·멱등 포인트 지급 RPC를 만든다.
4. 학생 홈 bootstrap에는 `가능/완료/보상` 요약만 넣고, 항목과 문제는 창을 열 때 한 번 조회한다.
5. 운영 결과를 확인한 뒤 185개 전체 검수와 별도 탑 콘텐츠로 확장한다.

