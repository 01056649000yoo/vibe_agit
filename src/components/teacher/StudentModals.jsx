import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../common/Card';
import Button from '../common/Button';

const StudentModals = ({
    isPointModalOpen, setIsPointModalOpen, pointFormData, setPointFormData, handleBulkProcessPoints,
    isHistoryModalOpen, setIsHistoryModalOpen, historyStudent, historyLogs, loadingHistory,
    isDeleteModalOpen, setIsDeleteModalOpen, deleteTarget, handleDeleteStudent, handleDeleteStudentImmediately,
    isCodeZoomModalOpen, setIsCodeZoomModalOpen, isAllCodesModalOpen, setIsAllCodesModalOpen,
    selectedStudentForCode, students,
    isTrashModalOpen, setIsTrashModalOpen, deletedStudents, handleRestore,
    isRankingModalOpen, setIsRankingModalOpen, displayStudents
}) => {
    // [신규] 랭킹 탭 상태 관리
    const [rankingTab, setRankingTab] = React.useState('all'); // 'all', 'week', 'month'

    // 선택된 탭에 따라 학생 목록 재정렬
    const sortedRanking = React.useMemo(() => {
        if (!isRankingModalOpen) return [];
        const scoreKey = rankingTab === 'week' ? 'score_week' : rankingTab === 'month' ? 'score_month' : 'score_all';
        return [...displayStudents].sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0));
    }, [displayStudents, rankingTab, isRankingModalOpen]);
    return (
        <AnimatePresence>
            {isPointModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
                    <Card style={{ width: '90%', maxWidth: '340px', padding: '24px', borderRadius: '24px', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <h3 style={{ margin: '0 0 20px 0', textAlign: 'center', color: '#212529' }}>⚡ 포인트 지급/차감</h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <button onClick={() => setPointFormData(p => ({ ...p, type: 'give' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: pointFormData.type === 'give' ? '#3498DB' : '#F8F9FA', color: pointFormData.type === 'give' ? 'white' : '#ADB5BD', fontWeight: 'bold', cursor: 'pointer' }}>+ 주기</button>
                            <button onClick={() => setPointFormData(p => ({ ...p, type: 'take' }))} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: pointFormData.type === 'take' ? '#E74C3C' : '#F8F9FA', color: pointFormData.type === 'take' ? 'white' : '#ADB5BD', fontWeight: 'bold', cursor: 'pointer' }}>- 빼기</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                            <input type="number" value={pointFormData.amount} onChange={(e) => setPointFormData(p => ({ ...p, amount: parseInt(e.target.value) || 0 }))} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #E9ECEF', boxSizing: 'border-box' }} />
                            <input type="text" value={pointFormData.reason} onChange={(e) => setPointFormData(p => ({ ...p, reason: e.target.value }))} placeholder="사유를 입력하세요" style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #E9ECEF', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsPointModalOpen(false)}>취소</Button>
                            <Button style={{ flex: 2, backgroundColor: '#3498DB', color: 'white', fontWeight: '900' }} onClick={handleBulkProcessPoints}>반영하기</Button>
                        </div>
                    </Card>
                </div>
            )}

            {isHistoryModalOpen && (
                <div
                    onClick={() => setIsHistoryModalOpen(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}
                >
                    <Card
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '90%', maxWidth: '380px', maxHeight: '70vh', padding: '24px', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}
                    >
                        <h3 style={{ margin: '0 0 16px 0', borderBottom: '1px solid #F1F3F5', paddingBottom: '12px' }}>📜 {historyStudent?.name}님의 활동 기록</h3>
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', maxHeight: '50vh' }}>
                            {loadingHistory ? <p style={{ textAlign: 'center', color: '#ADB5BD' }}>로딩 중...</p> : historyLogs.length === 0 ? <p style={{ textAlign: 'center', color: '#ADB5BD' }}>기록이 없습니다.</p> : historyLogs.map((l, idx) => (
                                <div key={l.id || `log-${idx}`} style={{ padding: '12px 0', borderBottom: '1px solid #F8F9FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#495057' }}>{l.reason}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#ADB5BD' }}>{new Date(l.created_at).toLocaleString()}</div>
                                    </div>
                                    <div style={{ fontWeight: '900', color: l.amount > 0 ? '#27AE60' : '#E74C3C', fontSize: '1rem' }}>{l.amount > 0 ? `+${l.amount}` : l.amount}</div>
                                </div>
                            ))}
                        </div>
                        <Button style={{ marginTop: '16px', borderRadius: '12px' }} onClick={() => setIsHistoryModalOpen(false)}>확인</Button>
                    </Card>
                </div>
            )}

            {isDeleteModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
                    <Card style={{ width: '340px', padding: '24px', textAlign: 'center', borderRadius: '24px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 8px 0' }}>학생을 삭제할까요?</h3>
                        <p style={{ color: '#6C757D', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.5' }}>
                            {deleteTarget?.name} 학생 정보를 삭제합니다.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <Button
                                style={{ backgroundColor: '#E74C3C', color: 'white', fontWeight: 'bold', width: '100%' }}
                                onClick={handleDeleteStudent}
                            >
                                📦 복구함으로 이동 (3일간 보관)
                            </Button>

                            <Button
                                variant="ghost"
                                style={{ color: '#E74C3C', border: '1px solid #FFDada', width: '100%', fontWeight: 'bold' }}
                                onClick={handleDeleteStudentImmediately}
                            >
                                🗑️ 즉시 영구 삭제
                            </Button>

                            <Button
                                variant="ghost"
                                style={{ width: '100%', color: '#ADB5BD' }}
                                onClick={() => setIsDeleteModalOpen(false)}
                            >
                                취소
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {isTrashModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(44, 62, 80, 0.7)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 9999, backdropFilter: 'blur(8px)'
                }}>
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        style={{ width: '90%', maxWidth: '450px' }}
                    >
                        <Card style={{ padding: '32px', borderRadius: '32px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '1.5rem', margin: 0, color: '#2C3E50', fontWeight: '900' }}>🗑️ 삭제된 학생 복구</h2>
                                <button onClick={() => setIsTrashModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                            </div>

                            <div style={{ background: '#FFFCEB', padding: '16px', borderRadius: '16px', border: '1px solid #FFE082', marginBottom: '24px' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#B26700', lineHeight: '1.5', fontWeight: 'bold' }}>
                                    💡 삭제된 학생은 <span style={{ textDecoration: 'underline' }}>삭제 후 3일간</span> 이곳에서 복구하실 수 있습니다.
                                    3일이 경과하면 모든 데이터가 자동으로 영구 삭제됩니다.
                                </p>
                            </div>

                            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                                {(!deletedStudents || deletedStudents.length === 0) ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🍃</div>
                                        복구할 수 있는 학생이 없습니다.
                                    </div>
                                ) : (
                                    deletedStudents.map(s => (
                                        <div key={s.id} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '16px', borderRadius: '16px', background: '#F8F9FA',
                                            border: '1px solid #F1F3F5'
                                        }}>
                                            <div>
                                                <span style={{ fontWeight: 'bold', color: '#2C3E50', display: 'block' }}>👤 {s.name}</span>
                                                <span style={{ fontSize: '0.75rem', color: '#95A5A6' }}>
                                                    삭제일: {new Date(s.deleted_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                style={{ background: '#E3F2FD', color: '#1976D2', border: '1px solid #BBDEFB' }}
                                                onClick={() => handleRestore(s.id)}
                                            >
                                                되돌리기
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <Button
                                variant="ghost"
                                style={{ width: '100%', height: '54px', marginTop: '24px', borderRadius: '16px', fontWeight: 'bold' }}
                                onClick={() => setIsTrashModalOpen(false)}
                            >
                                닫기
                            </Button>
                        </Card>
                    </motion.div>
                </div>
            )}

            {isCodeZoomModalOpen && selectedStudentForCode && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.98)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(10px)' }}>
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '1.5rem', color: '#7F8C8D', fontWeight: 'bold', display: 'block', marginBottom: '20px' }}>{selectedStudentForCode.name} 학생의 접속 코드</span>
                        <h1 style={{ fontSize: '8rem', letterSpacing: '20px', margin: '40px 0', color: '#2C3E50', fontFamily: 'monospace', fontWeight: '900' }}>
                            {selectedStudentForCode.student_code}
                        </h1>
                        <Button style={{ padding: '20px 60px', fontSize: '1.5rem', borderRadius: '20px' }} onClick={() => setIsCodeZoomModalOpen(false)}>닫기</Button>
                    </motion.div>
                </div>
            )}

            {isAllCodesModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
                    <Card style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', padding: '40px', borderRadius: '32px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#2C3E50', fontWeight: '900' }}>🔑 우리 반 접속 코드 전체 확인</h2>
                            <Button variant="ghost" onClick={() => setIsAllCodesModalOpen(false)}>닫기</Button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', padding: '10px' }}>
                            {students.map(s => (
                                <div key={s.id} style={{ padding: '16px', borderRadius: '16px', background: '#F8F9FA', border: '1px solid #E9ECEF', textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold', color: '#7F8C8D', fontSize: '0.9rem', marginBottom: '8px' }}>{s.name}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#3498DB', fontFamily: 'monospace', letterSpacing: '1px' }}>{s.student_code}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '20px', textAlign: 'center', color: '#95A5A6', fontSize: '0.9rem' }}>
                            화면을 캡처하거나 크게 띄워 아이들에게 안내해 주세요. ✨
                        </div>
                    </Card>
                </div>
            )}

            {isRankingModalOpen && (
                <div
                    onClick={() => setIsRankingModalOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(244, 247, 250, 0.95)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px', backdropFilter: 'blur(10px)' }}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', background: 'white', borderRadius: '40px', boxShadow: '0 30px 80px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E9ECEF' }}
                    >
                        {/* 모달 헤더 */}
                        <div style={{ padding: '40px 40px 10px 40px', background: 'linear-gradient(135deg, #F8FAFF 0%, #FFFFFF 100%)', borderBottom: '1px solid #F1F3F5', position: 'relative' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👑</div>
                                <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: '1000', color: '#2C3E50', letterSpacing: '-1px' }}>우리 반 활동 열정 랭킹</h2>

                                {/* 탭 스위처 */}
                                <div style={{
                                    display: 'inline-flex',
                                    background: '#F1F3F5',
                                    padding: '5px',
                                    borderRadius: '16px',
                                    marginTop: '20px',
                                    gap: '5px'
                                }}>
                                    {[
                                        { id: 'all', label: '전체 랭킹' },
                                        { id: 'week', label: '최근 1주일' },
                                        { id: 'month', label: '최근 1달' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setRankingTab(tab.id)}
                                            style={{
                                                padding: '8px 20px',
                                                borderRadius: '12px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: '0.95rem',
                                                fontWeight: 'bold',
                                                transition: 'all 0.2s',
                                                background: rankingTab === tab.id ? 'white' : 'transparent',
                                                color: rankingTab === tab.id ? '#3498DB' : '#ADB5BD',
                                                boxShadow: rankingTab === tab.id ? '0 4px 10px rgba(0,0,0,0.05)' : 'none'
                                            }}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                onClick={() => setIsRankingModalOpen(false)}
                                style={{ position: 'absolute', top: '30px', right: '30px', background: '#F8F9FA', border: 'none', width: '50px', height: '50px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', color: '#7F8C8D', fontWeight: 'bold' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* 랭킹 리스트 영역 */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 30px 40px 30px' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                gap: '12px'
                            }}>
                                {sortedRanking.map((s, idx) => {
                                    const isTop3 = idx < 3;
                                    const scoreKey = rankingTab === 'week' ? 'score_week' : rankingTab === 'month' ? 'score_month' : 'score_all';
                                    const score = s[scoreKey] || 0;

                                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                                    const bgColor = idx === 0 ? '#FFF9C4' : idx === 1 ? '#F5F5F5' : idx === 2 ? '#FFF3E0' : '#FDFDFD';
                                    const borderColor = idx === 0 ? '#FBC02D' : idx === 1 ? '#E0E0E0' : idx === 2 ? '#FFE0B2' : '#F1F3F5';

                                    return (
                                        <motion.div
                                            key={`${rankingTab}-${s.id}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            style={{
                                                padding: '16px 12px',
                                                borderRadius: '20px',
                                                background: bgColor,
                                                border: `1.5px solid ${borderColor}`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '8px',
                                                boxShadow: isTop3 ? '0 8px 16px rgba(0,0,0,0.04)' : 'none',
                                                position: 'relative'
                                            }}
                                        >
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%', background: isTop3 ? 'white' : 'rgba(0,0,0,0.03)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900', color: isTop3 ? '#2C3E50' : '#ADB5BD',
                                                boxShadow: isTop3 ? '0 2px 5px rgba(0,0,0,0.1)' : 'none'
                                            }}>
                                                {medal || (idx + 1)}
                                            </div>
                                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#2C3E50', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                {s.name}
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.3rem', fontWeight: '1000', color: isTop3 ? '#F39C12' : '#546E7A', fontFamily: 'Outfit' }}>
                                                    {score.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#ADB5BD', marginTop: '-2px', letterSpacing: '0.5px' }}>POINTS</div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 모달 푸터 */}
                        <div style={{ padding: '30px', textAlign: 'center', background: '#F8F9FA', borderTop: '1px solid #F1F3F5' }}>
                            <Button size="lg" style={{ minWidth: '200px', borderRadius: '20px', fontWeight: '1000', fontSize: '1.1rem' }} onClick={() => setIsRankingModalOpen(false)}>확인했습니다!</Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StudentModals;
