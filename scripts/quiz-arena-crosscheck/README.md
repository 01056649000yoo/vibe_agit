# 퀴즈 아레나 기본 세트 교차 점검 (GPT · 제미나이 · 클로드)

기본(공식) 세트(`public/quiz-arena/official-sets-v1.json`)를 **답을 가리고 풀어 보는** 방식으로 점검한다(2026-10-23).
자료(어휘·맞춤법)가 바뀌어 세트를 다시 만들었을 때, 새로 생긴 문제만 이 순서로 다시 점검한다.

1. `node scripts/build-quiz-arena-official-sets.mjs` 로 세트를 만든다.
2. `node scripts/quiz-arena-crosscheck/make-solve-files.mjs <작업 폴더> <라운드>` — 이미 통과한 문제(`done.json`)를 뺀 풀이 파일 4개(`r<라운드>-part0~3.txt`, 정답·해설 없음).
3. 두 모델에 맡긴다(저장소 폴더가 아니라 **빈 복사 폴더**에서, 학생 정보 없음):
   - GPT: `node scripts/codex-usage-guard.mjs ask --dir <빈 폴더> --prompt <파일> --out <작업 폴더>/r<라운드>-gpt<N>.txt --model gpt-6.1-sol --effort medium` (남은 사용량 10% 미만이면 중지)
   - 제미나이(아르곤): `bash ~/agy-ask.sh <파일> <작업 폴더>/r<라운드>-gem<N>.txt`
   - 클로드: 같은 파일의 무작위 표본·애매한 문제를 직접 풀어 `claude-r<라운드>.txt`(`q0001=B` 형식)로 둔다.
4. `node scripts/quiz-arena-crosscheck/compare-solves.mjs <작업 폴더> <라운드>` — 정답표와 대조(틀림·`?` 표시).
5. `node scripts/quiz-arena-crosscheck/derive-exclusions.mjs <작업 폴더> <라운드>` — 지적된 문제의 자료를 제외하고(어휘 낱말·맞춤법 항목), 오답 보기가 정답으로도 읽힌 짝(혼동 쌍)·복수 표준어 표기(나쁜 표기)를 목록에 더한다. 통과한 문제는 `done.json` 에 쌓인다. **같은 라운드에 두 번 돌리지 않는다.**
6. 세트를 다시 만들고(1) 지적이 0 이 될 때까지 2~5 를 반복한다. 자리마다 형식이 정해져 있고 제외된 자료는 예비에서 채우므로, 바뀌는 문제는 지적된 만큼에 가깝다.
7. 마지막으로 정답·해설을 보여 주고 **문제 글·해설 오류**를 묻는 품질 검토를 두 모델에 한 번 더 맡긴다(틀린 보기는 일부러 틀린 것임을 알린다).

결과(2026-10-23): 1차 1765문제 중 지적 57건(3%) → 4번 반복해 지적 0. 제외 목록은 `scripts/quiz-arena-official-exclusions.json`.
