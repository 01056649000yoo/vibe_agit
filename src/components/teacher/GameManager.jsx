import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import Card from '../common/Card';

// [재사용] 드래곤 단계 로직
const getDragonStage = (level) => {
    const basePath = '/assets/dragons';
    if (level >= 5) return { name: '전설의 수호신룡', image: `${basePath}/dragon_stage_5.webp` };
    if (level === 4) return { name: '불을 내뿜는 성장한 용', image: `${basePath}/dragon_stage_4.webp` };
    if (level === 3) return { name: '푸른 빛의 어린 용', image: `${basePath}/dragon_stage_3.webp` };
    if (level === 2) return { name: '갓 태어난 용', image: `${basePath}/dragon_stage_2.webp` };
    return { name: '신비로운 알', image: `${basePath}/dragon_stage_1.webp` };
};

const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(135deg, #B3E5FC 0%, #E1F5FE 100%)', border: '#4FC3F7', glow: 'rgba(79, 195, 247, 0.3)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(135deg, #1A237E 0%, #000000 100%)', border: '#7986CB', glow: 'rgba(121, 134, 203, 0.5)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '🌈 무지개 성소', color: 'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)', border: '#FFD700', glow: 'rgba(255, 215, 0, 0.6)' }
};

const GameManager = ({ activeClass, isMobile }) => {
    const [config, setConfig] = useState({
        dragon_feed_points: 50,
        dragon_degen_days: 7
    });
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showMonitoring, setShowMonitoring] = useState(false);
    const [previewStudent, setPreviewStudent] = useState(null);

    const fetchGameConfig = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('dragon_feed_points, dragon_degen_days')
                .eq('id', activeClass.id)
                .single();

            if (error) throw error;
            if (data) {
                setConfig({
                    dragon_feed_points: data.dragon_feed_points || 50,
                    dragon_degen_days: data.dragon_degen_days || 7
                });
            }
        } catch (err) {
            console.error('게임 설정 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id]);

    const fetchStudents = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('id, name, pet_data')
                .eq('class_id', activeClass.id)
                .order('name');

            if (error) throw error;
            setStudents(data || []);
        } catch (err) {
            console.error('학생 목록 로드 실패:', err);
        }
    }, [activeClass?.id]);

    useEffect(() => {
        if (activeClass?.id) {
            fetchGameConfig();
            fetchStudents();
        }
    }, [activeClass?.id, fetchGameConfig, fetchStudents]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('classes')
                .update({
                    dragon_feed_points: Number(config.dragon_feed_points),
                    dragon_degen_days: Number(config.dragon_degen_days)
                })
                .eq('id', activeClass.id);

            if (error) throw error;
            alert('설정이 저장되었습니다! 학생들의 아지트에 즉시 반영됩니다. ⚡');
        } catch (err) {
            console.error('게임 설정 저장 실패:', err);
            alert('설정 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdatePet = async (studentId, studentName, newPetData, actionLabel) => {
        if (!window.confirm(`${studentName} 학생의 드래곤을 ${actionLabel} 하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('students')
                .update({ pet_data: newPetData })
                .eq('id', studentId);

            if (error) throw error;

            await supabase.from('point_logs').insert({
                student_id: studentId,
                amount: 0,
                reason: `[선생님 관리] 드래곤 ${actionLabel} 패널티 적용`
            });

            alert(`${actionLabel} 처리가 완료되었습니다.`);
            fetchStudents();
        } catch (err) {
            console.error('패널티 적용 실패:', err);
            alert('처리에 실패했습니다.');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    if (!activeClass) return <div style={{ padding: '60px', textAlign: 'center', color: '#7F8C8D' }}>학급을 먼저 선택해주세요.</div>;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '10px' : '0' }}>
            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '1.8rem', color: '#2C3E50', margin: '0 0 8px 0', fontWeight: '900' }}>🎢 아지트 놀이터 관리</h1>
                <p style={{ color: '#7F8C8D', margin: 0 }}>학급의 모든 활동 게임과 성장 시스템을 관리합니다.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '32px' }}>
                {/* 1. 드래곤 키우기 통합 카드 */}
                <Card style={{ padding: 0, border: '1px solid #E9ECEF', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                    <div style={{ padding: '24px', background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)', borderBottom: '1px solid #FFE0B2', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '60px', height: '60px', background: 'white', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', boxShadow: '0 4px 12px rgba(255, 145, 0, 0.2)' }}>🐉</div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#5D4037', fontWeight: '900' }}>드래곤 키우기 관리</h3>
                            <span style={{ fontSize: '0.85rem', color: '#8D6E63', fontWeight: 'bold' }}>운영 정책 & 성장 대시보드</span>
                        </div>
                    </div>

                    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* 1.1 운영 정책 필드 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem', color: '#5D4037', borderLeft: '4px solid #FBC02D', paddingLeft: '10px' }}>⚙️ 운영 정책 설정</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ background: '#F8F9FA', padding: '12px', borderRadius: '12px', border: '1px solid #EEE' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#7F8C8D', marginBottom: '6px' }}>🥩 먹이 비용</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input type="number" name="dragon_feed_points" value={config.dragon_feed_points} onChange={handleChange} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50', outline: 'none' }} />
                                        <span style={{ fontWeight: 'bold', color: '#ADB5BD' }}>P</span>
                                    </div>
                                </div>
                                <div style={{ background: '#F8F9FA', padding: '12px', borderRadius: '12px', border: '1px solid #EEE' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#7F8C8D', marginBottom: '6px' }}>📉 퇴화 기준</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input type="number" name="dragon_degen_days" value={config.dragon_degen_days} onChange={handleChange} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50', outline: 'none' }} />
                                        <span style={{ fontWeight: 'bold', color: '#ADB5BD' }}>일</span>
                                    </div>
                                </div>
                            </div>
                            <Button onClick={handleSave} disabled={saving} size="sm" style={{ alignSelf: 'flex-end', background: '#2C3E50', color: 'white', borderRadius: '8px' }}>{saving ? '저장 중...' : '공통 정책 저장'}</Button>
                        </div>

                        <div style={{ height: '1px', background: '#F1F3F5' }} />

                        {/* 1.2 패널티 안내 박스 */}
                        <div style={{ background: '#FFF9C4', padding: '16px', borderRadius: '16px', border: '1px solid #FFE082' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#F57F17', fontWeight: '900' }}>⚠️ 패널티 조치 안내</h4>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#8D6E63', lineHeight: '1.6' }}>
                                <li><strong>레벨 하락</strong>: 성장을 1단계 감소시키고 경험치를 초기화합니다.</li>
                                <li><strong>완전 초기화</strong>: 모든 데이터(레벨/스킨/포인트 로그)를 삭제합니다.</li>
                                <li>부정한 포인트 획득 시에만 신중히 사용해 주세요.</li>
                            </ul>
                        </div>

                        {/* 1.3 모니터링 열기 버튼 */}
                        <div style={{ marginTop: 'auto' }}>
                            <Button variant="primary" onClick={() => setShowMonitoring(true)} style={{ width: '100%', height: '54px', fontSize: '1.1rem', fontWeight: '950', borderRadius: '14px', boxShadow: '0 4px 15px rgba(255, 145, 0, 0.2)' }}>
                                📊 학생 성장 모니터링 관리
                            </Button>
                            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#ADB5BD', marginTop: '8px' }}>실시간으로 학생들의 아지트 성장도를 확인하고 조치합니다.</p>
                        </div>
                    </div>
                </Card>

                {/* 미래 게임용 Placeholder 카드 */}
                <Card style={{ padding: '40px 24px', border: '2px dashed #E9ECEF', background: '#FAFAFA', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: 0.5 }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '16px', filter: 'grayscale(1)' }}>🧩</div>
                    <h3 style={{ margin: 0, color: '#9E9E9E', fontSize: '1.2rem', fontWeight: 'bold' }}>새로운 게임 준비 중</h3>
                    <p style={{ margin: '8px 0 0 0', color: '#ADB5BD', fontSize: '0.9rem' }}>선생님들이 원하시는 새로운 <br />학습 놀이가 곧 추가됩니다!</p>
                </Card>
            </div>

            {/* 📊 성장 모니터링 & 패널티 통합 대시보드 (풀스크린 모달) */}
            <AnimatePresence>
                {showMonitoring && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: '#F8F9FA', zIndex: 3000, overflowY: 'auto' }}>
                        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '20px' : '40px 20px' }}>
                            {/* 모달 헤더 */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '2px solid #E9ECEF', paddingBottom: '24px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '2rem' }}>📊</span>
                                        <h2 style={{ fontSize: '2rem', fontWeight: '1000', color: '#2C3E50', margin: 0 }}>학생 성장 모니터링 대시보드</h2>
                                    </div>
                                    <p style={{ margin: 0, color: '#7F8C8D', fontSize: '1.1rem' }}>드래곤 키우기 현황 확인 및 패널티 관리 (총 {students.length}명)</p>
                                </div>
                                <Button size="lg" variant="ghost" onClick={() => setShowMonitoring(false)} style={{ background: 'white', borderRadius: '16px', fontWeight: '900', color: '#E53935', border: '1px solid #FFEBEE' }}>닫기 ✕</Button>
                            </div>

                            {/* 리스트 그리드 (2열로 변경) */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
                                gap: '16px',
                                width: '100%'
                            }}>
                                {students.map(s => {
                                    const pet = s.pet_data || { name: '나의 드래곤', level: 1, exp: 0, background: 'default', ownedItems: [] };
                                    const stage = getDragonStage(pet.level);
                                    const bg = HIDEOUT_BACKGROUNDS[pet.background] || HIDEOUT_BACKGROUNDS.default;
                                    const isMaster = pet.level >= 5 && pet.exp >= 100;

                                    return (
                                        <motion.div
                                            key={s.id}
                                            whileHover={{ y: -2, boxShadow: '0 8px 16px rgba(0,0,0,0.05)' }}
                                            style={{
                                                background: 'white',
                                                padding: '16px',
                                                borderRadius: '20px',
                                                border: '1px solid #E9ECEF',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {/* 상단: 학생 정보 및 요약 상태 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '56px', height: '56px',
                                                    background: bg.color,
                                                    borderRadius: '14px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: `1.5px solid ${bg.border}`,
                                                    flexShrink: 0
                                                }}>
                                                    <img src={stage.image} alt="D" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#2C3E50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ADB5BD' }}>Lv.{pet.level}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#7F8C8D', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage.name}</span>
                                                        {isMaster && <span style={{ fontSize: '10px', background: '#FFD700', color: '#5D4037', padding: '1px 5px', borderRadius: '10px' }}>⭐</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 중단: 경험치 바 */}
                                            <div style={{ width: '100%' }}>
                                                <div style={{ height: '6px', background: '#F1F3F5', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pet.exp}%` }} style={{ height: '100%', background: isMaster ? 'linear-gradient(90deg, #FFD700, #BA68C8)' : '#FBC02D' }} />
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', fontWeight: 'bold', color: '#ADB5BD' }}>
                                                    <span>EXP {pet.exp}%</span>
                                                    <span>{bg.name}</span>
                                                </div>
                                            </div>

                                            {/* 하단: 컴팩트 버튼 그룹 */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr 1fr',
                                                gap: '6px',
                                                marginTop: '4px'
                                            }}>
                                                <Button size="xs" onClick={() => setPreviewStudent(s)} style={{ background: '#F0F4F8', color: '#546E7A', border: 'none', borderRadius: '8px', padding: '6px 0', fontSize: '0.75rem' }}>구경</Button>
                                                <Button size="xs" onClick={() => handleUpdatePet(s.id, s.name, { ...pet, level: Math.max(1, pet.level - 1), exp: 0 }, "레벨 패널티")} style={{ background: '#FFEBEE', color: '#D32F2F', border: 'none', borderRadius: '8px', padding: '6px 0', fontSize: '0.75rem' }}>🚨 패널티</Button>
                                                <Button size="xs" onClick={() => handleUpdatePet(s.id, s.name, { name: '나의 드래곤', level: 1, exp: 0, lastFed: new Date().toISOString().split('T')[0], ownedItems: [], background: 'default' }, "데이터 초기화")} style={{ background: '#F5F5F5', color: '#9E9E9E', border: 'none', borderRadius: '8px', padding: '6px 0', fontSize: '0.75rem' }}>🔄 초기화</Button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 아지트 상세 미리보기 (선생님 관점) */}
            <AnimatePresence>
                {previewStudent && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 4000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={() => setPreviewStudent(null)}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()} style={{ background: 'white', width: '100%', maxWidth: '500px', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
                            <TeacherHideoutPreview student={previewStudent} onClose={() => setPreviewStudent(null)} />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

// 교사용 아지트 미리보기 컴포넌트
const TeacherHideoutPreview = ({ student, onClose }) => {
    const pet = student.pet_data || { name: '친구 드래곤', level: 1, background: 'default', exp: 0 };
    const bg = HIDEOUT_BACKGROUNDS[pet.background] || HIDEOUT_BACKGROUNDS.default;
    const dragon = getDragonStage(pet.level);

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ background: bg.color, padding: '50px 20px', textAlign: 'center', borderBottom: `6px solid ${bg.border}`, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '24px', right: '24px', background: 'white', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', fontSize: '1.2rem' }}>✕</button>
                <div style={{ marginBottom: '32px' }}>
                    <span style={{ background: 'rgba(255,255,255,0.9)', padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '900', color: '#7F8C8D', border: '1px solid #EEE' }}>{student.name} 학생의 아지트 내부</span>
                    <h2 style={{ margin: '16px 0 0 0', color: '#2C3E50', fontSize: '2rem', fontWeight: '1000' }}>{pet.name}</h2>
                    <div style={{ color: '#5D4037', fontWeight: 'bold', marginTop: '4px' }}>Lv.{pet.level} {dragon.name}</div>
                </div>
                <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <motion.img animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} src={dragon.image} alt="Dragon" style={{ width: '240px', height: '240px', objectFit: 'contain', filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.2))' }} />
                </div>
            </div>
            <div style={{ padding: '32px', background: 'white', textAlign: 'center' }}>
                <div style={{ padding: '20px', background: '#F8F9FA', borderRadius: '20px', border: '1px solid #E9ECEF', marginBottom: '24px' }}>
                    <p style={{ margin: 0, color: '#607D8B', fontSize: '1rem', lineHeight: '1.6' }}>
                        👀 현재 <strong>관리자 실시간 확인 모드</strong>입니다.<br />
                        학생이 꾸민 배경과 드래곤 상태를 점검하세요.
                    </p>
                </div>
                <Button size="lg" onClick={onClose} style={{ width: '100%', borderRadius: '16px', fontWeight: '1000', height: '56px', fontSize: '1.1rem' }}>대시보드로 돌아가기</Button>
            </div>
        </div>
    );
};

export default GameManager;
