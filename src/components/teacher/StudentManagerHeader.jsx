import React from 'react';
import Button from '../common/Button';

const StudentManagerHeader = ({
    isDashboardMode, isMobile, toggleSelectAll, setIsPointModalOpen,
    selectedIds, students, studentName, setStudentName, handleAddStudent,
    isAdding, setIsAllCodesModalOpen, onOpenTrash, setIsRankingModalOpen
}) => {
    const [showRankingInfo, setShowRankingInfo] = React.useState(false);

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                    <h3
                        onClick={() => setIsRankingModalOpen(true)}
                        onMouseEnter={(e) => e.target.style.color = '#3498DB'}
                        onMouseLeave={(e) => e.target.style.color = '#212529'}
                        style={{
                            margin: 0,
                            fontSize: isMobile ? '1.1rem' : '1.2rem',
                            color: '#212529',
                            fontWeight: '1000',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'color 0.2s'
                        }}
                    >
                        👥 활동지수랭킹 <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>↗</span>
                    </h3>
                    <button
                        onClick={() => setShowRankingInfo(!showRankingInfo)}
                        style={{
                            background: showRankingInfo ? '#2C3E50' : '#F1F3F5',
                            border: 'none',
                            color: showRankingInfo ? 'white' : '#adb5bd',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        !
                    </button>

                    {/* 활동지수 안내 풍선 도움말 */}
                    {showRankingInfo && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                                onClick={() => setShowRankingInfo(false)}
                            />
                            <div style={{
                                position: 'absolute',
                                top: '30px',
                                left: '0',
                                width: '260px',
                                padding: '16px',
                                background: '#2C3E50',
                                color: 'white',
                                borderRadius: '16px',
                                fontSize: '0.85rem',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                zIndex: 100,
                                lineHeight: '1.6'
                            }}>
                                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: '8px', mb: '8px', fontWeight: 'bold', color: '#FBC02D' }}>
                                    📊 활동지수 랭킹 안내
                                </div>
                                <div>
                                    활동지수는 학생들이 획득한 <span style={{ color: '#FBC02D', fontWeight: 'bold' }}>모든 포인트의 누계</span>입니다.<br /><br />
                                    사용하거나 차감된 포인트를 제외한 <b>'총 획득량'</b>을 기준으로 하여, 학생들의 열정적인 참여도를 한눈에 확인할 수 있습니다! 🚀
                                </div>
                                <div style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    left: '24px',
                                    width: '12px',
                                    height: '12px',
                                    background: '#2C3E50',
                                    transform: 'rotate(45deg)'
                                }} />
                            </div>
                        </>
                    )}
                </div>
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
                    onClick={onOpenTrash}
                    style={{ background: '#F8F9FA', border: '1px solid #E9ECEF', color: '#7F8C8D', fontWeight: 'bold' }}
                >
                    ♻️ 복구함
                </Button>
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
