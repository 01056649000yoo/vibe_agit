import React from 'react';
import Button from '../common/Button';
import TeacherGuideButton from './TeacherGuideButton';
import { TEACHER_TOUR_ANCHORS, tourAnchor } from '../../guides/teacherTour.js';

const StudentManagerHeader = ({
    isDashboardMode, isMobile, toggleSelectAll, setIsPointModalOpen,
    selectedIds, students, studentName, setStudentName, handleAddStudent, onOpenRosterPaste,
    isAdding, setIsAllCodesModalOpen, onOpenTrash, setIsRankingModalOpen,
    searchTerm, setSearchTerm, sortMode, setSortMode, onRenumber
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
            padding: '2px 0 12px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #F1F3F5',
            marginBottom: '10px', gap: '12px', flexWrap: 'wrap'
        }}>
            {/* 이 메뉴는 세부 메뉴 목록이 없어(그룹에 탭이 하나뿐) 화면 제목 옆에 사용법 ⓘ 를 둔다 */}
            <div className="student-list-heading">
                <h3 className="student-list-heading__title">
                    <span aria-hidden="true">👥</span>
                    <span>학생 명단</span>
                    <span className="student-list-heading__count">{students.length}명</span>
                </h3>
                <TeacherGuideButton tabId="students" variant="help" className="student-list-heading__help" />
            </div>
            {/*
              * 도구를 셋으로 가른다(2026-09-14 지적: 눈에 잘 안 들어온다).
              *   ① 찾기 — 이름 검색 · 정렬
              *   ② 명단에 넣기 — 이름 한 명 · 명단 일괄 붙여넣기. **여기만 색을 준다.**
              *   ③ 명단 손보기 — 번호 다시 매기기 · 복구함 · 전원 코드
              * 전에는 일곱 개가 한 줄에 뒤섞이고 배경색이 셋(파랑·회색·노랑)이라, 색이 많은데
              * 무엇이 중요한지는 알 수 없었다. 색이 아니라 **자리**로 가른다.
              */}
            <div className={`student-toolbar${isMobile ? ' is-mobile' : ''}`}>
                <div className="student-toolbar__group">
                    <input type="search" className="student-toolbar__search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="학생 이름 검색" aria-label="학생 이름 검색" />
                    <select className="student-toolbar__select" value={sortMode} onChange={(e) => setSortMode(e.target.value)} aria-label="학생 정렬">
                        <option value="number">번호순</option><option value="name">이름순</option><option value="points">포인트순</option><option value="recent">최근 등록순</option>
                    </select>
                </div>

                {/* 동행 모드가 짚는 자리다. 묶음을 바꾸더라도 이 상자는 그대로 둔다. */}
                <div className="student-toolbar__group student-toolbar__group--add" {...tourAnchor(TEACHER_TOUR_ANCHORS.STUDENT_ADD)}>
                    <input
                        type="text"
                        className="student-toolbar__name"
                        placeholder="이름 입력"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                    />
                    <Button onClick={handleAddStudent} disabled={isAdding} size="sm">추가</Button>
                    {/* 명단은 이미 나이스·엑셀에 있다. 한 명씩 치게 두면 거기서 멈춘다(2026-09-14 분석). */}
                    <Button onClick={() => onOpenRosterPaste?.()} disabled={isAdding} size="sm" variant="primary">📋 명단 일괄 붙여넣기</Button>
                </div>

                <div className="student-toolbar__group student-toolbar__group--manage">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="student-toolbar__tool"
                        onClick={() => onRenumber?.('name')}
                        title="이름 가나다순으로 번호를 1번부터 다시 붙입니다. 번호나 이름은 명단에서 눌러 바로 고칠 수도 있습니다."
                    >
                        🔢 번호 다시 매기기
                    </Button>
                    <Button variant="ghost" size="sm" className="student-toolbar__tool" onClick={onOpenTrash}>
                        ♻️ 복구함
                    </Button>
                    <Button variant="ghost" size="sm" className="student-toolbar__tool" onClick={() => setIsAllCodesModalOpen(true)}>
                        🔑 전원 코드 확대
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default StudentManagerHeader;
