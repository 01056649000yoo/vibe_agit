import { useState } from 'react';
import { AURA_TIER_LABELS, auraTier } from './PlazaDesk';
import { deskArtSrc } from './deskArt';
import { getDragonStage } from '../dragon/presentation';
import './plaza.css';

const SPECIES = [
    { id: 'star', label: '별빛룡' },
    { id: 'forest', label: '숲수호룡' },
    { id: 'ember', label: '노을룡' },
    { id: 'moon', label: '달빛룡' }
];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** 학생 광장에서 보이는 그대로(책상에 앉은 그림 + 단계별 빛)를 한 종류씩 1~10단계로 훑어 본다. DB 없이 그림 파일만 쓴다. */
function LevelPreview() {
    const [speciesId, setSpeciesId] = useState('star');
    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <div role="tablist" aria-label="수호룡 종류" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SPECIES.map((species) => (
                    <button
                        key={species.id}
                        type="button"
                        role="tab"
                        aria-selected={speciesId === species.id}
                        onClick={() => setSpeciesId(species.id)}
                        style={{ minHeight: 40, padding: '0 14px', border: '2px solid', borderColor: speciesId === species.id ? '#2e7d32' : '#cbd5e1', borderRadius: 999, background: speciesId === species.id ? '#e8f5e9' : '#fff', color: '#334155', font: 'inherit', fontSize: 'var(--ui-text-sm)', fontWeight: 900, cursor: 'pointer' }}
                    >
                        {species.label}
                    </button>
                ))}
            </div>
            <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
                {LEVELS.map((level) => {
                    const tier = auraTier(level);
                    const stage = getDragonStage(level, speciesId);
                    return (
                        <li key={`${speciesId}-${level}`} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                            <div className="plaza-desk has-art" data-tier={tier} style={{ '--frame': '#a97848', '--glow': '#a97848', width: '100%', cursor: 'default' }} role="img" aria-label={`${stage.species.name} ${level}단계`}>
                                <span className="plaza-desk__ring" aria-hidden="true" />
                                {tier > 0 && <span className="plaza-desk__aura" data-tier={tier} data-species={speciesId} aria-hidden="true" />}
                                <img className="plaza-desk__art" src={deskArtSrc(speciesId, level)} alt="" loading="lazy" decoding="async" draggable="false" />
                                {tier >= 3 && <span className="plaza-desk__spark" data-tier={tier} data-species={speciesId} aria-hidden="true" />}
                                <span className="plaza-desk__level" aria-hidden="true">Lv.{level}</span>
                            </div>
                            <strong style={{ fontSize: 'var(--ui-text-sm)' }}>{level}단계 · {stage.name}</strong>
                            <small style={{ color: '#64748b', fontSize: 'var(--ui-text-xs)' }}>{AURA_TIER_LABELS.at(tier)}</small>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/**
 * 우리반 수호룡 아지트 교사 화면. 교사가 정하거나 올릴 것은 없다 — 켜고 끄는 스위치는 놀이터 관리 화면의 공통 스위치가 맡는다.
 * 아래 미리보기로 학생들 책상에 어떤 모습이 앉는지 1~10단계를 미리 볼 수 있다.
 */
export default function DragonPlazaTeacherManager() {
    return (
        <section style={{ display: 'grid', gap: 14, padding: 8, color: '#334155', lineHeight: 1.6 }}>
            <p style={{ margin: 0, fontSize: 'var(--ui-text-md)', fontWeight: 800 }}>🏫 우리 반 수호룡이 한 교실에 모여 앉아 있는 곳이에요.</p>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--ui-text-sm)' }}>
                <li>학급 학생 수만큼 자리가 있고, 친구의 수호룡과 공방에서 꾸민 문패·프레임이 책상에 보여요.</li>
                <li>학생이 자리를 누르면 그 친구의 아지트가 창으로 열려요. 칠판에는 이번 주 내 아지트에 놀러 온 친구의 이름이 나와요.</li>
                <li>선생님이 따로 정하거나 올리실 것은 없어요. 쓰지 않는 학급은 위쪽 스위치로 끄세요.</li>
            </ul>
            <div>
                <h3 style={{ margin: '0 0 6px', fontSize: 'var(--ui-text-md)', fontWeight: 950 }}>🐲 단계별 모습 미리보기</h3>
                <p style={{ margin: '0 0 8px', fontSize: 'var(--ui-text-sm)', color: '#64748b' }}>학생이 작가 단계를 올리면 책상 위 수호룡이 이렇게 바뀌어요. 종류를 눌러 1~10단계를 비교해 보세요.</p>
                <LevelPreview />
            </div>
        </section>
    );
}
