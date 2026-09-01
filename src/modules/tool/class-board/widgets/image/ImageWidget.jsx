import React from 'react';

export default function ImageWidget({ config = {}, assetUrl = '', dragHandleProps }) {
  if (!config.path || !assetUrl) {
    return (
      <div {...dragHandleProps} className="class-board-image class-board-image--empty">
        <span aria-hidden="true">🖼️</span>
        <strong>보여 줄 이미지를 올려 주세요</strong>
      </div>
    );
  }
  return (
    <figure {...dragHandleProps} className="class-board-image">
      <img draggable={false} src={assetUrl} alt={config.caption || '교사가 올린 학급 화면 이미지'} style={{ objectFit: config.fit || 'contain' }} />
      {config.caption ? <figcaption>{config.caption}</figcaption> : null}
    </figure>
  );
}
