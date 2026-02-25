import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// .env 파일 수동 로드
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            config[parts[0].trim()] = parts.slice(1).join('=').trim();
        }
    });
    return config;
}

const envConfig = loadEnv();
const url = envConfig.VITE_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY;

console.log("🔍 Supabase 환경 변수 점검 중...");
console.log("--------------------------------------");
console.log(`URL: ${url}`);
console.log(`Key (앞 10자): ${key ? key.substring(0, 10) + "..." : "없음"}`);
console.log("--------------------------------------");

if (!url || !key) {
    console.error("❌ VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 비어있습니다.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    console.log("⏳ Supabase 연결 테스트 중...");

    // 1. 단순 데이터 조회 테스트
    const { data, error } = await supabase.from('classes').select('*').limit(1);

    if (error) {
        console.error("❌ 연결 실패!");
        console.error(`에러 메시지: ${error.message}`);

        if (error.message.includes("JWT")) {
            console.log("\n💡 [진단] JWT 에러가 발생했습니다. 이는 URL과 Key가 서로 다른 프로젝트의 것이 확률이 매우 높습니다.");
        }
    } else {
        console.log("✅ 연결 성공! URL과 Anon Key가 일치합니다.");
    }

    // 2. 익명 로그인 테스트
    console.log("\n⏳ 익명 로그인 테스트 중...");
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError) {
        console.warn(`⚠️ 익명 로그인 실패: ${authError.message}`);
    } else {
        console.log("✅ 익명 로그인 성공!");
        console.log(`발급된 UID: ${authData.user.id}`);
    }
}

check();
