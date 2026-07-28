import React, { lazy, Suspense, useState } from 'react';
import { getModule } from '../../modules/registry';
import TeacherMissionTab from './TeacherMissionTab';
import TeacherStudentHub from './TeacherStudentHub';

const TeacherReadingLogManager = lazy(getModule('reading-log').teacherEntry);

const TeacherWritingHub = ({ activeClass, isMobile, setSelectedActivityPost, studentManagement }) => {
    const [area, setArea] = useState('writing');
    const [section, setSection] = useState('missions');

    const tabs = [
        { id: 'missions', label: '✍️ 선생님 과제', description: '미션 만들기·제출 확인' },
        { id: 'reading-logs', label: '📚 학생 독서록', description: '자율 독서록 확인·한마디' }
    ];

    return (
        <div style={{ width: '100%' }}>
            <div
                role="tablist"
                aria-label="교사 업무 영역"
                style={{
                    display: 'flex', gap: '10px', marginBottom: '16px', padding: '6px',
                    borderRadius: '18px', background: '#EAF2F8', width: isMobile ? '100%' : 'fit-content',
                    boxSizing: 'border-box', overflowX: 'auto'
                }}
            >
                <button type="button" role="tab" aria-selected={area === 'writing'} onClick={() => setArea('writing')} style={{ minWidth: isMobile ? '180px' : '220px', padding: '12px 18px', border: area === 'writing' ? '1px solid #BFDBFE' : '1px solid transparent', borderRadius: '14px', background: area === 'writing' ? 'white' : 'transparent', boxShadow: area === 'writing' ? '0 5px 16px rgba(30, 64, 175, 0.10)' : 'none', color: area === 'writing' ? '#1D4ED8' : '#64748B', cursor: 'pointer', textAlign: 'left' }}>
                    <strong style={{ display: 'block', fontSize: '0.98rem' }}>✍️ 글쓰기 관리</strong>
                    <small style={{ display: 'block', marginTop: '4px', color: area === 'writing' ? '#60A5FA' : '#94A3B8' }}>과제와 독서록을 확인해요</small>
                </button>
                <button type="button" role="tab" aria-selected={area === 'students'} onClick={() => setArea('students')} style={{ minWidth: isMobile ? '180px' : '220px', padding: '12px 18px', border: area === 'students' ? '1px solid #BFDBFE' : '1px solid transparent', borderRadius: '14px', background: area === 'students' ? 'white' : 'transparent', boxShadow: area === 'students' ? '0 5px 16px rgba(30, 64, 175, 0.10)' : 'none', color: area === 'students' ? '#1D4ED8' : '#64748B', cursor: 'pointer', textAlign: 'left' }}>
                    <strong style={{ display: 'block', fontSize: '0.98rem' }}>👥 학생 관리</strong>
                    <small style={{ display: 'block', marginTop: '4px', color: area === 'students' ? '#60A5FA' : '#94A3B8' }}>학급·학생·활동을 관리해요</small>
                </button>
            </div>

            {area === 'students' ? (
                <TeacherStudentHub
                    {...studentManagement}
                    activeClass={activeClass}
                    isMobile={isMobile}
                    setSelectedActivityPost={setSelectedActivityPost}
                />
            ) : (
                <>
                    <div role="tablist" aria-label="글쓰기 관리 종류" style={{ display: 'flex', gap: '10px', marginBottom: '24px', padding: '6px', borderRadius: '18px', background: '#F1F5F9', width: isMobile ? '100%' : 'fit-content', boxSizing: 'border-box', overflowX: 'auto' }}>
                        {tabs.map((tab) => {
                            const active = section === tab.id;
                            return (
                                <button key={tab.id} type="button" role="tab" aria-selected={active} onClick={() => setSection(tab.id)} style={{ minWidth: isMobile ? '180px' : '220px', padding: '12px 18px', border: active ? '1px solid #BFDBFE' : '1px solid transparent', borderRadius: '14px', background: active ? 'white' : 'transparent', boxShadow: active ? '0 5px 16px rgba(30, 64, 175, 0.10)' : 'none', color: active ? '#1D4ED8' : '#64748B', cursor: 'pointer', textAlign: 'left' }}>
                                    <strong style={{ display: 'block', fontSize: '0.98rem' }}>{tab.label}</strong>
                                    <small style={{ display: 'block', marginTop: '4px', color: active ? '#60A5FA' : '#94A3B8' }}>{tab.description}</small>
                                </button>
                            );
                        })}
                    </div>
                    {section === 'missions' ? (
                        <TeacherMissionTab activeClass={activeClass} isMobile={isMobile} />
                    ) : (
                        <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>학생 독서록을 정리하는 중... 📚</div>}>
                            <TeacherReadingLogManager activeClass={activeClass} isMobile={isMobile} />
                        </Suspense>
                    )}
                </>
            )}
        </div>
    );
};

export default TeacherWritingHub;
