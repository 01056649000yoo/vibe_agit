import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
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
      'react-refresh': reactRefresh,
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'react/no-danger': 'warn',
    },
  },
])
