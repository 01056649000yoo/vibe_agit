// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        // 화면 렌더 스모크(e2e/*render-smoke*)는 가짜 Supabase 로 돈다. 값을 따로 주지 않으면 이 가짜 주소를 쓴다.
        // ⚠️ 이미 떠 있는 5173 개발 서버는 그대로 재사용되므로, 실제 주소로 띄운 서버가 있으면 먼저 끈다.
        env: {
            VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://fake-supabase.test',
            VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'dummy',
            VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || 'dummy',
        },
    },
});
