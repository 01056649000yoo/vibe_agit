import React from 'react';
import DragonAvatar from '../../modules/game/dragon/DragonAvatar';
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
                <small>{writer ? '작가 칭호' : '소통 칭호'}</small>
                <strong>{loading ? '불러오는 중' : level.name}</strong>
            </span>
            <em>LV.{level.level}</em>
        </button>
    );
};

/** 학생 홈의 성장 정보는 상위에서 한 번 읽은 공용 칭호·드래곤 표현값만 조합한다. */
const StudentHomeGrowthPanel = ({
    studentSession,
    points,
    writerLevel,
    readerLevel,
    titleLoading,
    dragonEnabled,
    petData,
    dragonInfo,
    marathonMedal,
    marathonMedalCount,
    onOpenMyAgit,
    onOpenDragon,
    onOpenPoints
}) => {
    return (
        <section className={`student-home-growth ${dragonEnabled ? 'has-dragon' : ''}`} aria-label="나의 성장 상태">
            <div className="student-home-growth__main">
                <p className="student-home-growth__eyebrow">오늘도 한 걸음씩 자라는 중</p>
                <div className="student-home-growth__greeting">
                    <h1>안녕, <strong>{studentSession?.name || '작가'}</strong>!</h1>
                    {marathonMedal && (
                        <button
                            type="button"
                            className={`student-home-marathon-medal is-${marathonMedal.medal_kind === 'team' ? 'team' : 'individual'}`}
                            onClick={onOpenMyAgit}
                            aria-label={`독서마라톤 ${marathonMedal.medal_kind === 'team' ? '단체전' : '개인전'} 완주 메달 ${marathonMedalCount}개. 나의 아지트에서 보기`}
                            title={`${marathonMedal.campaign_title} 완주 메달`}
                        >
                            <span aria-hidden="true">{marathonMedal.medal_kind === 'team' ? '🤝' : '🏃'}</span>
                            <strong>완주 메달</strong>
                            {marathonMedalCount > 1 && <em>+{marathonMedalCount - 1}</em>}
                        </button>
                    )}
                </div>
                <p className="student-home-growth__message">할 일을 살펴보고 오늘의 글쓰기를 시작해 볼까요?</p>

                <div className="student-home-growth__status-grid">
                    <button type="button" className="student-home-point-summary" onClick={onOpenPoints}>
                        <span aria-hidden="true">⭐</span>
                        <span><small>보유 포인트</small><strong>{formatPoints(points)}P</strong></span>
                        <em>놀이터 가기</em>
                    </button>
                    <TitleSummary kind="writer" level={writerLevel} loading={titleLoading} onClick={onOpenMyAgit} />
                    <TitleSummary kind="reader" level={readerLevel} loading={titleLoading} onClick={onOpenMyAgit} />
                </div>
            </div>

            {/* 수호룡은 나의 아지트를 거치지 않고 바로 방으로 들어간다 — 중간 단계는 불필요한 클릭이다. */}
            {dragonEnabled && (
                <button type="button" className="student-home-dragon-summary" onClick={onOpenDragon}>
                    <span className="student-home-dragon-summary__label">나의 작가 수호룡</span>
                    <DragonAvatar
                        dragon={dragonInfo}
                        readerLevel={readerLevel}
                        alt={`${dragonInfo.species.name} ${dragonInfo.name} 모습`}
                        className="student-home-dragon-summary__avatar"
                        eager
                    />
                    <strong>{petData?.name || '나의 드래곤'}</strong>
                    <span className="student-home-dragon-summary__meta">작가 성장 {petData?.level || 1}/10 · {dragonInfo.species.name}</span>
                    <em>수호룡 방 들어가기 ›</em>
                </button>
            )}
        </section>
    );
};

export default StudentHomeGrowthPanel;
