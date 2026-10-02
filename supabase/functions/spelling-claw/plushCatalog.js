/**
 * 인형뽑기 인형 8종(2026-10-01). 모델은 Tripo AI 로 만든 동물 봉제 인형이며
 * `public/assets/claw/plush/<id>.glb`(웹용, 개당 0.4~0.6MB)를 게임을 열 때만 받는다.
 * 포켓몬 인형은 저작권(닌텐도 등) 때문에 공개 서비스에 넣지 않는다.
 * `size` 는 가장 긴 변(미터) — 원본 게임의 값 그대로라 집게에 잡히는 정도가 맞춰져 있다.
 */
export const CLAW_PLUSHES = Object.freeze([
    { id: 'shiba', name: '시바견', color: '#e59a4f', size: 0.15 },
    { id: 'cat', name: '고양이', color: '#aab0bd', size: 0.15 },
    { id: 'raccoon', name: '너구리', color: '#8f8b88', size: 0.16 },
    { id: 'pigeon', name: '비둘기', color: '#8d97b0', size: 0.14 },
    { id: 'rabbit', name: '토끼', color: '#f7b3c2', size: 0.19 },
    { id: 'panda', name: '판다', color: '#2c2a2d', size: 0.15 },
    { id: 'penguin', name: '펭귄', color: '#344565', size: 0.135 },
    { id: 'hamster', name: '햄스터', color: '#e9b477', size: 0.12 }
// `thumb` 은 도감용 그림(160px) — 3D 엔진이 그리는 썸네일과 같은 장면을 한 번 찍어 둔 것이라 엔진 없이도 보인다(2026-10-02).
].map((plush) => Object.freeze({ ...plush, file: `/assets/claw/plush/${plush.id}.glb`, thumb: `/assets/claw/thumbs/${plush.id}.png` })));
