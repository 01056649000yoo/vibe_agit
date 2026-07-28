import React, { lazy, Suspense } from 'react';
import { getModule } from '../../modules/registry';
import TeacherMissionTab from './TeacherMissionTab';

const TeacherReadingLogManager = lazy(getModule('reading-log').teacherEntry);

const TeacherWritingHub = ({ activeClass, isMobile, section = 'missions', cardLayout }) => {
    return (
        <div style={{ width: '100%' }}>
            {section === 'missions' ? (
                <TeacherMissionTab activeClass={activeClass} isMobile={isMobile} cardLayout={cardLayout} />
            ) : (
                <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>학생 독서록을 정리하는 중... 📚</div>}>
                    <TeacherReadingLogManager activeClass={activeClass} isMobile={isMobile} />
                </Suspense>
            )}
        </div>
    );
};

export default TeacherWritingHub;
