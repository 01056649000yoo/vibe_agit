import React, { lazy, Suspense, useEffect, useState } from 'react';
import PreparationRoadmap from '../common/PreparationRoadmap';
import { CLASS_AGIT_PREPARATION_ROADMAP } from '../../constants/preparationRoadmaps';
import './TeacherClassAgitHub.css';
import TeacherGuideButton from './TeacherGuideButton';
import { classAgitManifest } from '../../modules/class-agit/manifest.js';
import { classAgitReleaseApi } from '../../modules/class-agit/api/releaseApi.js';
import ErrorBoundary from '../common/ErrorBoundary.jsx';

const InternalClassAgit = lazy(classAgitManifest.teacherEntry);

function AccessGate({ activeClass, allowInternal, section }) {
    const [access, setAccess] = useState(null);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => { let active = true; classAgitReleaseApi.getAccess(activeClass.id).then((value) => { if (active) { setAccess(value); setError(''); } }).catch(() => { if (active) setError('우리반 아지트 사용 권한을 확인하지 못했습니다.'); }); return () => { active = false; }; }, [activeClass.id, refresh]);
    if (error && !allowInternal) return <p role="alert">{error} <button type="button" onClick={() => setRefresh((v) => v + 1)}>다시 확인</button></p>;
    if (!access && !allowInternal) return <p role="status">우리반 아지트를 준비하고 있습니다…</p>;
    return access?.allowed || access?.is_admin || allowInternal
    ? <ErrorBoundary key={activeClass.id}><Suspense fallback={<p role="status">우리반 아지트를 준비하고 있습니다…</p>}><InternalClassAgit activeClass={activeClass} section={section} isAdmin={access?.is_admin || allowInternal} /></Suspense></ErrorBoundary>
    : (
    <section className="teacher-class-agit" aria-labelledby="teacher-class-agit-title">
        <div className="teacher-class-agit__hero">
            <span className="teacher-class-agit__badge">Beta · 준비 중</span>
            <span className="teacher-class-agit__icon" aria-hidden="true">🏡</span>
            <h1 id="teacher-class-agit-title">우리반 아지트</h1>
            <TeacherGuideButton tabId="class-agit" variant="help" />
            {import.meta.env.DEV && <p><a href="/?dev-lab=class-agit">개발용 전시실 시안 열기 →</a></p>}
            <p className="teacher-class-agit__summary">
                {activeClass?.name || '우리 반'}의 글을 전시하고 문집으로 남길 공간을 준비하고 있습니다.
            </p>
            <PreparationRoadmap
                headingId="teacher-class-agit-roadmap-title"
                roadmap={CLASS_AGIT_PREPARATION_ROADMAP}
                tone="green"
            />
        </div>
    </section>
);

}
const TeacherClassAgitHub = ({ activeClass, allowInternal = false, section = 'exhibitions' }) => activeClass?.id ? <AccessGate key={activeClass.id} activeClass={activeClass} allowInternal={allowInternal} section={section} /> : <p>학급을 먼저 선택해 주세요.</p>;
export default TeacherClassAgitHub;
