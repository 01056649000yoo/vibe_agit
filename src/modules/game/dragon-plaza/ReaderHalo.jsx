import { getReaderDragonEffect } from '../dragon/presentation';
import '../dragon/DragonAvatar.css';

const PARTICLE_POSITIONS = [
    ['18%', '27%'], ['78%', '22%'], ['88%', '55%'], ['70%', '83%'],
    ['28%', '84%'], ['9%', '56%'], ['50%', '10%']
];

/**
 * 소통(독서) 칭호 단계(1~7)에 따른 수호룡 후광 — 드래곤 아지트 방의 `DragonAvatar` 와 같은 모양·같은 CSS 를 쓴다.
 * 그림은 작가 성장 단계가 정하고, 이 후광은 소통 칭호 단계가 정한다(선생님 결정 2026-10-25).
 * `DragonAvatar` 는 그림 한 장에 드롭섀도 필터를 겹쳐 쓰므로, 40여 자리를 그리는 교실에서는 필터 없이 층만 가져다 쓴다:
 *  - `back`  그림 뒤: 무대·빛무리·궤도·문양·오로라·수호광
 *  - `front` 그림 앞: 단계 표식·반짝이 입자
 */
export function ReaderHaloBack({ level }) {
    const effect = getReaderDragonEffect(level);
    if (effect.level < 2) return null; // 1단계 '고요한 빛'은 후광이 없다
    return (
        <span className="plaza-halo-clip" aria-hidden="true">
        <span className={`plaza-halo dragon-avatar dragon-reader-effect--${effect.className}`} data-reader-level={effect.level}>
            <span className="dragon-reader-effect__stage" />
            <span className="dragon-reader-effect__glow" />
            {effect.level >= 4 && <span className="dragon-reader-effect__orbit"><i>✦</i><i>ᚱ</i></span>}
            {effect.level >= 5 && <span className="dragon-reader-effect__crest"><i>✦</i><i>◆</i><i>✦</i></span>}
            {effect.level >= 6 && <span className="dragon-reader-effect__aurora" />}
            {effect.level >= 7 && <span className="dragon-reader-effect__seal" />}
        </span>
        </span>
    );
}

export function ReaderHaloFront({ level }) {
    const effect = getReaderDragonEffect(level);
    if (effect.level < 2) return null;
    return (
        <span className="plaza-halo-clip plaza-halo-clip--front" aria-hidden="true">
        <span className={`plaza-halo dragon-avatar dragon-reader-effect--${effect.className}`} data-reader-level={effect.level}>
            <span className="dragon-reader-effect__sigil"><i>{effect.level}</i></span>
            {Array.from({ length: effect.particles }, (_, index) => {
                const [left, top] = PARTICLE_POSITIONS.at(index);
                return <span key={index} className="dragon-reader-effect__particle" style={{ '--dragon-particle-index': index, left, top }} />;
            })}
        </span>
        </span>
    );
}
