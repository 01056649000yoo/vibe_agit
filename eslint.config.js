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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'react/no-danger': 'warn',
    },
  },
])
