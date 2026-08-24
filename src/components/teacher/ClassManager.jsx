import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton';
import StudentManager from './StudentManager';
import { motion, AnimatePresence } from 'framer-motion';
import { generateUnambiguousCode } from '../../lib/codeGenerator';

/**
 * 역할: 선생님 - 학급 생성, 초대 코드 관리 및 학생 명단 통합 관리
 * 최적화된 레이아웃과 초대 코드 크게 보기 기능을 제공합니다. ✨
 * 
 * [DB 보안 알림]
 * - classes 테이블은 ON DELETE CASCADE 설정이 되어 있어야 합니다.
 *   (학급 삭제 시 student, writing_missions 등 관련 데이터가 자동 삭제됨)
 */
const ClassManager = ({ userId, classes = [], activeClass, setActiveClass, setClasses, onClassDeleted, isMobile, primaryClassId, onSetPrimaryClass, fetchDeletedClasses, onRestoreClass, onNavigate }) => {
    const [className, setClassName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
    const [deletedClasses, setDeletedClasses] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleOpenTrash = async () => {
        if (fetchDeletedClasses) {
            const data = await fetchDeletedClasses();
            setDeletedClasses(data);
            setIsTrashModalOpen(true);
        }
    };

    const handleRestore = async (id) => {
        if (onRestoreClass) {
            await onRestoreClass(id);
            const data = await fetchDeletedClasses();
            setDeletedClasses(data);
        }
    };

    useEffect(() => {
        // 학급이 하나도 없을 경우 자동으로 생성 모달을 띄워 유도합니다. ✨
        if (classes.length === 0) {
            setIsModalOpen(true);
        }
    }, [classes.length]);

    const generateInviteCode = () => generateUnambiguousCode(6);

    const handleCreateClass = async () => {
        if (!className.trim()) {
            alert('학급 이름을 입력해주세요! 😊');
            return;
        }

        setIsSaving(true);
        console.log("📡 ClassManager: Creating class...", className);
        const inviteCode = generateInviteCode();

        try {
            const { data, error } = await supabase
                .from('classes')
                .insert({
                    name: className,
                    invite_code: inviteCode,
                    teacher_id: userId
                })
                .select()
                .single();

            if (error) throw error;

            console.log("✅ ClassManager: Class created successfully!");
            // 로컬 상태 즉시 반영
            if (setClasses) setClasses(prev => [data, ...prev]);
            if (setActiveClass) setActiveClass(data);

            setIsModalOpen(false);
            setClassName('');
        } catch (error) {
            console.error('❌ ClassManager: 학급 생성 실패:', error.message);
            alert('학급 생성 중 오류가 생겼어요: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClass = async (targetId, targetName) => {
        if (!targetId) return;

        // 1. 사용자 확인 (window.confirm)
        if (!window.confirm(`정말 [${targetName}] 학급을 삭제하시겠습니까?\n\n삭제된 학급은 3일 이내에 다시 되돌릴 수 있습니다.\n3일이 지나면 모든 데이터가 영구적으로 삭제됩니다.`)) {
            return;
        }

        setIsSaving(true);
        try {
            // 2. DB 업데이트 (삭제가 아닌 soft delete)
            const { error } = await supabase
                .from('classes')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', targetId);

            if (error) {
                alert(`삭제 권한이 없거나 오류가 발생했습니다: ${error.message}`);
                return;
            }

            // 3. 상태 업데이트 순서 조정 (성공 시 즉시 반영)
            if (setClasses) {
                setClasses(prev => prev.filter(c => c.id !== targetId));
            }
            if (activeClass && activeClass.id === targetId && setActiveClass) {
                setActiveClass(null);
            }

            alert(`[${targetName}] 학급이 삭제 대기 상태로 이동되었습니다. 📦\n3일 이내에 복구할 수 있으며, 이후에는 영구 삭제됩니다.`);

            if (onClassDeleted) await onClassDeleted();
        } catch (error) {
            console.error('❌ ClassManager: 삭제 처리 실패:', error);
            alert('삭제 중 예상치 못한 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRenameClass = async () => {
        if (!activeClass?.id) return;
        const nextName = window.prompt('바꿀 학급 이름을 입력해 주세요.', activeClass.name)?.trim();
        if (!nextName || nextName === activeClass.name) return;
        if (nextName.length > 40) {
            window.alert('학급 이름은 40자 이내로 입력해 주세요.');
            return;
        }

        setIsSaving(true);
        try {
            const { data, error } = await supabase
                .from('classes')
                .update({ name: nextName })
                .eq('id', activeClass.id)
                .eq('teacher_id', userId)
                .select()
                .single();
            if (error) throw error;
            setClasses?.((current) => current.map((item) => item.id === data.id ? data : item));
            setActiveClass?.(data);
        } catch (error) {
            console.error('학급 이름 변경 실패:', error.message);
            window.alert('학급 이름을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ width: '100%' }}>
            {!activeClass ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <Card style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '32px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏢</div>
                        <h2 style={{ fontSize: 'var(--ui-text-2xl)', color: '#2C3E50', fontWeight: '900', marginBottom: '8px' }}>선택된 학급이 없습니다.</h2>
                        <p style={{ color: '#7F8C8D', marginBottom: '24px', fontSize: 'var(--ui-text-md)' }}>아래 목록에서 선택하거나 새로운 학급을 만들어보세요!</p>
                        <Button
                            variant="primary"
                            style={{ width: '100%', height: '60px', fontSize: '1.1rem', borderRadius: '16px', fontWeight: 'bold' }}
                            onClick={() => setIsModalOpen(true)}
                        >
                            ➕ 새 학급 만들기
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleOpenTrash}
                            style={{
                                width: '100%', marginTop: '12px', fontSize: 'var(--ui-text-md)', color: '#7F8C8D',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            🗑️ 삭제된 학급 복구하기
                        </Button>
                    </Card>

                    {classes.length > 0 && (
                        <div style={{ background: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: 'var(--ui-text-lg)', color: '#2C3E50', fontWeight: '900' }}>나의 학급 목록</h3>
                                <button
                                    onClick={handleOpenTrash}
                                    style={{
                                        background: '#F8F9FA', border: '1px solid #E9ECEF', borderRadius: '10px',
                                        padding: '6px 12px', fontSize: 'var(--ui-text-sm)', color: '#64748B', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold'
                                    }}
                                >
                                    🗑️ 복구함
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {classes.map((cls) => (
                                    <div
                                        key={cls.id}
                                        onClick={() => setActiveClass(cls)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '16px 20px', borderRadius: '16px', background: '#F8F9FA',
                                            cursor: 'pointer', border: '1px solid #F1F3F5', transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#F1F8FF'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#F8F9FA'}
                                    >
                                        <span style={{ fontWeight: 'bold', color: '#2C3E50' }}>🏫 {cls.name}</span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteClass(cls.id, cls.name);
                                            }}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                fontSize: '1.2rem', padding: '4px', borderRadius: '8px',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#FDEDEC'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <section style={{ padding: isMobile ? '16px' : '20px', background: 'white', border: '1px solid #DCE6EE', borderRadius: '20px', boxShadow: '0 5px 18px rgba(15,23,42,.04)' }}>
                    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                            <span style={{ color: '#2563EB', fontSize: 'var(--ui-text-xs)', fontWeight: 900 }}>현재 관리 중인 학급</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginTop: '4px' }}>
                                <h3 style={{ margin: 0, color: '#1E293B', fontSize: 'var(--ui-text-xl)' }}>🏫 {activeClass.name}</h3>
                                {activeClass.id === primaryClassId && <span style={badgeStyle}>⭐ 주 학급</span>}
                                <span style={{ ...badgeStyle, background: '#DCFCE7', color: '#15803D' }}>● 운영 중</span>
                            </div>
                        </div>
                        <span style={{ padding: '6px 9px', borderRadius: '9px', background: '#EFF6FF', color: '#1D4ED8', fontSize: 'var(--ui-text-xs)', fontWeight: 900 }}>학급 기능 6개</span>
                    </header>

                    {classes.length > 1 && <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #EEF2F7' }}>
                        <strong style={{ display: 'block', marginBottom: '8px', color: '#475569', fontSize: 'var(--ui-text-sm)' }}>관리할 학급 선택</strong>
                        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', minWidth: 0 }}>
                            {classes.map((cls) => {
                                const selected = cls.id === activeClass.id;
                                const primary = cls.id === primaryClassId;
                                return (
                                    <button key={cls.id} type="button" onClick={() => setActiveClass(cls)} style={{
                                        padding: '9px 12px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: 'var(--ui-text-sm)',
                                        border: selected ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                                        background: selected ? '#EFF6FF' : 'white', color: selected ? '#1D4ED8' : '#475569',
                                        boxShadow: selected ? '0 3px 10px rgba(37,99,235,.10)' : 'none'
                                    }}>
                                        {primary ? '⭐ ' : ''}{cls.name}{selected ? ' · 현재' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>}

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(3,minmax(0,1fr))', gap: '9px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #EEF2F7' }}>
                        {onNavigate && <ClassActionButton icon="👥" label="학생 명단" description="학생 추가·별명·코드" onClick={() => onNavigate({ tab: 'students', section: 'students' })} />}
                        <ClassActionButton icon="✏️" label="이름 바꾸기" description="학급 이름 수정" onClick={handleRenameClass} disabled={isSaving} />
                        <ClassActionButton icon="➕" label="학급 추가" description="새 학급 만들기" onClick={() => setIsModalOpen(true)} />
                        <ClassActionButton icon="⭐" label="주 학급 지정" description={activeClass.id === primaryClassId ? '현재 주 학급' : '로그인 후 기본 학급'} onClick={() => onSetPrimaryClass?.(activeClass.id)} disabled={activeClass.id === primaryClassId || isSaving} />
                        <ClassActionButton icon="♻️" label="삭제 학급 복구" description="3일 안에 되돌리기" onClick={handleOpenTrash} />
                        <ClassActionButton danger icon="🗑️" label="학급 삭제" description="복구함으로 이동" onClick={() => handleDeleteClass(activeClass.id, activeClass.name)} disabled={isSaving} />
                    </div>
                </section>
            )}

            {/* 학급 생성 모달 */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(44, 62, 80, 0.6)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 2500, backdropFilter: 'blur(5px)'
                }}>
                    <Card style={{ width: '90%', maxWidth: '420px', padding: '40px', borderRadius: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ fontSize: 'var(--ui-text-2xl)', marginBottom: '8px', color: '#2C3E50', fontWeight: '900' }}>새로운 학급 만들기</h2>
                        <p style={{ color: '#7F8C8D', marginBottom: '24px', fontSize: 'var(--ui-text-md)' }}>아이들과 함께할 멋진 학급 이름을 지어주세요!</p>
                        <input
                            type="text"
                            placeholder="예: 3학년 1반, 무지개반"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%', padding: '18px', borderRadius: '16px', border: '2px solid #ECEFF1',
                                fontSize: '1.2rem', marginBottom: '32px', outline: 'none', transition: 'border-color 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button variant="ghost" style={{ flex: 1, height: '56px', borderRadius: '16px' }} onClick={() => setIsModalOpen(false)}>취소</Button>
                            <Button variant="primary" style={{ flex: 2, height: '56px', borderRadius: '16px', fontWeight: 'bold' }} onClick={handleCreateClass} disabled={isSaving}>
                                {isSaving ? '생성 중...' : '학급 생성하기 🎉'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* 삭제된 학급 복구 모달 */}
            <AnimatePresence>
                {isTrashModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(44, 62, 80, 0.7)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        zIndex: 3500, backdropFilter: 'blur(8px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            style={{ width: '90%', maxWidth: '500px' }}
                        >
                            <Card style={{ padding: '32px', borderRadius: '32px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h2 style={{ fontSize: 'var(--ui-text-2xl)', margin: 0, color: '#2C3E50', fontWeight: '900' }}>🗑️ 삭제된 학급 복구</h2>
                                    <ModalCloseButton onClick={() => setIsTrashModalOpen(false)} label="삭제된 학급 복구 닫기" />
                                </div>

                                <div style={{ background: '#FFFCEB', padding: '16px', borderRadius: '16px', border: '1px solid #FFE082', marginBottom: '24px' }}>
                                    <p style={{ margin: 0, fontSize: 'var(--ui-text-sm)', color: '#B26700', lineHeight: '1.5', fontWeight: 'bold' }}>
                                        💡 삭제된 학급은 <span style={{ textDecoration: 'underline' }}>삭제 후 3일간</span> 이곳에서 복구하실 수 있습니다.
                                        3일이 경과하면 모든 데이터가 자동으로 영구 삭제됩니다.
                                    </p>
                                </div>

                                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
                                    {deletedClasses.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🍃</div>
                                            복구할 수 있는 학급이 없습니다.
                                        </div>
                                    ) : (
                                        deletedClasses.map(cls => (
                                            <div key={cls.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '16px', borderRadius: '16px', background: '#F8F9FA',
                                                border: '1px solid #F1F3F5'
                                            }}>
                                                <div>
                                                    <span style={{ fontWeight: 'bold', color: '#2C3E50', display: 'block' }}>🏫 {cls.name}</span>
                                                    <span style={{ fontSize: 'var(--ui-text-sm)', color: '#7C8A9E' }}>
                                                        삭제일: {new Date(cls.deleted_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    style={{ background: '#E3F2FD', color: '#1976D2', border: '1px solid #BBDEFB' }}
                                                    onClick={() => handleRestore(cls.id)}
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
            </AnimatePresence>
        </div>
    );
};

const badgeStyle = {
    display: 'inline-flex', alignItems: 'center', padding: '4px 7px', borderRadius: '999px',
    background: '#FEF3C7', color: '#92400E', fontSize: 'var(--ui-text-xs)', fontWeight: '900'
};

const ClassActionButton = ({ icon, label, description, onClick, disabled = false, danger = false }) => (
    <button type="button" onClick={onClick} disabled={disabled} style={{
        minWidth: 0, minHeight: '64px', padding: '10px 11px', borderRadius: '12px',
        border: `1px solid ${danger ? '#FECACA' : '#DCE6EE'}`,
        background: disabled ? '#F8FAFC' : danger ? '#FFF7F7' : '#F8FAFC',
        color: disabled ? '#94A3B8' : danger ? '#B91C1C' : '#334155',
        display: 'flex', alignItems: 'center', gap: '9px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? .68 : 1, boxSizing: 'border-box'
    }}>
        <span aria-hidden="true" style={{ flex: '0 0 24px', fontSize: '1.15rem', textAlign: 'center' }}>{icon}</span>
        <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--ui-text-md)' }}>{label}</strong>
            <small style={{ display: 'block', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: disabled ? '#94A3B8' : danger ? '#DC2626' : '#64748B', fontSize: 'var(--ui-text-sm)' }}>{description}</small>
        </span>
    </button>
);

export default ClassManager;
