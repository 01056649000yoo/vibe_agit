import React from 'react';
import Button from '../common/Button';

const StudentManagerHeader = ({
    isDashboardMode, isMobile, toggleSelectAll, setIsPointModalOpen,
    selectedIds, students, studentName, setStudentName, handleAddStudent,
    isAdding, setIsAllCodesModalOpen
}) => {
    if (isDashboardMode) {
        return (
            <div style={{
                position: 'sticky',
                top: '-24px',
                zIndex: 10,
                background: 'white',
                padding: '8px 0 16px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #F1F3F5',
                marginBottom: '16px'
            }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.2rem', color: '#212529', fontWeight: '900' }}>👥 포인트 랭킹</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                        onClick={toggleSelectAll}
                        variant="ghost"
                        size="sm"
                        style={{ fontSize: '0.75rem', color: '#6C757D', padding: '4px 8px', minHeight: '36px' }}
                    >
                        {selectedIds.length === students.length ? '전체 해제' : '전체 선택'}
                    </Button>
                    <Button
                        onClick={() => setIsPointModalOpen(true)}
                        disabled={selectedIds.length === 0}
                        style={{
                            background: '#3498DB', color: 'white', padding: isMobile ? '6px 10px' : '6px 12px',
                            fontSize: '0.8rem', fontWeight: 'bold', borderRadius: '10px',
                            minHeight: '36px'
                        }}
                    >
                        ⚡ 포인트 {selectedIds.length > 0 && `(${selectedIds.length})`}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            position: 'sticky',
            top: '-24px',
            zIndex: 10,
            background: 'white',
            padding: '4px 0 16px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #F1F3F5',
            marginBottom: '16px'
        }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#212529', fontWeight: '900' }}>🎒 학생 명단 및 계정 관리</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: isMobile ? 'center' : 'flex-end' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                        type="text"
                        placeholder="이름 입력"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #DEE2E6', fontSize: '0.9rem', width: '100px' }}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} size="sm">추가</Button>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAllCodesModalOpen(true)}
                    style={{ background: '#FDFCF0', border: '1px solid #F7DC6F', color: '#B7950B', fontWeight: 'bold' }}
                >
                    🔑 전원 코드 확대
                </Button>
            </div>
        </div>
    );
};

export default StudentManagerHeader;
