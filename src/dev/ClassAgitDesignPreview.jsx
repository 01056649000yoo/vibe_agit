import { useState } from 'react';
import { BOOK_DESIGNS, GALLERY_THEMES } from '../modules/class-agit/designs.js';
import BookCover from '../modules/class-agit/anthology/BookCover.jsx';
import GalleryRoom from '../modules/class-agit/gallery/GalleryRoom.jsx';
import DesignPicker from '../modules/class-agit/teacher/DesignPicker.jsx';
import '../modules/class-agit/classAgit.css';
import '../modules/class-agit/management.css';

const SAMPLE_WORKS = [
    { id: 'one', title: '우리 반의 작은 발견', author: '김하늘', kindLabel: '이야기', format: 'prose', excerpt: '평범한 하루에서 찾은 특별한 순간' },
    { id: 'two', title: '비가 그친 다음', author: '이도윤', kindLabel: '시', format: 'poem', excerpt: '창가에 남은 빛을 바라보았다' },
    { id: 'three', title: '함께 걷는 길', author: '박서아', kindLabel: '이야기', format: 'prose', excerpt: '친구와 나눈 한 걸음의 기억' },
];

export default function ClassAgitDesignPreview() {
    const [theme, setTheme] = useState(GALLERY_THEMES[0].id);
    return <main className="class-agit" style={{ maxWidth: 1250, margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}><span className="class-agit-eyebrow">DESIGN STUDIO · DB 없는 미리보기</span><h1>전시관과 문집 디자인</h1><p>전시 디자인을 고르면 실제 전시실이 바뀝니다. 아래 표지는 실제 문집 표지 컴포넌트입니다.</p></header>
        <DesignPicker label="전시관 디자인 · 8종" options={GALLERY_THEMES} value={theme} onChange={setTheme} />
        <div style={{ maxWidth: 850, margin: '24px auto 44px' }}><GalleryRoom theme={theme} works={SAMPLE_WORKS} roomTitle="우리의 발견" onOpen={() => {}} /></div>
        <h2 style={{ marginBottom: 18 }}>문집 표지 · 8종</h2>
        <div className="class-agit-design-preview-books" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 24 }}>
            {BOOK_DESIGNS.map((design) => <div key={design.id}><BookCover book={{ title: '우리 반의 이야기', subtitle: '작은 글이 모여 큰 이야기가 되다', class_label: '햇살반', issue_date: '2026. 09.', paper_format: 'A4', design_id: design.id }} /><p style={{ marginTop: 10, fontWeight: 750 }}>{design.label}</p><small>{design.description}</small></div>)}
        </div>
    </main>;
}
