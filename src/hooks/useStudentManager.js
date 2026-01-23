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

    const { fetchExportData, exportToExcel, exportToGoogleDoc } = useDataExport();

    const fetchStudents = useCallback(async () => {
        if (!classId) return;
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('created_at', { ascending: true });

        if (!error && data) setStudents(data);
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
            const { data, error } = await supabase
                .from('students')
                .insert({
                    class_id: classId,
                    name: studentName,
                    student_code: code,
                    total_points: 100
                })
                .select();

            if (error) throw error;

            if (data && data[0]) {
                const newStudent = data[0];
                await supabase.from('point_logs').insert({
                    student_id: newStudent.id,
                    amount: 100,
                    reason: '신규 등록 기념 환영 포인트! 🎁'
                });

                setStudents(prev => [...prev, newStudent]);
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
        const previousStudents = [...students];

        // 낙관적 업데이트
        setStudents(prev => prev.map(s =>
            selectedIds.includes(s.id)
                ? { ...s, total_points: (s.total_points || 0) + actualAmount }
                : s
        ));
        setIsPointModalOpen(false);

        try {
            const operations = targets.map(async (t) => {
                const newPoints = (t.total_points || 0) + actualAmount;
                const { error: upError } = await supabase.from('students').update({ total_points: newPoints }).eq('id', t.id);
                if (upError) throw upError;
                const { error: logError } = await supabase.from('point_logs').insert({ student_id: t.id, amount: actualAmount, reason: reason });
                if (logError) throw logError;
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
            const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
            if (error) throw error;
            setStudents(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSelectedIds(prev => prev.filter(id => id !== deleteTarget.id));
        } catch (error) {
            alert('삭제 실패: ' + error.message);
        } finally {
            setIsDeleteModalOpen(false);
            setDeleteTarget(null);
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
        selectedStudentForCode, setSelectedStudentForCode, historyStudent, historyLogs, loadingHistory,
        deleteTarget, setDeleteTarget, exportTarget, setExportTarget, copiedId, pointFormData, setPointFormData,
        handleAddStudent, handleBulkProcessPoints, handleDeleteStudent, openHistoryModal,
        toggleSelectAll, handleExportConfirm, toggleSelection, copyCode, fetchStudents
    };
};
