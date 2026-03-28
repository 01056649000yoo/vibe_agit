import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useDataExport } from './useDataExport';
import { dataCache } from '../lib/cache';

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

        const [ studentsData, statsData ] = await Promise.all([
            dataCache.get(`students_${classId}`, async () => {
                const { data, error } = await supabase
                    .from('students')
                    // 학생 관리 목록에 필요한 모든 필수 정보 선택
                    .select('id, name, total_points, student_code, created_at, pet_data, class_id')
                    .eq('class_id', classId)
                    .is('deleted_at', null)
                    .order('name');
                
                if (error) throw error;
                return data || [];
            }, 120000),
            dataCache.get(`stats_${classId}`, async () => {
                const { data, error } = await supabase.rpc('get_class_activity_stats', { p_class_id: classId });
                if (error) throw error;
                return data || [];
            }, 60000)
        ]);

        if (!studentsData) {
            console.error('학생 목록 로드 실패 (데이터 없음)');
            return;
        }

        const statsMap = {};
        if (statsData) {
            statsData.forEach(stat => {
                statsMap[stat.student_id] = stat;
            });
        }

        const studentsWithStats = studentsData.map(s => {
            const stat = statsMap[s.id] || { score_all: 0, score_week: 0, score_month: 0 };
            return {
                ...s,
                activity_score: stat.score_all || 0, 
                score_all: stat.score_all || 0,
                score_week: stat.score_week || 0,
                score_month: stat.score_month || 0
            };
        });

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
                // 새 학생 추가 후 상태 동기화를 위해 필수 필드(이름, 코드, 포인트, 펫 등)만 선택
                .select('id, name, total_points, student_code, created_at, pet_data, class_id')
                .eq('id', newStudentId)
                .single();

            if (fetchError) throw fetchError;

            if (newStudentData) {
                dataCache.invalidate(`students_${classId}`);
                await fetchStudents();
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
            
            // [추가] 캐시 무효화: 소프트 딜리트 시에도 목록 갱신을 위해 캐시 무효화
            dataCache.invalidate(`students_${classId}`);
            dataCache.invalidate(`stats_${classId}`);

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

    const handleDeleteStudentImmediately = async () => {
        if (!deleteTarget) return;
        if (!window.confirm(`⚠️ 정말로 [${deleteTarget.name}] 학생을 즉시 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 활동 데이터가 삭제됩니다.`)) return;

        try {
            const { error } = await supabase.rpc('delete_student_immediately', {
                p_student_id: deleteTarget.id
            });

            if (error) throw error;

            // [추가] 캐시 무효화: 즉시 삭제 시 학급 전체 학생 목록 및 통계 캐시 갱신 유도
            dataCache.invalidate(`students_${classId}`);
            dataCache.invalidate(`stats_${classId}`);

            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));

            alert(`[${deleteTarget.name}] 학생이 즉시 영구 삭제되었습니다. 🗑️`);
        } catch (error) {
            alert('즉시 삭제 실패: ' + error.message);
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
                // 복구함 목록 표시를 위해 이름과 삭제 일시 정보만 필터링해서 선택
                .select('id, name, deleted_at, class_id')
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
            // 포인트 변동 내역 표시를 위해 변동량, 사유, 일시 선택
            .select('id, amount, reason, created_at, student_id')
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
        students, studentName, setStudentName, isAdding, selectedIds, setSelectedIds,
        isPointModalOpen, setIsPointModalOpen, isHistoryModalOpen, setIsHistoryModalOpen,
        isDeleteModalOpen, setIsDeleteModalOpen, isCodeZoomModalOpen, setIsCodeZoomModalOpen,
        isAllCodesModalOpen, setIsAllCodesModalOpen, exportModalOpen, setExportModalOpen,
        isRankingModalOpen, setIsRankingModalOpen, // [신규] 반환값 추가
        selectedStudentForCode, setSelectedStudentForCode, historyStudent, historyLogs, loadingHistory,
        deleteTarget, setDeleteTarget, exportTarget, setExportTarget, copiedId, pointFormData, setPointFormData,
        handleAddStudent, handleBulkProcessPoints, handleDeleteStudent, handleDeleteStudentImmediately, openHistoryModal,
        toggleSelectAll, handleExportConfirm, toggleSelection, copyCode, fetchStudents, isGapiLoaded,
        fetchDeletedStudents, handleRestoreStudent
    };
};
