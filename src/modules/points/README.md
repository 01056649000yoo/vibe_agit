# 공용 포인트 모듈

포인트는 선택형 게임이 아니라 앱의 **코어 기반 기능**이다. 학급 ON/OFF 대상이 아니며 모든 콘텐츠가 이 계약을 사용한다.

## 새 콘텐츠 연결 방법

1. 콘텐츠 폴더와 같은 마이그레이션에서 **기능 전용 RPC**를 만든다.
2. 전용 RPC가 로그인 주체·학급·대상 데이터·보상 조건을 직접 검증한다.
3. 검증이 끝난 뒤 DB 내부 전용 `public.point_engine_apply(...)`를 호출한다.
4. 재시도해도 한 번만 반영되도록 콘텐츠가 안정적인 `event_key`를 만든다.
5. 화면에서는 `pointApi.js`에 전용 메서드를 하나 추가하고 그 메서드만 호출한다.

```sql
-- 예: 새 콘텐츠 한 판 완료 보상
v_result := public.point_engine_apply(
    v_student_id,
    v_reward,
    '새 콘텐츠 완료 보상',
    'private_adjustment',
    format('new-content:%s:complete', v_run_id),
    NULL,
    NULL,
    jsonb_build_object('source', 'new_content', 'run_id', v_run_id)
);
```

## 지켜야 할 규칙

- 화면에서 `students.total_points`와 `point_logs`를 직접 쓰지 않는다.
- 화면에서 범용 `increment_student_points`를 호출하지 않는다.
- 하나의 사용자 행동은 기능 전용 RPC 한 번으로 상태 변경과 포인트 처리를 함께 끝낸다.
- `event_key`는 학생별로 유일해야 한다. 버튼 재클릭·네트워크 재시도에도 같은 키를 사용한다.
- 차감은 잔액 부족 시 전체 트랜잭션을 실패시킨다.
- 새 활동 유형이 필요하면 DB CHECK, `pointTypes.js`, 통계 분류를 같은 변경에서 함께 추가한다.
- 목록은 학급 범위와 상한을 반드시 둔다.

## 현재 연결

- 과제 개별·일괄 승인 및 회수
- 교사의 여러 학생 포인트 지급·회수
- 학생 등록 환영 포인트
- 안건 결정·취소

독서록·일기·댓글·어휘의 탑·수호룡 구매는 이미 기능 전용 RPC 한 번으로 동작한다. 다음에 해당 기능을 수정할 때
내부 포인트 쓰기 부분만 `point_engine_apply()`로 순차 이전한다.

## 학생 포인트 허브 조회

- 현재 잔액은 학생 홈 bootstrap의 `points`를 그대로 사용해 놀이터 진입 조회를 추가하지 않는다.
- 최근 내역은 학생이 `내역 보기`를 눌렀을 때만 `get_my_point_history_v1`으로 최대 20건을 읽는다.
- 본인 내역 RPC는 클라이언트의 학생·학급 ID를 받지 않고 실제 `auth_id` 연결로 범위를 결정한다.
- 포인트 원장의 `event_key`·`metadata`는 학생 화면에 반환하지 않는다.
