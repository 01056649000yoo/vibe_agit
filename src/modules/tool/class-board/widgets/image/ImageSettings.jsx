import React, { useRef, useState } from 'react';
import {
  optimizeClassBoardImage,
  uploadClassBoardImage,
} from '../../classBoardImageApi';

export default function ImageSettings({ config = {}, onChange, classId, boardId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => onChange({ ...config, ...patch });

  const upload = async (file) => {
    if (!file) return;
    if (!boardId) {
      setError('이미지를 올리기 전에 스크린을 한 번 저장해 주세요.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const optimizedImage = await optimizeClassBoardImage(file);
      const image = await uploadClassBoardImage({ classId, boardId, optimizedImage });
      update({ ...image, caption: config.caption || '', fit: config.fit || 'contain' });
    } catch (uploadError) {
      setError(uploadError.message || '이미지를 올리지 못했습니다.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="class-board-settings-grid">
      <label className="class-board-file-label">
        <span>이미지 파일</span>
        <input ref={inputRef} type="file" accept="image/*" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} />
        <small>긴 변 1920px·1MB 이하로 자동 최적화하며, 공개 URL은 저장하지 않습니다.</small>
      </label>
      {uploading ? <p className="class-board-note">이미지를 화면용으로 준비하는 중…</p> : null}
      {error ? <p className="class-board-error">{error}</p> : null}
      <label>
        <span>이미지 설명</span>
        <input maxLength={240} value={config.caption || ''} onChange={(event) => update({ caption: event.target.value })} />
      </label>
      <label>
        <span>맞춤 방식</span>
        <select value={config.fit || 'contain'} onChange={(event) => update({ fit: event.target.value })}>
          <option value="contain">전체 이미지 보이기</option>
          <option value="cover">공간 가득 채우기</option>
        </select>
      </label>
    </div>
  );
}

