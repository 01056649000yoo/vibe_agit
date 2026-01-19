import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log("Supabase URL 확인:", supabaseUrl);

// 주소가 없거나 유효하지 않을 때 앱이 멈추지 않도록 체크합니다.
if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
    console.error("적절한 Supabase URL이 설정되지 않았습니다. .env 파일을 확인해주세요.");
}

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'))
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
