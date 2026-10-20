import { useMemo } from 'react';
import ArtworkReader from '../modules/class-agit/gallery/ArtworkReader.jsx';
import { PhotoResolverContext } from '../modules/class-agit/photoContext.js';
import '../modules/class-agit/classAgit.css';

/** 전시관 작품 읽기 화면에서 사진이 든 보고서가 어떻게 보이는지(가짜 사진·가짜 글, DB 없음). */
const swatch = (from, to, label) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><text x="400" y="320" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
)}`;
const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const marker = (id) => `\u001fphoto:${id}`;

const SAMPLE = {
    id: 'sample-report',
    title: '강낭콩이 자라는 모습',
    author: '김하늘',
    format: 'prose',
    kindLabel: '관찰 보고서',
    blocks: [
        '관찰 대상: 강낭콩 · 관찰 기간·날짜: 10월 1일 ~ 10월 20일 · 관찰 장소: 교실 창가 · 관찰 방법·도구: 눈, 돋보기',
        '강낭콩이 어떻게 자라는지 궁금해서 관찰했다.',
        marker(IDS[0]), '▲ 심은 지 3일째, 뿌리가 나온 모습',
        '[10월 3일] 뿌리가 길게 나왔고 껍질이 갈라졌다.',
        marker(IDS[1]), '▲ 떡잎 두 장이 펴진 모습',
        '[10월 10일] 떡잎이 두 장 펴지고 줄기가 곧게 섰다. 색은 연두색이다.',
        '물을 매일 주면 잘 자란다는 것을 알게 되었다. 앞으로도 계속 관찰하고 싶다.',
        '참고 자료: ① 식물도감 12쪽',
    ],
};

export default function ReportReaderPreview() {
    const resolve = useMemo(() => {
        const photos = new Map([
            [IDS[0], { url: swatch('#16a34a', '#065f46', '강낭콩 (예시 사진)'), width: 800, height: 600 }],
            [IDS[1], { url: swatch('#65a30d', '#14532d', '떡잎 (예시 사진)'), width: 800, height: 600 }],
        ]);
        return async (ids) => new Map(ids.filter((id) => photos.has(id)).map((id) => [id, photos.get(id)]));
    }, []);
    return (
        <PhotoResolverContext.Provider value={resolve}>
            <ArtworkReader work={SAMPLE} roomTitle="우리 반 전시관 · 관찰 보고서" onClose={() => {}} />
        </PhotoResolverContext.Provider>
    );
}
