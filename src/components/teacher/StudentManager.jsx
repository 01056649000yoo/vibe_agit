import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import ExportSelectModal from '../common/ExportSelectModal';
import { useStudentManager } from '../../hooks/useStudentManager';

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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    const {
        students, studentName, setStudentName, isAdding, selectedIds,
        isPointModalOpen, setIsPointModalOpen, isHistoryModalOpen, setIsHistoryModalOpen,
        isDeleteModalOpen, setIsDeleteModalOpen, isCodeZoomModalOpen, setIsCodeZoomModalOpen,
        isAllCodesModalOpen, setIsAllCodesModalOpen, exportModalOpen, setExportModalOpen,
        selectedStudentForCode, setSelectedStudentForCode, historyStudent, historyLogs, loadingHistory,
        deleteTarget, setDeleteTarget, exportTarget, setExportTarget, copiedId, pointFormData, setPointFormData,
        handleAddStudent, handleBulkProcessPoints, handleDeleteStudent, openHistoryModal,
        toggleSelectAll, handleExportConfirm, toggleSelection, copyCode, isGapiLoaded
    } = useStudentManager(classId);

    const [recordStudent, setRecordStudent] = useState(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);

        // 스크롤바 커스텀 스타일 주입
        const style = document.createElement('style');
        style.innerHTML = `
            .ranking-scroll::-webkit-scrollbar { width: 5px; }
            .ranking-scroll::-webkit-scrollbar-track { background: transparent; }
            .ranking-scroll::-webkit-scrollbar-thumb { background: #DEE2E6; border-radius: 10px; }
            .ranking-scroll::-webkit-scrollbar-thumb:hover { background: #ADB5BD; }
        `;
        document.head.appendChild(style);

        return () => {
            window.removeEventListener('resize', handleResize);
            document.head.removeChild(style);
        };
    }, []);

    // 용도에 따른 정렬 로직
    const displayStudents = isDashboardMode
        ? [...students].sort((a, b) => (b.activity_score || 0) - (a.activity_score || 0))
        : [...students].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const handleExportClick = (student) => {
        setExportTarget({ type: 'student', id: student.id, title: student.name });
        setExportModalOpen(true);
    };

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

            <AnimatePresence>
                {recordStudent && (
                    <RecordAssistant
                        student={recordStudent}
                        activeClass={activeClass}
                        isMobile={isMobile}
                        onClose={() => setRecordStudent(null)}
                    />
                )}
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
