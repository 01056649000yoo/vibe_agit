import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import security from 'eslint-plugin-security'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'scripts']),
  security.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      security,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX에서 쓰인 변수(<motion.div> 등)를 사용으로 인식 — 없으면 no-unused-vars가 오탐
      'react/jsx-uses-vars': 'error',
      // 반대 방향 — <Search />처럼 쓰였는데 임포트가 없는 경우를 잡는다.
      // 빌드는 통과하고 화면에서만 터지므로 린트가 아니면 배포 후에야 발견된다 (2026-08-04 실제로 겪음).
      'react/jsx-no-undef': 'error',
      // 위 규칙의 짝. JSX가 아닌 **일반 함수·상수** 호출에 임포트가 빠진 경우를 잡는다.
      // 2026-08-06 친구 아지트가 흰 화면이 됐다 — `getSelfWritingType(post)` 를 쓰면서 임포트가 없었는데
      // 빌드도 린트도 통과했다. JSX만 보던 그물의 구멍이었다.
      'no-undef': 'error',
      // 위 둘의 세 번째 짝. **선언보다 먼저 쓴** 경우를 잡는다.
      // `const` 는 끌어올려지지 않아 앞에서 쓰면 그 자리에서 터진다. 2026-08-28 관리자 대시보드가
      // 흰 화면이 됐다 — `tabBadges` 를 선언보다 90줄 앞에서 썼는데 빌드·린트·검사가 모두 통과했다.
      // 함수 선언은 끌어올려지므로 예외로 둔다(파일 아래쪽에 도우미를 모으는 이 저장소의 습관).
      'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'react/no-danger': 'warn',
    },
  },
  {
    // 검사 파일은 저장소의 소스를 경로·패턴 변수로 읽어 대조하는 것이 본업이다.
    // 사용자 입력이 닿지 않으므로 아래 세 규칙의 경고는 전부 오탐이다(2026-09-28, 58건 확인).
    // 앱 코드(src)에는 그대로 적용된다. 브라우저 스모크(e2e)도 같은 까닭으로 같이 둔다.
    files: ['tests/**/*.{js,mjs}', 'e2e/**/*.{js,cjs}'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-object-injection': 'off',
    },
  },
])
