import { supabase } from './supabaseClient';
import { getTeacherGuide, getTeacherGuideSection, getTeacherGuideTarget } from '../guides/teacherGuideRegistry';

const readInvokeError = async (invokeError) => {
    let message = invokeError?.message || 'AI 안내를 불러오지 못했습니다.';
    try {
        const body = await invokeError?.context?.json();
        message = body?.error || body?.message || message;
    } catch {
        // 응답 본문을 읽을 수 없으면 SDK 오류 문구를 사용한다.
    }
    const error = new Error(message);
    error.status = invokeError?.status || invokeError?.context?.status || 0;
    throw error;
};

export const askTeacherGuideAssistant = async ({ question, candidates }) => {
    const { data, error } = await supabase.functions.invoke('vibe-ai', {
        body: { type: 'TEACHER_GUIDE_CHAT', question, candidates }
    });
    if (error) await readInvokeError(error);
    const guideRef = typeof data?.guideRef === 'string' && getTeacherGuide(data.guideRef) ? data.guideRef : null;
    const sectionRef = guideRef && typeof data?.sectionRef === 'string' && getTeacherGuideSection(guideRef, data.sectionRef)
        ? data.sectionRef
        : null;
    return {
        answer: String(data?.answer || '').slice(0, 240),
        guideRef,
        sectionRef,
        actionLabel: String(data?.actionLabel || '관련 안내 보기').slice(0, 30),
        confidence: ['high', 'medium', 'low'].includes(data?.confidence) ? data.confidence : 'low',
        remainingToday: Math.max(0, Math.min(5, Number(data?.remainingToday) || 0)),
        dailyLimit: 5,
        target: guideRef ? getTeacherGuideTarget(guideRef) : null
    };
};
