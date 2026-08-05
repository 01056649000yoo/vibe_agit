import React from 'react';
import useMyTitleStatus from '../../modules/writing/title-status/useMyTitleStatus';
import './StudentHomeGrowthPanel.css';

const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;
const formatPoints = (value) => Number(value || 0).toLocaleString('ko-KR');

const TitleSummary = ({ kind, level, loading, onClick }) => {
    const writer = kind === 'writer';
    return (
        <button type="button" className={`student-home-title-summary is-${kind}`} onClick={onClick}>
            <img
                src={titleBadgeSrc(kind, level.level)}
                alt=""
                aria-hidden="true"
                width="42"
                height="42"
            />
            <span>
                <small>{writer ? '작가 칭호' : '독자 칭호'}</small>
                <strong>{loading ? '불러오는 중' : level.name}</strong>
            </span>
            <em>LV.{level.level}</em>
        </button>
    );
};

/** 학생 홈의 성장 정보는 공용 칭호 훅과 드래곤 표현값만 조합한다. */
const StudentHomeGrowthPanel = ({
    studentSession,
    points,
    dragonEnabled,
    petData,
    dragonInfo,
    onOpenMyAgit,
    onOpenFootprint
}) => {
    const { writerLevel, readerLevel, loading } = useMyTitleStatus({ studentSession, active: true });

    return (
        <section className={`student-home-growth ${dragonEnabled ? 'has-dragon' : ''}`} aria-label="나의 성장 상태">
            <div className="student-home-growth__main">
                <p className="student-home-growth__eyebrow">오늘도 한 걸음씩 자라는 중</p>
                <h1>안녕, <strong>{studentSession?.name || '작가'}</strong>!</h1>
                <p className="student-home-growth__message">할 일을 살펴보고 오늘의 글쓰기를 시작해 볼까요?</p>

                <div className="student-home-growth__status-grid">
                    <button type="button" className="student-home-point-summary" onClick={onOpenFootprint}>
                        <span aria-hidden="true">⭐</span>
                        <span><small>보유 포인트</small><strong>{formatPoints(points)}P</strong></span>
                        <em>발자국 보기</em>
                    </button>
                    <TitleSummary kind="writer" level={writerLevel} loading={loading} onClick={onOpenMyAgit} />
                    <TitleSummary kind="reader" level={readerLevel} loading={loading} onClick={onOpenMyAgit} />
                </div>
            </div>

            {dragonEnabled && (
                <button type="button" className="student-home-dragon-summary" onClick={onOpenMyAgit}>
                    <span className="student-home-dragon-summary__label">나의 아지트 친구</span>
                    <img src={dragonInfo.image} alt={`${dragonInfo.name} 모습`} width="132" height="132" />
                    <strong>{petData?.name || '나의 드래곤'}</strong>
                    <span>LV.{petData?.level || 1} · {dragonInfo.name}</span>
                    <em>아지트에서 만나기 ›</em>
                </button>
            )}
        </section>
    );
};

export default StudentHomeGrowthPanel;
