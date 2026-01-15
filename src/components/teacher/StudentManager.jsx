import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 학급 내 학생 명단 관리 (슬림 2열 그리드 버전)
 * 상단 컨트롤 바를 2줄로 구성하여 여유 공간을 확보하고, 학생 카드를 슬림하게 조정했습니다. ✨
 */
const StudentManager = ({ classId, isDashboardMode = true }) => {
    const [studentName, setStudentName] = useState('');
    const [students, setStudents] = useState([]);
    const [isAdding, setIsAdding] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

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

    // 선택 및 모달 상태
    const [selectedIds, setSelectedIds] = useState([]);
    const [isPointModalOpen, setIsPointModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCodeZoomModalOpen, setIsCodeZoomModalOpen] = useState(false); // 개별 코드 확대
    const [isAllCodesModalOpen, setIsAllCodesModalOpen] = useState(false); // 전원 코드 확인
    const [selectedStudentForCode, setSelectedStudentForCode] = useState(null);
    const [copiedId, setCopiedId] = useState(null); // [추가] 복사 완료 툴팁 상태

    // 포인트 통합 모달 데이터
    const [pointFormData, setPointFormData] = useState({
        type: 'give',
        amount: 10,
        reason: '참여도가 높아요! 🌟'
    });

    const [historyStudent, setHistoryStudent] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 데이터 호출
    useEffect(() => {
        if (classId) fetchStudents();
        return () => {
            setStudents([]);
            setSelectedIds([]);
        };
    }, [classId]);

    const fetchStudents = async () => {
        if (!classId) return;
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', classId)
            .order('total_points', { ascending: false }); // [수정] 포인트 높은 순(랭킹)으로 정렬

        if (!error && data) setStudents(data);
    };

    // 포인트 일괄 처리
    const handleBulkProcessPoints = async () => {
        if (selectedIds.length === 0) return;
        if (!pointFormData.reason.trim()) return alert('활동 사유를 입력해주세요! ✍️');

        const { type, amount, reason } = pointFormData;
        const actualAmount = type === 'give' ? amount : -amount;
        const targets = students.filter(s => selectedIds.includes(s.id));
        const previousStudents = [...students];

        setStudents(prev => {
            const up = prev.map(s => {
                if (selectedIds.includes(s.id)) {
                    return { ...s, total_points: (s.total_points || 0) + actualAmount };
                }
                return s;
            });
            // 포인트 변동 즉시 재정렬 (내림차순)
            return [...up].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
        });
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
        const { data, error } = await supabase.from('point_logs').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
        if (!error) setHistoryLogs(data || []);
        setLoadingHistory(false);
    };

    const handleAddStudent = async () => {
        if (!studentName.trim()) return;
        setIsAdding(true);
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        const { data, error } = await supabase.from('students').insert({ class_id: classId, name: studentName, student_code: code, total_points: 0 }).select();
        if (!error && data[0]) {
            setStudents(prev => [...prev, data[0]].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)));
            setStudentName('');
        }
        setIsAdding(false);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === students.length) setSelectedIds([]);
        else setSelectedIds(students.map(s => s.id));
    };

    if (isDashboardMode) {
        const maxPoints = students.length > 0 ? Math.max(...students.map(s => s.total_points || 0)) : 0;

        return (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <div style={{
                    position: 'sticky',
                    top: '-24px', // 대시보드 내부 스크롤이므로 상단 슬림 헤더와 겹치지 않게 조정
                    zIndex: 10,
                    background: 'white',
                    padding: '8px 0 16px 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #F1F3F5',
                    marginBottom: '16px'
                }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.2rem', color: '#212529', fontWeight: '900' }}>👥 우리 반 학생 명단</h3>
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

                <div style={{ position: 'relative', width: '100%' }}>
                    <div
                        className="ranking-scroll"
                        style={{
                            maxHeight: isMobile ? '340px' : '440px', // 약 5~6명 분량
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: isMobile ? '6px' : '8px',
                            paddingRight: '4px',
                            paddingBottom: '20px', // 그라데이션 겹침 방지
                            boxSizing: 'border-box'
                        }}
                    >
                        {students.map((s, idx) => {
                            const isFirst = idx === 0;
                            const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}위`;

                            return (
                                <motion.div
                                    key={s.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.03 }}
                                    onClick={() => setSelectedIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        padding: isMobile ? '10px 14px' : '12px 16px',
                                        background: isFirst ? '#FFFDE7' : (selectedIds.includes(s.id) ? '#EBF5FB' : '#FDFEFE'),
                                        border: `1px solid ${isFirst ? '#F7DC6F' : (selectedIds.includes(s.id) ? '#3498DB' : '#F1F3F5')}`,
                                        borderRadius: '20px', cursor: 'pointer', transition: 'all 0.15s',
                                        fontSize: isMobile ? '0.85rem' : '0.95rem', width: '100%', boxSizing: 'border-box',
                                        boxShadow: isFirst ? '0 4px 12px rgba(247, 220, 111, 0.2)' : 'none'
                                    }}
                                >
                                    {/* 랭킹 표시 */}
                                    <div style={{
                                        width: isMobile ? '35px' : '45px',
                                        fontWeight: '900',
                                        color: isFirst ? '#F39C12' : '#ADB5BD',
                                        fontSize: isFirst ? '1.4rem' : '1rem',
                                        display: 'flex', justifyContent: 'center'
                                    }}>
                                        {rankIcon}
                                    </div>

                                    {/* 이름 */}
                                    <div style={{ flex: 1, fontWeight: '800', color: '#34495E', fontSize: '1rem' }}>{s.name}</div>

                                    {/* 포인트 강조 표시 */}
                                    <div style={{ marginRight: '12px', textAlign: 'right' }}>
                                        <span style={{
                                            fontWeight: '900',
                                            color: isFirst ? '#F39C12' : '#212529',
                                            fontSize: '1.2rem',
                                            fontFamily: 'Outfit, sans-serif'
                                        }}>
                                            {(s.total_points || 0).toLocaleString()}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: isFirst ? '#F39C12' : '#ADB5BD', marginLeft: '2px', fontWeight: 'bold' }}>P</span>
                                    </div>

                                    {/* 관리 버튼 그룹 (우측 정렬) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedStudentForCode(s);
                                                setIsCodeZoomModalOpen(true);
                                            }}
                                            style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                            title="코드 크게보기"
                                        >
                                            🔍
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(s.student_code);
                                                setCopiedId(s.id);
                                                setTimeout(() => setCopiedId(null), 1500);
                                            }}
                                            style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative' }}
                                            title="코드 복사"
                                        >
                                            📋
                                            <AnimatePresence>
                                                {copiedId === s.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -35 }} exit={{ opacity: 0 }}
                                                        style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#2ECC71', color: 'white', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 10 }}
                                                    >
                                                        복사됨! ✅
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openHistoryModal(s); }}
                                            style={{ background: 'white', border: '1px solid #EEE', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                            title="포인트 기록"
                                        >
                                            📜
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                            style={{ background: '#FFF5F5', border: '1px solid #FFDada', cursor: 'pointer', padding: '6px', borderRadius: '8px', fontSize: '0.9rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                            title="학생 삭제"
                                        >
                                            �️
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                    {/* 하단 내용 더 있음 암시 그라데이션 */}
                    {students.length > 5 && (
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px',
                            background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent)',
                            pointerEvents: 'none', borderRadius: '0 0 24px 24px'
                        }} />
                    )}
                </div>

                <CommonModals
                    isPointModalOpen={isPointModalOpen} setIsPointModalOpen={setIsPointModalOpen}
                    pointFormData={pointFormData} setPointFormData={setPointFormData}
                    handleBulkProcessPoints={handleBulkProcessPoints}
                    isHistoryModalOpen={isHistoryModalOpen} setIsHistoryModalOpen={setIsHistoryModalOpen}
                    historyStudent={historyStudent} historyLogs={historyLogs} loadingHistory={loadingHistory}
                    isCodeZoomModalOpen={isCodeZoomModalOpen} setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                    isAllCodesModalOpen={isAllCodesModalOpen} setIsAllCodesModalOpen={setIsAllCodesModalOpen}
                    selectedStudentForCode={selectedStudentForCode}
                    students={students}
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
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

            <div
                className="ranking-scroll"
                style={{
                    maxHeight: isMobile ? 'calc(100vh - 300px)' : '600px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    paddingRight: '6px'
                }}
            >
                {students.map((s, idx) => {
                    const isFirst = idx === 0;
                    const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}위`;

                    return (
                        <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            style={{
                                display: 'flex', alignItems: 'center', padding: '12px 16px',
                                background: isFirst ? '#FFFDE7' : 'white',
                                border: `1px solid ${isFirst ? '#F7DC6F' : '#E9ECEF'}`,
                                borderRadius: '20px',
                                justifyContent: 'space-between',
                                minHeight: '70px',
                                boxShadow: isFirst ? '0 4px 15px rgba(247, 220, 111, 0.15)' : '0 2px 10px rgba(0,0,0,0.02)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {/* 좌측 그룹: 랭킹 + 이름 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 150px' }}>
                                <div style={{
                                    width: '40px', fontWeight: '900', color: isFirst ? '#F39C12' : '#ADB5BD',
                                    fontSize: isFirst ? '1.4rem' : '1rem', display: 'flex', justifyContent: 'center'
                                }}>
                                    {rankIcon}
                                </div>
                                <span style={{ fontWeight: '800', color: '#34495E', fontSize: '1.1rem', letterSpacing: '-0.3px' }}>{s.name}</span>
                            </div>

                            {/* 중앙 그룹: 접속코드 (관리용) */}
                            <div style={{
                                flex: 1,
                                textAlign: 'center',
                                fontSize: '1.5rem',
                                color: '#3498DB',
                                fontWeight: '900',
                                fontFamily: 'monospace',
                                letterSpacing: '3px',
                                background: '#F8F9FA',
                                padding: '4px 12px',
                                borderRadius: '10px',
                                margin: '0 20px'
                            }}>
                                {s.student_code}
                            </div>

                            {/* 우측 그룹: 포인트 + 관리 버튼 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ textAlign: 'right', minWidth: '80px' }}>
                                    <span style={{ fontWeight: '900', color: isFirst ? '#F39C12' : '#2C3E50', fontSize: '1.3rem' }}>
                                        {(s.total_points || 0).toLocaleString()}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: isFirst ? '#F39C12' : '#ADB5BD', marginLeft: '3px', fontWeight: 'bold' }}>P</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        onClick={() => { setSelectedStudentForCode(s); setIsCodeZoomModalOpen(true); }}
                                        style={{ background: '#F8F9FA', border: '1px solid #E9ECEF', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}
                                        title="크게 보기" > 🔍 </button>

                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(s.student_code); setCopiedId(s.id); setTimeout(() => setCopiedId(null), 1500); }}
                                            style={{ background: '#FDFCF0', border: '1px solid #F7DC6F', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}
                                            title="코드 복사" > 📋 </button>
                                        <AnimatePresence>
                                            {copiedId === s.id && (
                                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: -40 }} exit={{ opacity: 0 }}
                                                    style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#2ECC71', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 4px 10px rgba(46, 204, 113, 0.3)' }} >
                                                    복사됨! ✅
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <button
                                        onClick={() => { setDeleteTarget(s); setIsDeleteModalOpen(true); }}
                                        style={{ background: '#FFF5F5', border: '1px solid #FFDada', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', transition: 'all 0.2s' }}
                                        title="학생 삭제" > 🗑️ </button>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <CommonModals
                isDeleteModalOpen={isDeleteModalOpen} setIsDeleteModalOpen={setIsDeleteModalOpen}
                deleteTarget={deleteTarget} handleDeleteStudent={handleDeleteStudent}
                isCodeZoomModalOpen={isCodeZoomModalOpen} setIsCodeZoomModalOpen={setIsCodeZoomModalOpen}
                isAllCodesModalOpen={isAllCodesModalOpen} setIsAllCodesModalOpen={setIsAllCodesModalOpen}
                selectedStudentForCode={selectedStudentForCode}
                students={students}
            />
        </div >
    );
};

const CommonModals = ({
    isPointModalOpen, setIsPointModalOpen, pointFormData, setPointFormData, handleBulkProcessPoints,
    isHistoryModalOpen, setIsHistoryModalOpen, historyStudent, historyLogs, loadingHistory,
    isDeleteModalOpen, setIsDeleteModalOpen, deleteTarget, handleDeleteStudent,
    isCodeZoomModalOpen, setIsCodeZoomModalOpen, isAllCodesModalOpen, setIsAllCodesModalOpen,
    selectedStudentForCode, students
}) => {
    return (
        <AnimatePresence>
            {isPointModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
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
                            <Button style={{ flex: 2, background: '#3498DB', color: 'white', fontWeight: '900' }} onClick={handleBulkProcessPoints}>반영하기</Button>
                        </div>
                    </Card>
                </div>
            )}
            {isHistoryModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
                    <Card style={{ width: '90%', maxWidth: '380px', maxHeight: '70vh', padding: '24px', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                        <h3 style={{ margin: '0 0 16px 0', borderBottom: '1px solid #F1F3F5', paddingBottom: '12px' }}>📜 {historyStudent?.name}님의 활동 기록</h3>
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                            {loadingHistory ? <p style={{ textAlign: 'center', color: '#ADB5BD' }}>로딩 중...</p> : historyLogs.length === 0 ? <p style={{ textAlign: 'center', color: '#ADB5BD' }}>기록이 없습니다.</p> : historyLogs.map(l => (
                                <div key={l.id} style={{ padding: '12px 0', borderBottom: '1px solid #F8F9FA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <Card style={{ width: '300px', padding: '24px', textAlign: 'center', borderRadius: '24px' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
                        <h3 style={{ margin: '0 0 8px 0' }}>학생을 삭제할까요?</h3>
                        <p style={{ color: '#6C757D', fontSize: '0.85rem', marginBottom: '20px' }}>{deleteTarget?.name}님의 모든 데이터가 사라집니다.</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="ghost" style={{ flex: 1 }} onClick={() => setIsDeleteModalOpen(false)}>취소</Button>
                            <Button style={{ flex: 1, background: '#E74C3C', color: 'white', fontWeight: 'bold' }} onClick={handleDeleteStudent}>삭제</Button>
                        </div>
                    </Card>
                </div>
            )}
            {isCodeZoomModalOpen && selectedStudentForCode && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.98)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(10px)' }}>
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, backdropFilter: 'blur(4px)' }}>
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
        </AnimatePresence>
    );
};

export default StudentManager;
