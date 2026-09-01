import { useEffect, useRef } from 'react';

const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export const isClassBoardTextEntryTarget = (target) => Boolean(target?.closest?.(TEXT_ENTRY_SELECTOR));

export default function useClassBoardEscapeRemove({ enabled, onRemove }) {
  const removeRef = useRef(onRemove);

  useEffect(() => {
    removeRef.current = onRemove;
  }, [onRemove]);

  useEffect(() => {
    if (!enabled) return undefined;
    const removeWithEscape = (event) => {
      if (
        event.key !== 'Escape'
        || event.defaultPrevented
        || event.repeat
        || event.isComposing
        || isClassBoardTextEntryTarget(event.target)
      ) return;
      event.preventDefault();
      removeRef.current?.();
    };
    window.addEventListener('keydown', removeWithEscape);
    return () => window.removeEventListener('keydown', removeWithEscape);
  }, [enabled]);
}
