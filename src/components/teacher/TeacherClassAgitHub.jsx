import React from 'react';
import './TeacherClassAgitHub.css';

const PREVIEW_AREAS = [
    {
        icon: '💬',
        title: '아이들 의견 모으기',
        description: '수업과 학급생활에 관한 생각을 부담 없이 모으는 활동'
    },
    {
        icon: '💡',
        title: '글쓰기 전 생각 열기',
        description: '바로 글을 쓰기 전에 말하고 고르고 연결하며 생각을 키우는 활동'
    },
    {
        icon: '🤝',
        title: '우리 반 활동 돕기',
        description: '함께 정하고 참여하며 우리 반의 하루를 만드는 활동'
    }
];

const TeacherClassAgitHub = ({ activeClass }) => (
    <section className="teacher-class-agit" aria-labelledby="teacher-class-agit-title">
        <div className="teacher-class-agit__hero">
            <span className="teacher-class-agit__badge">Beta · 준비 중</span>
            <span className="teacher-class-agit__icon" aria-hidden="true">🏡</span>
            <p className="teacher-class-agit__eyebrow">{activeClass?.name || '우리 반'}과 함께 쓰는 활동 공간</p>
            <h1 id="teacher-class-agit-title">우리반 아지트</h1>
            <p className="teacher-class-agit__summary">
                글쓰기 과제를 내는 곳이 아니라, 아이들의 생각을 먼저 열고 우리 반 활동을 함께 만들어 가는 공간을 준비하고 있습니다.
            </p>
        </div>

        <div className="teacher-class-agit__areas" aria-label="준비 중인 활동 방향">
            {PREVIEW_AREAS.map((area) => (
                <article key={area.title} className="teacher-class-agit__area">
                    <span aria-hidden="true">{area.icon}</span>
                    <div>
                        <strong>{area.title}</strong>
                        <p>{area.description}</p>
                    </div>
                    <small>준비 중</small>
                </article>
            ))}
        </div>

        <div className="teacher-class-agit__plan">
            <div>
                <strong>교사가 필요한 활동만 골라서</strong>
                <p>활동별로 학생 화면에 열고, 수업이 끝나면 닫을 수 있도록 만들 예정입니다.</p>
            </div>
            <span aria-hidden="true">선택 → 활성화 → 마무리</span>
        </div>

        <p className="teacher-class-agit__notice" role="status">
            현재는 준비 안내만 제공하며 학생 화면이나 학급 데이터에는 아무 변화도 주지 않습니다.
        </p>
    </section>
);

export default TeacherClassAgitHub;
