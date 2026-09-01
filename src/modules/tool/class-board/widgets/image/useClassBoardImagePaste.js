import { useEffect, useRef, useState } from 'react';
import { prepareAndUploadClassBoardImage } from '../../classBoardImageApi';
import { getClipboardImageFile } from './clipboardImage';

export default function useClassBoardImagePaste({
  enabled,
  classId,
  boardId,
  validate,
  getPasteContext,
  onImage,
  onError,
}) {
  const [pasting, setPasting] = useState(false);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const optionsRef = useRef({ classId, boardId, validate, getPasteContext, onImage, onError });

  useEffect(() => {
    optionsRef.current = { classId, boardId, validate, getPasteContext, onImage, onError };
  }, [boardId, classId, getPasteContext, onError, onImage, validate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let active = true;

    const handlePaste = (event) => {
      const file = getClipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();

      const options = optionsRef.current;
      if (processingRef.current) {
        options.onError?.('이미지 붙여넣기를 처리하고 있습니다. 잠시만 기다려 주세요.');
        return;
      }
      const validationError = options.validate?.();
      if (validationError) {
        options.onError?.(validationError);
        return;
      }

      const uploadScope = { classId: options.classId, boardId: options.boardId };
      const pasteContext = options.getPasteContext?.();
      processingRef.current = true;
      setPasting(true);
      void prepareAndUploadClassBoardImage({
        file,
        classId: uploadScope.classId,
        boardId: uploadScope.boardId,
      }).then((image) => {
        if (!active) return;
        const current = optionsRef.current;
        if (current.classId !== uploadScope.classId || current.boardId !== uploadScope.boardId) {
          current.onError?.('스크린이 바뀌어 붙여넣은 이미지를 화면에 추가하지 않았습니다. 다시 붙여넣어 주세요.');
          return;
        }
        current.onImage?.(image, pasteContext);
      }).catch((pasteError) => {
        if (active) optionsRef.current.onError?.(pasteError.message || '붙여넣은 이미지를 올리지 못했습니다.');
      }).finally(() => {
        processingRef.current = false;
        if (mountedRef.current) setPasting(false);
      });
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      active = false;
      window.removeEventListener('paste', handlePaste);
    };
  }, [enabled]);

  return pasting;
}
