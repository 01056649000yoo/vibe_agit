# 내 글의 3축 — 제출 확인 · 선생님 의견 · 친구 댓글

학생이 자기 글 한 편에서 보는 세 가지다. **글 유형이 몇 개가 되든 같은 모습이어야 한다.**

## 왜 따로 뒀나

2026-08-06 이전에는 이 셋이 유형마다 다른 자리에 있었다.

| 축 | 과제 글쓰기 | 자율 글(독서록·일기) |
|---|---|---|
| 제출·확인 상태 | `student_posts.is_confirmed` / `approved_at` | `reading_log_teacher_reviews.review_status` |
| 선생님 의견 | `student_posts.ai_feedback` | `reading_log_teacher_reviews.teacher_comment` |
| 친구 댓글 | `post_comments` | `post_comments` (같음) |

그래서 화면이 저장소를 직접 알아야 했고, 유형이 하나 늘 때마다 화면 세 곳을 다시 고쳐야 했다.
실제로 **독서록·일기는 본인 글에서 친구 댓글을 볼 길이 아예 없었다** — 댓글은 달리고 대시보드 알림도
갔는데 들어가서 볼 화면만 없었다.

## 지금 구조

```
서버  public.get_my_post_engagement(post_id)
      본인 글이면 유형과 무관하게 { submission, teacher, comments, reaction_count } 를 준다.
      유형별로 다른 저장소를 이 함수가 흡수한다.

화면  <MyPostEngagementPanel postId={글id} />
      상태 뱃지 + 선생님 한마디 + 친구 댓글 목록. 읽기 전용.
```

**저장소는 옮기지 않았다.** 과제 댓글 8,000여 건과 기존 피드백이 걸려 있어 이사 위험이 크다.
읽는 시점에 서버가 흡수하므로 나중에 저장소를 합치더라도 **이 함수만 고치면 화면은 그대로다.**

## 새 글쓰기 유형을 붙일 때

1. `public.writing_types` 에 유형을 등록한다(라벨·기본 정책).
2. `src/modules/writing/selfWritingTypes.js` 에 화면 표현(라벨·아이콘·책장 탭)을 추가한다.
3. 그 유형의 **본인 글 상세 화면에 한 줄** 넣는다.
   ```jsx
   <MyPostEngagementPanel postId={postId} />
   ```

이게 전부다. 상태·의견·댓글이 자동으로 같은 모습으로 붙는다.
`get_my_post_engagement` 는 `writing_context = 'self'` 면 자율 글 규칙을, 아니면 과제 규칙을 쓰므로
자율 글 유형은 함수를 고칠 필요가 없다.

## 지키는 규칙

- **본인 글만** 반환한다. 남의 글은 친구 아지트의 공개 글 경로로 본다.
- 학생 댓글은 `status = 'approved'` 인 것만, 선생님 댓글은 항상 보인다(친구 아지트와 같은 규칙).
- 지금은 **읽기 전용**이다. 답글은 친구 아지트의 글 상세에서 단다(2026-08-06 사용자 결정).
  여기에 답글을 붙이려면 댓글 승인 정책·질 검사·알림을 함께 옮겨야 한다.
