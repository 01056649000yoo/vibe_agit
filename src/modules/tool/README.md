# 수업 도구 모듈 추가 계약

쌤링크처럼 교사가 수업 중 사용하는 앱은 `src/modules/tool/<module-id>/`에 둔다.
앱 코드를 교사 대시보드에 직접 추가하지 않고 manifest와 `teacherEntry`로 연결한다.

```js
export const sampleToolManifest = {
  id: 'sample-tool',
  name: '샘플 수업 도구',
  description: '수업에서 사용하는 도구',
  icon: '🧰',
  part: 'tool',
  audience: 'teacher',
  teacherEntry: () => import('./TeacherEntry'),
  tool: {
    order: 10,
    launchMode: 'embedded'
  }
};
```

`src/modules/registry.js`에 manifest를 등록하면 교사 `수업 도구` 런처에 자동으로 표시된다.
선택하기 전에는 앱 코드를 로드하지 않는다. 외부 앱은 인증·데이터 계약을 먼저 정한 뒤 연결하며,
비밀 값이나 외부 앱 코드를 아지트 코어 셸에 직접 섞지 않는다.

## 현재 도구

- `classroom-arrangement`: 자리·역할 배치
- `samlink`: 쌤링크
- `meal-board`: `얘들아, 밥 먹자!` 급식·학생별 비고 확인. 나이스 키는 서버 함수만 읽고, 공개
  전체화면에는 학생 이름과 비고를 전달하지 않는다. 비고는 선택 사항이며 담당 학급 RPC로만 읽고 쓴다.
