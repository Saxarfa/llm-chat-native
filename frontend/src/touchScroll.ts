import {isIOSWebKit} from './iosKeyboardFocus';

function findScrollableParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function attachTouchScroll(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return;
  // iOS provides momentum, selection handles and scroll chaining itself.
  // Cancelling touchmove here breaks caret selection and competes with Safari.
  if (isIOSWebKit(navigator.userAgent,navigator.platform,navigator.maxTouchPoints)) return;

  let startX = 0;
  let startY = 0;
  let startScrollTop = 0;
  let scrollEl: HTMLElement | null = null;
  let wasFocused = false;
  let isScrolling = false;
  let moved = false;
  let lastY = 0;
  let lastTime = 0;
  let velocityY = 0;
  let momentumRaf: number | null = null;

  const stopMomentum = () => {
    if (momentumRaf !== null) {
      cancelAnimationFrame(momentumRaf);
      momentumRaf = null;
    }
    velocityY = 0;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    stopMomentum();
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    lastY = touch.clientY;
    lastTime = performance.now();
    wasFocused = document.activeElement === el;
    isScrolling = false;
    moved = false;

    // Determine target element to scroll: textarea if scrollable, otherwise scrollable parent
    scrollEl = (el.scrollHeight > el.clientHeight + 2) ? el : findScrollableParent(el);
    startScrollTop = scrollEl ? scrollEl.scrollTop : 0;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!isScrolling) {
      if (Math.abs(dy) > 5 || Math.abs(dx) > 5) {
        isScrolling = true;
        moved = true;
        el.setAttribute('data-touch-scrolling', 'true');
      }
    }

    if (isScrolling) {
      // Prevent browser text selection, caret drag & magnifier loupe
      if (e.cancelable) {
        e.preventDefault();
      }

      // Track velocity for smooth momentum release
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 10) {
        velocityY = (touch.clientY - lastY) / dt;
        lastY = touch.clientY;
        lastTime = now;
      }

      // Clear any text selection that may have begun
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        sel.removeAllRanges();
      }

      // Scroll the target directly
      if (scrollEl) {
        scrollEl.scrollTop = startScrollTop - dy;
      }
    }
  };

  const cleanupTouchState = () => {
    el.removeAttribute('data-touch-scrolling');
    isScrolling = false;
  };

  const onTouchEnd = (e: TouchEvent) => {
    cleanupTouchState();

    if (moved) {
      // User was scrolling: prevent synthetic click from focusing or placing caret
      if (e.cancelable) {
        e.preventDefault();
      }

      if (!wasFocused) {
        if (document.activeElement === el) {
          el.blur();
        }
        setTimeout(() => {
          if (document.activeElement === el) {
            el.blur();
          }
        }, 0);
      }

      // Momentum gliding if flicked with speed
      if (scrollEl && Math.abs(velocityY) > 0.15) {
        let v = velocityY;
        const target = scrollEl;
        const momentumStep = () => {
          v *= 0.92;
          target.scrollTop -= v * 16;
          if (Math.abs(v) > 0.05) {
            momentumRaf = requestAnimationFrame(momentumStep);
          } else {
            momentumRaf = null;
          }
        };
        momentumRaf = requestAnimationFrame(momentumStep);
      }
    }

    moved = false;
  };

  const onTouchCancel = () => {
    cleanupTouchState();
    moved = false;
    stopMomentum();
  };

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  el.addEventListener('touchcancel', onTouchCancel, { passive: true });

  return () => {
    stopMomentum();
    cleanupTouchState();
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchCancel);
  };
}
