'use client';
import { useEffect, useRef } from 'react';
/** Nonmodal offices remain connected to the live map; Escape closes and focus returns to the opener. */
export function useOfficeFocus(close: () => void) {
  const panel = useRef<HTMLElement>(null);
  const latestClose = useRef(close);
  useEffect(() => {
    latestClose.current = close;
  }, [close]);
  useEffect(() => {
    const section = panel.current;
    if (!section) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    section
      .querySelector<HTMLElement>('button, input, select, [tabindex="0"]')
      ?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        latestClose.current();
      }
    };
    section.addEventListener('keydown', keydown);
    return () => {
      section.removeEventListener('keydown', keydown);
      if (
        opener?.isConnected &&
        (section.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        opener.focus({ preventScroll: true });
    };
  }, []);
  return panel;
}
