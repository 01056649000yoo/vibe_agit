import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // 1. 클라이언트 데이터 파싱
    const { studentCode } = await req.json()
    if (!studentCode) {
        throw new Error('studentCode is required')
    }

    // 2. 인증 확인 (현재 로그인한 유저의 JWT 검증)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        throw new Error('No authorization header')
    }

    // 클라이언트 권한으로 초기화 (유저 식별용)
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
    })
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
        throw new Error('Invalid user or session')
    }

    // 3. Admin 권한으로 레코드 조회 및 메타데이터 업데이트
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // 학생 정보 조회
    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id, class_id')
      .eq('student_code', studentCode.toUpperCase())
      .single()

    if (studentError || !student) {
        throw new Error('Student not found')
    }

    // 유저 메타데이터 주입
    const { data: updateData, error: updateError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { app_metadata: { 
          role: 'STUDENT', 
          class_id: student.class_id,
          student_id: student.id
        } 
      }
    )

    if (updateError) {
        throw new Error('Failed to update user metadata')
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Metadata updated successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
