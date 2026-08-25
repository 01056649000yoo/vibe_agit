import React, { lazy, Suspense } from 'react';
import { getModule } from '../../modules/registry';
import TeacherMissionTab from './TeacherMissionTab';

const TeacherReadingLogManager = lazy(getModule('reading-log').teacherEntry);
const TeacherDiaryManager = lazy(getModule('diary').teacherEntry);

const TeacherWritingHub = ({
    activeClass, isMobile, section = 'missions', missionCardSize,
    navigationTarget, onNavigationHandled, bootstrapProfile
}) => {
    return (
        <div style={{ width: '100%' }}>
            {section === 'missions' ? (
                <TeacherMissionTab
                    activeClass={activeClass}
                    isMobile={isMobile}
                    missionCardSize={missionCardSize}
                    navigationTarget={navigationTarget}
                    onNavigationHandled={onNavigationHandled}
                    bootstrapProfile={bootstrapProfile}
                />
            ) : section === 'diaries' ? (
                <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>학생 일기를 정리하는 중... 📔</div>}>
                    <TeacherDiaryManager activeClass={activeClass} isMobile={isMobile} />
                </Suspense>
            ) : (
                <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>학생 독서록을 정리하는 중... 📚</div>}>
                    <TeacherReadingLogManager
                        activeClass={activeClass}
                        isMobile={isMobile}
                        navigationTarget={navigationTarget}
                        onNavigationHandled={onNavigationHandled}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default TeacherWritingHub;
