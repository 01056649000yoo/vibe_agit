import { createClient } from '@supabase/supabase-js'

// .env 파일에 저장된 설정을 불러옵니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 설정을 바탕으로 슈파베이스 클라이언트를 생성하여 내보냅니다.
// 이 클라이언트를 호출하면 데이터베이스, 인증, 스토리지 등에 접근할 수 있습니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
