import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useLotteryDialog(phase, onClose) {
  const dialogRef = useRef(null);
  const finishButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (phase === 'done') finishButtonRef.current?.focus();
    const handleDialogKeys = (event) => {
      if (event.key === 'Escape' && phase === 'done') onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => window.removeEventListener('keydown', handleDialogKeys);
  }, [onClose, phase]);

  return { dialogRef, finishButtonRef };
}

export function useLotteryFlight(flyingPick, targetAttribute, targetKey) {
  const sourceRef = useRef(null);
  const [flight, setFlight] = useState(null);

  useLayoutEffect(() => {
    if (!flyingPick || !targetKey) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const source = sourceRef.current?.getBoundingClientRect();
      const targetElement = [...document.querySelectorAll(`[${targetAttribute}]`)]
        .find((element) => element.getAttribute(targetAttribute) === String(targetKey));
      const target = targetElement?.getBoundingClientRect();
      if (!source || !target) return;
      const startX = source.left + source.width / 2;
      const startY = source.top + source.height * 0.58;
      const deltaX = target.left + target.width / 2 - startX;
      const deltaY = target.top + target.height / 2 - startY;
      setFlight({
        key: `${flyingPick.studentId}-${targetKey}`,
        name: flyingPick.studentName,
        startX,
        startY,
        deltaX,
        deltaY,
        midX: deltaX * 0.52,
        midY: deltaY * 0.52 - 42,
        duration: flyingPick.flightDuration
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flyingPick, targetAttribute, targetKey]);

  return { sourceRef, flight };
}
