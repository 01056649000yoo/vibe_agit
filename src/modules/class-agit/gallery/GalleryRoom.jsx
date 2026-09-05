import { getGalleryTheme, roomVariantStyle } from '../designs.js';
import './themes.css';
import { GALLERY_ROOM, getGallerySlot, galleryRoomHeight } from './roomLayout.js';

export default function GalleryRoom({ works, onOpen, roomNumber = 1, theme, variant = 0, roomTitle }) {
    const height = galleryRoomHeight(works.length);
    return (
        <div className="class-agit-room" data-theme={getGalleryTheme(theme).id} data-variant={variant} aria-label={roomTitle || `${roomNumber} 전시실`} style={{ ...roomVariantStyle(theme, variant), '--room-aspect': `${GALLERY_ROOM.width} / ${height}` }}>
            <div className="class-agit-room__architecture" aria-hidden="true">
                <div className="class-agit-room__back" /><div className="class-agit-room__left" /><div className="class-agit-room__right" />
                <div className="class-agit-room__floor" /><div className="class-agit-room__lights"><i /><i /><i /></div>
                <div className="class-agit-room__bench" /><div className="class-agit-room__plant"><i /><i /><i /><b /></div>
                <span className="class-agit-room__sign">ROOM {String(roomNumber).padStart(2, '0')}</span>
            </div>
            {works.length === 0 ? <div className="class-agit-room__empty"><span aria-hidden="true">✦</span><h3>첫 작품을 기다리는 방</h3><p>아이들의 글을 담으면 이곳에 액자가 걸립니다.</p></div> : (
                <ol className="class-agit-room__works" aria-label="전시 작품">
                    {works.map((work, index) => {
                        const slot = getGallerySlot(index);
                        return <li key={work.id} className="class-agit-frame" style={{
                            '--frame-x': `${slot.x / GALLERY_ROOM.width * 100}%`, '--frame-y': `${slot.y / height * 100}%`,
                            '--frame-width': `${slot.width / GALLERY_ROOM.width * 100}%`, '--frame-height': `${slot.height / height * 100}%`,
                        }}>
                            <button type="button" data-work-id={work.id} onClick={(event) => onOpen(work, event.currentTarget)} aria-label={`${work.title}, ${work.author}, 전문 읽기`}>
                                <span className="class-agit-frame__paper" data-format={work.format}>
                                    <span className="class-agit-frame__kind">{work.kindLabel} <i aria-hidden="true">✦</i></span>
                                    <strong>{work.title}</strong><span className="class-agit-frame__excerpt">{work.excerpt}</span>
                                    <span className="class-agit-frame__author">{work.author}</span>
                                </span>
                            </button>
                        </li>;
                    })}
                </ol>
            )}
        </div>
    );
}
