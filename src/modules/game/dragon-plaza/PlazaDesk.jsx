import { useEffect, useRef, useState } from 'react';
import { getDragonNameplateTextLayout } from '../dragon/decorCatalog';
import { deskArtSrc } from './deskArt';

/** 화면 밖 자리는 `is-offscreen` 을 붙여 CSS 움직임을 멈춘다. 감시자는 모든 자리가 하나를 같이 쓴다. */
let pauseObserver = null;
const registerSeatForPause = (element) => {
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    pauseObserver ||= new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
    }, { rootMargin: '80px' });
    pauseObserver.observe(element);
    return () => pauseObserver?.unobserve(element);
};

/** 작가 단계 → 빛깔 단계(0 없음 ~ 5 가장 화려함). 단계가 오를수록 책상 위 수호룡이 눈에 띄게 빛난다. */
export const auraTier = (level) => (level >= 10 ? 5 : level >= 9 ? 4 : level >= 7 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0);

/**
 * 교실 책상 한 자리. 책상에 앉은 수호룡(단계별), 책상 둘레의 빛 테두리(공방에서 고른 프레임), 이름표 자리(공방에서 고른 문패 + 이름).
 * `새 글` 단추는 책상 단추와 따로(단추 안에 단추를 넣지 않는다).
 */
export default function PlazaDesk({ seat, newPost, onOpen, onOpenNewPost }) {
    const { stage, level, name, isMe, frame, nameplate } = seat;
    // 앉은 그림을 먼저 보여 주고, 못 불러올 때만 서 있는 그림 + 코드 책상으로 대신한다(미리 확인하지 않는다).
    const [artFailed, setArtFailed] = useState(false);
    const hasDeskArt = !artFailed;
    const tier = auraTier(level);
    // 화면 밖으로 나간 자리는 빛 움직임을 멈춘다(자리마다 감시자를 두지 않고 교실 하나가 함께 본다: 아래 useOffscreenPause).
    const seatRef = useRef(null);
    useEffect(() => registerSeatForPause(seatRef.current), []);
    const label = `${name}${isMe ? '(나)' : ''}의 자리, 작가 ${level}단계 ${stage.species.shortName}${isMe ? '' : ', 누르면 아지트가 열려요'}`;
    const dragonSize = 46 + level * 3; // 단계가 오를수록 커진다(%)
    const plateStyle = nameplate ? getDragonNameplateTextLayout(nameplate.preview, name, '', { thumbnail: true }) : undefined;
    return (
        <div ref={seatRef} className={`plaza-seat${isMe ? ' is-me' : ''}`}>
            <button
                type="button"
                className={`plaza-desk${hasDeskArt ? ' has-art' : ''}`}
                data-tier={tier}
                style={{ '--frame': frame.border, '--glow': frame.glow, '--dragon-size': `${dragonSize}%` }}
                aria-label={label}
                disabled={isMe}
                onClick={() => onOpen?.(seat)}
            >
                <span className="plaza-desk__ring" aria-hidden="true" />
                {tier > 0 && <span className="plaza-desk__aura" data-tier={tier} data-species={seat.speciesId} aria-hidden="true" />}
                {hasDeskArt
                    ? <img className="plaza-desk__art" src={deskArtSrc(seat.speciesId, level)} alt="" onError={() => setArtFailed(true)} loading="lazy" decoding="async" draggable="false" />
                    : (
                        <>
                            <img className="plaza-desk__dragon" src={stage.image} alt="" loading="lazy" decoding="async" draggable="false" />
                            <span className="plaza-desk__top" aria-hidden="true" />
                            <span className="plaza-desk__front" aria-hidden="true" />
                        </>
                    )}
                {tier >= 3 && <span className="plaza-desk__spark" data-tier={tier} data-species={seat.speciesId} aria-hidden="true" />}
                <span className={`plaza-plate${nameplate ? '' : ' is-plain'}`} data-plate={nameplate?.preview || 'plain'} style={plateStyle}>
                    {nameplate && <img src={nameplate.image} alt="" loading="lazy" decoding="async" draggable="false" />}
                    <span>{name}</span>
                </span>
                <span className="plaza-desk__level" aria-hidden="true">Lv.{level}</span>
                {isMe && <span className="plaza-desk__me" aria-hidden="true">내 자리</span>}
            </button>
            {newPost && (
                <button type="button" className="plaza-seat__new" onClick={() => onOpenNewPost?.(seat, newPost)} aria-label={`${name}의 새 글 읽기: ${newPost.title}`}>
                    새 글
                </button>
            )}
        </div>
    );
}
