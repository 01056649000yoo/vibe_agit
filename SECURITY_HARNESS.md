# 보안 하네스

새 기능을 붙일 때 성능 하네스와 함께 아래 검사를 통과시킨다.

## 기본 원칙

1. 권한은 화면이나 JWT 메타데이터가 아니라 DB의 실제 사용자·학급 연결과 승인 상태로 판정한다.
2. 학생 쓰기는 본인 데이터만, 교사 관리는 담당 학급만 허용한다. `SECURITY DEFINER` RPC도 함수 안에서 다시 확인한다.
3. 외부 비용이 생기는 AI·메일은 승인 사용자 확인, 입력 상한, 서버 속도 제한을 모두 둔다.
4. 새 Edge 함수는 `scripts/check-operational-security.mjs` 허용 목록에 의도적으로 등록한다. 사용하지 않는 함수는 운영 경로에서 격리한다.
5. 브라우저에는 재사용 가능한 학생 코드·비밀 키를 저장하지 않는다.
6. 새 외부 도메인을 연결하면 CSP를 필요한 항목에만 추가하고, 빌드 후 실제 응답 헤더를 확인한다.
7. 운영 의존성은 `npm audit --omit=dev` 0건을 기준으로 한다. 수정판이 없는 패키지는 사용 경로를 제거하거나 교체한다.

## 실행

```bash
npm run test:security:static   # 코드 계약
npm run migrate:check         # 미적용 SQL + SQL 권한 스모크, 전부 ROLLBACK
npm run smoke:security-boundary # 적용된 핵심 역할 조합도 매번 ROLLBACK 재검사
npm run test:security:ops      # 맥미니 포트·권한·Edge 함수 허용 목록
npm audit --omit=dev           # 운영 의존성
```

운영 DB 적용 뒤에는 해당 SQL 스모크를 `scripts/run-rollback-smoke.mjs`로 한 번 더 실행한다.
