import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useEvaluation = () => {
    const [loading, setLoading] = useState(false);

    /**
     * 교사가 설정한 평가 기준(Rubric)을 미션에 저장합니다.
     * @param {string} missionId 
     * @param {Object} rubric - { levels: [{ score: 5, label: '우수' }, ...] }
     */
    const updateRubric = useCallback(async (missionId, rubric) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('writing_missions')
                .update({ evaluation_rubric: rubric })
                .eq('id', missionId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('평가 기준 저장 실패:', err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * 학생의 글에 대한 평가(최초/최종 점수 및 코멘트)를 저장합니다.
     * @param {string} postId 
     * @param {Object} data - { initial_eval, final_eval, eval_comment }
     */
    const saveEvaluation = useCallback(async (postId, data) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('student_posts')
                .update({
                    initial_eval: data.initial_eval,
                    final_eval: data.final_eval,
                    eval_comment: data.eval_comment
                })
                .eq('id', postId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('평가 저장 실패:', err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * 특정 미션의 모든 학생 평가 결과를 가져옵니다.
     * @param {string} missionId 
     */
    const fetchMissionReport = useCallback(async (missionId) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, student_id, initial_eval, final_eval, eval_comment, students(name)')
                .eq('mission_id', missionId);

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('리포트 조회 실패:', err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * 특정 태그(배열)를 포함한 미션들과 그에 대한 특정 학생의 글/평가 데이터를 가져옵니다.
     * @param {string} studentId 
     * @param {string[]} tags - 필터링할 태그 배열
     */
    const getEvaluationDataByTag = useCallback(async (studentId, tags) => {
        if (!studentId || !tags || tags.length === 0) return { success: true, data: [] };

        setLoading(true);
        try {
            // student_posts를 기준으로 writing_missions를 join하여 가져옵니다.
            // .contains('writing_missions.tags', tags)를 통해 태그 필터링을 수행합니다.
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, 
                    content, 
                    original_content, 
                    initial_eval, 
                    final_eval, 
                    eval_comment,
                    student_answers,
                    writing_missions!inner (
                        id, 
                        title, 
                        guide_questions, 
                        tags
                    )
                `)
                .eq('student_id', studentId)
                .contains('writing_missions.tags', tags);

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('태그 기반 평가 데이터 조회 실패:', err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        updateRubric,
        saveEvaluation,
        fetchMissionReport,
        getEvaluationDataByTag
    };
};
