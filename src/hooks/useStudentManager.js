import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useDataExport } from './useDataExport';

export const useStudentManager = (classId) => {
    const [students, setStudents] = useState([]);
    const [studentName, setStudentName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);

    // 모달 상태
    const [isPointModalOpen, setIsPointModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCodeZoomModalOpen, setIsCodeZoomModalOpen] = useState(false);
    const [isAllCodesModalOpen, setIsAllCodesModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [isRankingModalOpen, setIsRankingModalOpen] = useState(false); // [신규] 랭킹 모달 상태 추가

    // 데이터 상태
    const [selectedStudentForCode, setSelectedStudentForCode] = useState(null);
    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [exportTarget, setExportTarget] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const [pointFormData, setPointFormData] = useState({
        type: 'give',
        amount: 10,
        reason: '참여도가 높아요! 🌟'
    });

    const { fetchExportData, exportToExcel, exportToGoogleDoc, isGapiLoaded } = useDataExport();

    const fetchStudents = useCallback(async () => {
        if (!classId) return;

        // 1. 학생 데이터 조회 (삭제되지 않은 학생만)
        const { data: studentsData, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (error || !studentsData) {
            console.error('학생 목록 로드 실패:', error);
            return;
        }

        // 2. 활동 점수 계산 (누적 포인트: 사용한 포인트 제외하고 획득한 포인트만 합산)
        const studentIds = studentsData.map(s => s.id);
        let activityMap = { all: {}, week: {}, month: {} };
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        if (studentIds.length > 0) {
            const { data: logsData, error: logsError } = await supabase
                .from('point_logs')
                .select('student_id, amount, created_at')
                .in('student_id', studentIds)
                .gt('amount', 0); // 양수(획득) 포인트만 조회

            if (!logsError && logsData) {
                logsData.forEach(log => {
                    const logDate = new Date(log.created_at);
                    const sid = log.student_id;

                    // 전체 기간
                    activityMap.all[sid] = (activityMap.all[sid] || 0) + log.amount;

                    // 최근 1주일
                    if (logDate >= weekAgo) {
                        activityMap.week[sid] = (activityMap.week[sid] || 0) + log.amount;
                    }

                    // 최근 1달
                    if (logDate >= monthAgo) {
                        activityMap.month[sid] = (activityMap.month[sid] || 0) + log.amount;
                    }
                });
            }
        }

        // 3. 데이터 병합
        const studentsWithStats = studentsData.map(s => ({
            ...s,
            activity_score: activityMap.all[s.id] || 0, // 기본 대시보드 표시용
            score_all: activityMap.all[s.id] || 0,
            score_week: activityMap.week[s.id] || 0,
            score_month: activityMap.month[s.id] || 0
        }));

        setStudents(studentsWithStats);
    }, [classId]);

    useEffect(() => {
        fetchStudents();
        return () => {
            setStudents([]);
            setSelectedIds([]);
        };
    }, [fetchStudents]);

    const handleAddStudent = async () => {
        if (!studentName.trim()) return;
        setIsAdding(true);
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        try {
            // RPC 함수를 통해 학생 추가 및 초기 포인트 부여 (point_logs INSERT도 함수 내에서 처리)
            const { data: newStudentId, error } = await supabase.rpc('add_student_with_bonus', {
                p_class_id: classId,
                p_name: studentName,
                p_student_code: code,
                p_initial_points: 100
            });

            if (error) throw error;

            // 추가된 학생 정보 조회
            const { data: newStudentData, error: fetchError } = await supabase
                .from('students')
                .select('*')
                .eq('id', newStudentId)
                .single();

            if (fetchError) throw fetchError;

            if (newStudentData) {
                setStudents(prev => [...prev, newStudentData]);
                setStudentName('');
            }
        } catch (err) {
            console.error('학생 추가 실패:', err.message);
            alert('학생을 추가하는 중 오류가 발생했습니다.');
        } finally {
            setIsAdding(false);
        }
    };

    const handleBulkProcessPoints = async () => {
        if (selectedIds.length === 0) return;
        if (!pointFormData.reason.trim()) return alert('활동 사유를 입력해주세요! ✍️');

        const { type, amount, reason } = pointFormData;
        const actualAmount = type === 'give' ? amount : -amount;
        const targets = students.filter(s => selectedIds.includes(s.id));

        // [추가] 회수(subtract) 시 보유 포인트가 부족한 학생이 있는지 확인
        if (type === 'subtract') {
            const insufficientOnes = targets.filter(s => (s.total_points || 0) < amount);
            if (insufficientOnes.length > 0) {
                const names = insufficientOnes.map(s => s.name).join(', ');
                alert(`⚠️ 포인트 회수 실패!\n보유 포인트가 부족한 학생이 포함되어 있습니다: ${names}`);
                return;
            }
        }

        const previousStudents = [...students];

        // 낙관적 업데이트
        setStudents(prev => prev.map(s =>
            selectedIds.includes(s.id)
                ? {
                    ...s,
                    total_points: (s.total_points || 0) + actualAmount,
                    // 획득(양수)일 경우 활동 점수도 증가
                    activity_score: (s.activity_score || 0) + (actualAmount > 0 ? actualAmount : 0)
                }
                : s
        ));
        setIsPointModalOpen(false);

        try {
            // RPC 함수를 통해 포인트 변경 및 로그 기록 (point_logs INSERT도 함수 내에서 처리)
            const operations = targets.map(async (t) => {
                const { error } = await supabase.rpc('teacher_manage_points', {
                    target_student_id: t.id,
                    points_amount: actualAmount,
                    reason_text: reason
                });
                if (error) throw error;
            });
            await Promise.all(operations);
            alert(`${targets.length}명의 포인트 처리가 완료되었습니다! ✨`);
            setSelectedIds([]);
        } catch (error) {
            setStudents(previousStudents);
            alert('오류 발생: ' + error.message);
        }
    };

    const handleDeleteStudent = async () => {
        if (!deleteTarget) return;
        try {
            // Soft Delete: 삭제 일시 기록
            const { error } = await supabase
                .from('students')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', deleteTarget.id);

            if (error) throw error;

            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));

            alert(`[${deleteTarget.name}] 학생이 삭제 대기 상태로 이동되었습니다. 📦\n3일 이내에 복구할 수 있으며, 이후에는 영구 삭제됩니다.`);
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
        }
    };

    const fetchDeletedStudents = async () => {
        if (!classId) return [];
        try {
            // 1. 서버 측 RPC로 3일 경과한 학생 하드 삭제 처리
            //    (클라이언트 타임스탬프 조작 방지: 서버에서 now() 기준으로 검증)
            await supabase.rpc('purge_expired_students', { p_class_id: classId });

            // 2. 복구 가능한 학생 조회 (3일 이내 소프트 딜리트된 학생)
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const { data, error } = await supabase
                .from('students')
                .select('*')
                .eq('class_id', classId)
                .not('deleted_at', 'is', null)
                .gte('deleted_at', threeDaysAgo.toISOString())
                .order('deleted_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('삭제된 학생 조회 실패:', err.message);
            return [];
        }
    };

    const handleRestoreStudent = async (studentId) => {
        if (!studentId) return;
        try {
            const { error } = await supabase
                .from('students')
                .update({ deleted_at: null })
                .eq('id', studentId);

            if (error) throw error;
            await fetchStudents();
            alert('학생 정보가 성공적으로 복구되었습니다! ♻️');
        } catch (err) {
            console.error('학생 복구 실패:', err.message);
            alert('복구 중 오류가 발생했습니다.');
        }
    };

    const openHistoryModal = async (student) => {
        setHistoryStudent(student);
        setIsHistoryModalOpen(true);
        setLoadingHistory(true);
        const { data, error } = await supabase
            .from('point_logs')
            .select('*')
            .eq('student_id', student.id)
            .order('created_at', { ascending: false });

        if (!error) setHistoryLogs(data || []);
        setLoadingHistory(false);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === students.length) setSelectedIds([]);
        else setSelectedIds(students.map(s => s.id));
    };

    const handleExportConfirm = async (format, options) => {
        if (!exportTarget) return;
        const data = await fetchExportData(exportTarget.type, exportTarget.id);
        if (!data || data.length === 0) {
            alert('작성된 글이 없습니다.');
            return;
        }
        const fileName = `${exportTarget.title}_글모음`;
        if (format === 'excel') exportToExcel(data, fileName);
        else if (format === 'googleDoc') await exportToGoogleDoc(data, fileName, options.usePageBreak);
    };

    const toggleSelection = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const copyCode = (id, code) => {
        navigator.clipboard.writeText(code);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    return {
        students, studentName, setStudentName, isAdding, selectedIds,
        isPointModalOpen, setIsPointModalOpen, isHistoryModalOpen, setIsHistoryModalOpen,
        isDeleteModalOpen, setIsDeleteModalOpen, isCodeZoomModalOpen, setIsCodeZoomModalOpen,
        isAllCodesModalOpen, setIsAllCodesModalOpen, exportModalOpen, setExportModalOpen,
        isRankingModalOpen, setIsRankingModalOpen, // [신규] 반환값 추가
        selectedStudentForCode, setSelectedStudentForCode, historyStudent, historyLogs, loadingHistory,
        deleteTarget, setDeleteTarget, exportTarget, setExportTarget, copiedId, pointFormData, setPointFormData,
        handleAddStudent, handleBulkProcessPoints, handleDeleteStudent, openHistoryModal,
        toggleSelectAll, handleExportConfirm, toggleSelection, copyCode, fetchStudents, isGapiLoaded,
        fetchDeletedStudents, handleRestoreStudent
    };
};
