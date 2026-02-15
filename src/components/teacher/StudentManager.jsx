import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import ExportSelectModal from '../common/ExportSelectModal';
import { useStudentManager } from '../../hooks/useStudentManager';
import './StudentManager.css';

// 분리된 서브 컴포넌트들
import StudentManagerHeader from './StudentManagerHeader';
import StudentRankingList from './StudentRankingList';
import StudentManagementList from './StudentManagementList';
import StudentModals from './StudentModals';
import RecordAssistant from './RecordAssistant';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (슬림 2열 그리드 버전)
 * 비즈니스 로직과 UI를 분리하여 가독성과 유지보수성을 향상시켰습니다. ✨
 */
const StudentManager = ({ classId, activeClass, isDashboardMode = true }) => {
    // [rerender-lazy-state-init] window.innerWidth 접근은 lazy initializer로 래핑
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);

    const {
        students, studentName, setStudentName, isAdding, selectedIds,
        isPointModalOpen, setIsPointModalOpen, isHistoryModalOpen, setIsHistoryModalOpen,
        isDeleteModalOpen, setIsDeleteModalOpen, isCodeZoomModalOpen, setIsCodeZoomModalOpen,
        isAllCodesModalOpen, setIsAllCodesModalOpen, exportModalOpen, setExportModalOpen,
        isRankingModalOpen, setIsRankingModalOpen, // [신규] 반환값 추가
        selectedStudentForCode, setSelectedStudentForCode, historyStudent, historyLogs, loadingHistory,
        deleteTarget, setDeleteTarget, exportTarget, setExportTarget, copiedId, pointFormData, setPointFormData,
        handleAddStudent, handleBulkProcessPoints, handleDeleteStudent, openHistoryModal,
        toggleSelectAll, handleExportConfirm, toggleSelection, copyCode, isGapiLoaded,
        fetchDeletedStudents, handleRestoreStudent
    } = useStudentManager(classId);

    const [recordStudent, setRecordStudent] = useState(null);
    const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
    const [deletedStudents, setDeletedStudents] = useState([]);

    // [js-batch-dom-css] 동적 style 태그 삽입 대신 CSS 파일로 분리 (StudentManager.css)
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // [rerender-memo] 정렬 연산을 useMemo로 메모이제이션하여 불필요한 재정렬 방지
    const displayStudents = useMemo(() => {
        return isDashboardMode
            ? [...students].sort((a, b) => (b.activity_score || 0) - (a.activity_score || 0))
            : [...students].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }, [students, isDashboardMode]);

    // [rerender-functional-setstate] useCallback으로 핸들러 안정화
    const handleExportClick = useCallback((student) => {
        setExportTarget({ type: 'student', id: student.id, title: student.name });
        setExportModalOpen(true);
    }, [setExportTarget, setExportModalOpen]);

    const handleOpenTrash = useCallback(async () => {
        const data = await fetchDeletedStudents();
        setDeletedStudents(data);
        setIsTrashModalOpen(true);
    }, [fetchDeletedStudents]);

    const handleRestore = useCallback(async (id) => {
        await handleRestoreStudent(id);
        const data = await fetchDeletedStudents();
        setDeletedStudents(data);
    }, [handleRestoreStudent, fetchDeletedStudents]);

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* 상단 헤더 섹션 */}
            <StudentManagerHeader
                isDashboardMode={isDashboardMode}
                isMobile={isMobile}
                toggleSelectAll={toggleSelectAll}
                setIsPointModalOpen={setIsPointModalOpen}
                selectedIds={selectedIds}
                students={students}
                studentName={studentName}
                setStudentName={setStudentName}
                handleAddStudent={handleAddStudent}
                isAdding={isAdding}
                setIsAllCodesModalOpen={setIsAllCodesModalOpen}
                onOpenTrash={handleOpenTrash}
                setIsRankingModalOpen={setIsRankingModalOpen} // [신규] 프롭 전달
            />

            {/* 메인 리스트 섹션 */}
            {isDashboardMode ? (
                <StudentRankingList
                    displayStudents={displayStudents}
                    isMobile={isMobile}
                    selectedIds={selectedIds}
                    toggleSelection={toggleSelection}
                    setSelectedStudentForCode={setSelectedStudentForCode}
                    setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                    copyCode={copyCode}
                    copiedId={copiedId}
                    openHistoryModal={openHistoryModal}
                    setDeleteTarget={setDeleteTarget}
                    setIsDeleteModalOpen={setIsDeleteModalOpen}
                    onOpenRecordAssistant={(s) => setRecordStudent(s)}
                />
            ) : (
                <StudentManagementList
                    displayStudents={displayStudents}
                    isMobile={isMobile}
                    setSelectedStudentForCode={setSelectedStudentForCode}
                    setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                    openHistoryModal={openHistoryModal}
                    handleExportClick={handleExportClick}
                    copyCode={copyCode}
                    copiedId={copiedId}
                    setDeleteTarget={setDeleteTarget}
                    setIsDeleteModalOpen={setIsDeleteModalOpen}
                    onOpenRecordAssistant={(s) => setRecordStudent(s)}
                />
            )}

            {/* [rendering-conditional-render] && 대신 삼항 연산자 사용 */}
            <AnimatePresence>
                {recordStudent ? (
                    <RecordAssistant
                        student={recordStudent}
                        activeClass={activeClass}
                        isMobile={isMobile}
                        onClose={() => setRecordStudent(null)}
                    />
                ) : null}
            </AnimatePresence>

            {/* 통합 모달 섹션 */}
            <StudentModals
                isPointModalOpen={isPointModalOpen}
                setIsPointModalOpen={setIsPointModalOpen}
                pointFormData={pointFormData}
                setPointFormData={setPointFormData}
                handleBulkProcessPoints={handleBulkProcessPoints}
                isHistoryModalOpen={isHistoryModalOpen}
                setIsHistoryModalOpen={setIsHistoryModalOpen}
                historyStudent={historyStudent}
                historyLogs={historyLogs}
                loadingHistory={loadingHistory}
                isDeleteModalOpen={isDeleteModalOpen}
                setIsDeleteModalOpen={setIsDeleteModalOpen}
                deleteTarget={deleteTarget}
                handleDeleteStudent={handleDeleteStudent}
                isCodeZoomModalOpen={isCodeZoomModalOpen}
                setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                isAllCodesModalOpen={isAllCodesModalOpen}
                setIsAllCodesModalOpen={setIsAllCodesModalOpen}
                selectedStudentForCode={selectedStudentForCode}
                students={students}
                isTrashModalOpen={isTrashModalOpen}
                setIsTrashModalOpen={setIsTrashModalOpen}
                deletedStudents={deletedStudents}
                handleRestore={handleRestore}
                isRankingModalOpen={isRankingModalOpen}
                setIsRankingModalOpen={setIsRankingModalOpen}
                displayStudents={displayStudents}
            />

            {/* 엑셀/구글문서 내보내기 선택 모달 */}
            <ExportSelectModal
                isOpen={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                onConfirm={handleExportConfirm}
                title={exportTarget?.title ? `${exportTarget.title} 학생` : '데이터 내보내기'}
                isGapiLoaded={isGapiLoaded}
            />
        </div>
    );
};


export default StudentManager;
