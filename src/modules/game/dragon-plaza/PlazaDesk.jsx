import { getDragonNameplateTextLayout } from '../dragon/decorCatalog';
import { deskArtSrc } from './deskArt';

/**
 * 교실 책상 한 자리. 책상에 앉은 수호룡(단계별), 책상 둘레의 빛 테두리(공방에서 고른 프레임), 이름표 자리(공방에서 고른 문패 + 이름).
 * `새 글` 단추는 책상 단추와 따로(단추 안에 단추를 넣지 않는다).
 */
export default function PlazaDesk({ seat, hasDeskArt, newPost, onOpen, onOpenNewPost }) {
    const { stage, level, name, isMe, frame, nameplate } = seat;
    const label = `${name}${isMe ? '(나)' : ''}의 자리, 작가 ${level}단계 ${stage.species.shortName}${isMe ? '' : ', 누르면 아지트가 열려요'}`;
    const dragonSize = 46 + level * 3; // 단계가 오를수록 커진다(%)
    const plateStyle = nameplate ? getDragonNameplateTextLayout(nameplate.preview, name, '', { thumbnail: true }) : undefined;
    return (
        <div className={`plaza-seat${isMe ? ' is-me' : ''}`}>
            <button
                type="button"
                className={`plaza-desk${hasDeskArt ? ' has-art' : ''}`}
                style={{ '--frame': frame.border, '--glow': frame.glow, '--dragon-size': `${dragonSize}%` }}
                aria-label={label}
                disabled={isMe}
                onClick={() => onOpen?.(seat)}
            >
                <span className="plaza-desk__ring" aria-hidden="true" />
                {hasDeskArt
                    ? <img className="plaza-desk__art" src={deskArtSrc(seat.speciesId, level)} alt="" loading="lazy" decoding="async" draggable="false" />
                    : (
                        <>
                            <img className="plaza-desk__dragon" src={stage.image} alt="" loading="lazy" decoding="async" draggable="false" />
                            <span className="plaza-desk__top" aria-hidden="true" />
                            <span className="plaza-desk__front" aria-hidden="true" />
                        </>
                    )}
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
