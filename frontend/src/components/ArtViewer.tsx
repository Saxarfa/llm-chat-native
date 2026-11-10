import {HintButton} from './Hint';
import { useEffect, useLayoutEffect, useState, useRef, useCallback, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog } from 'radix-ui';
import { motion } from 'motion/react';
import { useReducedMotion } from '../useReducedMotion';
import { X, Loader2, Clapperboard, Expand, Plus, Minus } from '../icons';
import { ArtAnimator } from './ArtAnimator';
import { ArtUpscaler } from './ArtUpscaler';
import { ArtDownload } from './ArtDownload';
import { fitArtRect, artViewerTransform, type ImageRect } from './artViewerGeometry';
import { triggerHaptic } from '../haptics';
import { afterSurfaceMotion } from '../surfaceCompletion';
import { motionEasing, motionExitMs } from '../motion';
import './ArtViewerMotion.css';

type ArtFrame = { job: { id: string; prompt: string; width: number; height: number }; url: string };

export function ArtViewer({
  open,
  onOpenChange,
  frame,
  previous,
  getSourceRect,
  restoreFocus,
  status,
  progress,
  title = 'Просмотр арта на весь экран',
  downloadLabel,
  downloadExtension,
  closeLabel = 'Закрыть просмотр арта',
  animation = 'zoom',
  imageId,
  favoriteAction,
  editAction,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frame: ArtFrame;
  previous: ArtFrame | null;
  getSourceRect: () => ImageRect | null;
  restoreFocus: () => void;
  status?: string;
  progress?: number;
  title?: string;
  downloadLabel?: string;
  downloadExtension?: string;
  closeLabel?: string;
  animation?: 'zoom' | 'fade';
  imageId?: string;
  favoriteAction?: ReactNode;
  editAction?: ReactNode;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const reduced = useReducedMotion();
  const editCompletion = useRef<(()=>void)|null>(null);
  const dialogRef = useRef<HTMLDivElement|null>(null);
  const zoomLayerRef = useRef<HTMLDivElement|null>(null);
  const transitionCompletion = useRef<(()=>void)|null>(null);
  const [animating, setAnimating] = useState(false);
  const [animatingId, setAnimatingId] = useState(imageId);
  const [upscaling, setUpscaling] = useState(false);
  const [upscalingId, setUpscalingId] = useState(imageId);

  // Zoom, Pan & Gesture state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dismissDrag, setDismissDrag] = useState({ x: 0, y: 0 });
  const [swipeDragX, setSwipeDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dismissExit, setDismissExit] = useState(false);

  // Refs for event listeners & live access without stale closures
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    editCompletion.current?.();
    transitionCompletion.current?.();
  }, []);

  const readScreen = () => ({
    x: 0,
    y: window.visualViewport?.offsetTop || 0,
    width: window.innerWidth,
    height: window.visualViewport?.height || window.innerHeight,
  });
  const [screen, setScreen] = useState(readScreen);

  useEffect(() => {
    if (!open) return;
    const resize = () => setScreen(readScreen());
    resize();
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, [open]);

  const destination = fitArtRect(
    { x: 16, y: screen.y + 16, width: Math.max(1, screen.width - 32), height: Math.max(1, screen.height - 32) },
    frame.job.width / frame.job.height
  );
  const destRef = useRef(destination);
  destRef.current = destination;

  // Origin for initial dialog open animation
  const origin = useRef<ImageRect | null>(null);
  const lastState = useRef<{ open: boolean; id: string } | null>(null);
  if (!lastState.current || lastState.current.open !== open || lastState.current.id !== frame.job.id) {
    if (open) origin.current = getSourceRect();
    lastState.current = { open, id: frame.job.id };
  }
  const transform = artViewerTransform(origin.current, destination, screen);

  const enableTransition = useCallback(() => {
    transitionCompletion.current?.();
    if(reduced){setIsTransitioning(false);return}
    setIsTransitioning(true);
    transitionCompletion.current=afterSurfaceMotion(zoomLayerRef.current,()=>{transitionCompletion.current=null;setIsTransitioning(false)});
  }, [reduced]);

  // Reset zoom & pan on open or image switch. A closing viewer keeps its last
  // frame so its exit continues from where it was, not from the centre.
  useLayoutEffect(() => {
    transitionCompletion.current?.();
    if (!open) return;
    editCompletion.current?.();
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDismissDrag({ x: 0, y: 0 });
    setSwipeDragX(0);
    setIsDragging(false);
    setIsTransitioning(false);
    setDismissExit(false);
  }, [open, frame.job.id]);

  // Adjust pan when window/stage dimensions change while zoomed
  useEffect(() => {
    if (zoomRef.current <= 1) return;
    const minX = destination.width * (1 - zoomRef.current);
    const minY = destination.height * (1 - zoomRef.current);
    setPan(prev => ({
      x: Math.max(minX, Math.min(0, prev.x)),
      y: Math.max(minY, Math.min(0, prev.y)),
    }));
  }, [destination.width, destination.height]);

  const resetZoom = useCallback(() => {
    enableTransition();
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [enableTransition]);

  const zoomAroundPoint = useCallback((nextZoomTarget: number, cursorX: number, cursorY: number) => {
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const dest = destRef.current;
    const clampedZoom = Math.max(1, Math.min(8, nextZoomTarget));

    if (clampedZoom === 1) {
      enableTransition();
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    let nextPanX = cursorX - (cursorX - currentPan.x) * (clampedZoom / currentZoom);
    let nextPanY = cursorY - (cursorY - currentPan.y) * (clampedZoom / currentZoom);

    const minX = dest.width * (1 - clampedZoom);
    const minY = dest.height * (1 - clampedZoom);

    nextPanX = Math.max(minX, Math.min(0, nextPanX));
    nextPanY = Math.max(minY, Math.min(0, nextPanY));

    enableTransition();
    setZoom(clampedZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, [enableTransition]);

  const zoomIn = useCallback(() => {
    zoomAroundPoint(zoomRef.current * 1.5, destRef.current.width / 2, destRef.current.height / 2);
  }, [zoomAroundPoint]);

  const zoomOut = useCallback(() => {
    zoomAroundPoint(zoomRef.current / 1.5, destRef.current.width / 2, destRef.current.height / 2);
  }, [zoomAroundPoint]);

  // Native wheel listener for desktop (passive: false to prevent default page zoom/scroll)
  useEffect(() => {
    if (!open) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const stageEl = stageRef.current;
      const rect = stageEl ? stageEl.getBoundingClientRect() : destRef.current;
      const cursorX = Math.max(0, Math.min(rect.width, e.clientX - rect.x));
      const cursorY = Math.max(0, Math.min(rect.height, e.clientY - rect.y));

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const dest = destRef.current;

      const delta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-delta * 0.0025);
      let nextZoom = Math.max(1, Math.min(8, currentZoom * factor));

      if (Math.abs(nextZoom - 1) < 0.02 && factor < 1) {
        nextZoom = 1;
      }

      if (nextZoom === 1) {
        setIsTransitioning(false);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }

      let nextPanX = cursorX - (cursorX - currentPan.x) * (nextZoom / currentZoom);
      let nextPanY = cursorY - (cursorY - currentPan.y) * (nextZoom / currentZoom);

      const minX = dest.width * (1 - nextZoom);
      const minY = dest.height * (1 - nextZoom);

      nextPanX = Math.max(minX, Math.min(0, nextPanX));
      nextPanY = Math.max(minY, Math.min(0, nextPanY));

      setIsTransitioning(false);
      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [open]);

  // Prevent Safari iOS default gesture zooming on the page
  useEffect(() => {
    if (!open) return;
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('gesturestart', prevent, { passive: false });
    window.addEventListener('gesturechange', prevent, { passive: false });
    window.addEventListener('gestureend', prevent, { passive: false });
    return () => {
      window.removeEventListener('gesturestart', prevent);
      window.removeEventListener('gesturechange', prevent);
      window.removeEventListener('gestureend', prevent);
    };
  }, [open]);

  // Keyboard zoom & navigation controls (+, -, 0, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      } else if (zoomRef.current <= 1.02 && e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (zoomRef.current <= 1.02 && e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, zoomIn, zoomOut, resetZoom, hasPrev, hasNext, onPrev, onNext]);

  // Multi-pointer state for drag, pinch, pull-to-dismiss & horizontal swipe
  const pointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const dragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
    axis: 'none' | 'pan' | 'vertical' | 'horizontal';
    lastY: number;
    lastTime: number;
    velocityY: number;
    startTime: number;
  } | null>(null);
  const pinchStartRef = useRef<{ dist: number; mid: { x: number; y: number }; zoom: number; pan: { x: number; y: number } } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const ignoreNextDblClick = useRef(false);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only capture primary mouse button or touch
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Double-tap detection for touch pointers only
    if (e.pointerType === 'touch') {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (lastTap && now - lastTap.time < 420) {
        const dist = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y);
        if (dist < 40) {
          e.preventDefault();
          ignoreNextDblClick.current = true;
          setTimeout(() => {
            ignoreNextDblClick.current = false;
          }, 400);
          triggerHaptic('light');
          const rect = stageRef.current?.getBoundingClientRect();
          const cx = rect ? e.clientX - rect.left : destRef.current.width / 2;
          const cy = rect ? e.clientY - rect.top : destRef.current.height / 2;
          if (zoomRef.current > 1.1) {
            resetZoom();
          } else {
            zoomAroundPoint(2.5, cx, cy);
          }
          lastTapRef.current = null;
          return;
        }
      }
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }

    if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: false,
        axis: zoomRef.current > 1.02 ? 'pan' : 'none',
        lastY: e.clientY,
        lastTime: e.timeStamp,
        velocityY: 0,
        startTime: e.timeStamp,
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const mid = { x: (pts[0].clientX + pts[1].clientX) / 2, y: (pts[0].clientY + pts[1].clientY) / 2 };
      pinchStartRef.current = { dist, mid, zoom: zoomRef.current, pan: { ...panRef.current } };
      dragStartRef.current = null;
      setDismissDrag({ x: 0, y: 0 });
      setSwipeDragX(0);
      setIsTransitioning(false);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    const stageEl = stageRef.current;
    if (!stageEl) return;
    const dest = destRef.current;

    // 2-finger pinch
    if (pointersRef.current.size === 2) {
      const pinch = pinchStartRef.current;
      if (!pinch || pinch.dist <= 0) return;

      const pts = Array.from(pointersRef.current.values());
      const currentDist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const currentMid = { x: (pts[0].clientX + pts[1].clientX) / 2, y: (pts[0].clientY + pts[1].clientY) / 2 };

      const scaleFactor = currentDist / pinch.dist;
      const rawZoom = pinch.zoom * scaleFactor;
      // Allow slight rubber-band zone between 0.85 and 9
      const newZoom = Math.max(0.85, Math.min(9, rawZoom));

      const rect = stageEl.getBoundingClientRect();
      const initMidStageX = pinch.mid.x - rect.left;
      const initMidStageY = pinch.mid.y - rect.top;
      const currMidStageX = currentMid.x - rect.left;
      const currMidStageY = currentMid.y - rect.top;

      const imgX = (initMidStageX - pinch.pan.x) / pinch.zoom;
      const imgY = (initMidStageY - pinch.pan.y) / pinch.zoom;

      let nextPanX = currMidStageX - imgX * newZoom;
      let nextPanY = currMidStageY - imgY * newZoom;

      if (newZoom >= 1) {
        const minX = dest.width * (1 - newZoom);
        const minY = dest.height * (1 - newZoom);
        nextPanX = Math.max(minX - 50, Math.min(50, nextPanX));
        nextPanY = Math.max(minY - 50, Math.min(50, nextPanY));
      }

      setIsTransitioning(false);
      setZoom(newZoom);
      setPan({ x: nextPanX, y: nextPanY });
      return;
    }

    if (pointersRef.current.size === 1) {
      const drag = dragStartRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;

      // 1-pointer pan when zoomed in
      if (zoomRef.current > 1.02 || drag.axis === 'pan') {
        if (!drag.moved && Math.hypot(dx, dy) > 3) {
          drag.moved = true;
          drag.axis = 'pan';
          setIsDragging(true);
        }

        if (drag.moved) {
          setIsTransitioning(false);
          const minX = dest.width * (1 - zoomRef.current);
          const minY = dest.height * (1 - zoomRef.current);
          const nextPanX = Math.max(minX, Math.min(0, drag.panX + dx));
          const nextPanY = Math.max(minY, Math.min(0, drag.panY + dy));
          setPan({ x: nextPanX, y: nextPanY });
        }
        return;
      }

      // 1-pointer gestures at 1x zoom: vertical pull-to-dismiss or horizontal swipe between arts
      if (drag.axis === 'none' && Math.hypot(dx, dy) > 8) {
        if (dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
          drag.axis = 'vertical';
          drag.moved = true;
          setIsDragging(true);
          setIsTransitioning(false);
        } else if (Math.abs(dx) > Math.abs(dy) * 1.15 && (onPrev || onNext)) {
          drag.axis = 'horizontal';
          drag.moved = true;
          setIsDragging(true);
          setIsTransitioning(false);
        }
      }

      if (drag.axis === 'vertical') {
        const dt = e.timeStamp - drag.lastTime;
        if (dt > 0) drag.velocityY = (e.clientY - drag.lastY) / dt;
        drag.lastY = e.clientY;
        drag.lastTime = e.timeStamp;
        setDismissDrag({ x: dx * 0.32, y: Math.max(0, dy) });
      } else if (drag.axis === 'horizontal') {
        const allowed = (dx > 0 && hasPrev) || (dx < 0 && hasNext);
        setSwipeDragX(allowed ? dx : dx * 0.28);
      }
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    pointersRef.current.delete(e.pointerId);

    // If one finger remains after pinch, seamlessly transition to single-finger drag
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = {
        x: remaining.clientX,
        y: remaining.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: false,
        axis: zoomRef.current > 1.02 ? 'pan' : 'none',
        lastY: remaining.clientY,
        lastTime: e.timeStamp,
        velocityY: 0,
        startTime: e.timeStamp,
      };
      pinchStartRef.current = null;
      return;
    }

    if (pointersRef.current.size === 0) {
      const drag = dragStartRef.current;
      setIsDragging(false);
      dragStartRef.current = null;
      pinchStartRef.current = null;

      if (drag?.axis === 'vertical') {
        const dy = Math.max(0, e.clientY - drag.y);
        const fastFlick = e.timeStamp - drag.lastTime <= 100 && drag.velocityY >= 0.55 && dy >= 30;
        if (dy >= 85 || fastFlick) {
          triggerHaptic('light');
          setDismissExit(true);
          if (!reduced) setDismissDrag(current => ({ x: current.x, y: current.y + Math.max(120, window.innerHeight * 0.3) }));
          onOpenChange(false);
          return;
        }
        enableTransition();
        setDismissDrag({ x: 0, y: 0 });
        return;
      }

      if (drag?.axis === 'horizontal') {
        const dx = e.clientX - drag.x;
        const flick = Math.abs(dx) >= 24 && Math.abs(dx) / Math.max(1, e.timeStamp - drag.startTime) > 0.11;
        enableTransition();
        setSwipeDragX(0);
        if ((dx <= -55 || (flick && dx < 0)) && hasNext && onNext) {
          triggerHaptic('light');
          onNext();
        } else if ((dx >= 55 || (flick && dx > 0)) && hasPrev && onPrev) {
          triggerHaptic('light');
          onPrev();
        }
        return;
      }

      // Snap-back animation if rubber-banded or out of bounds
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const dest = destRef.current;

      if (currentZoom < 1.02) {
        enableTransition();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else {
        const clampedZoom = Math.min(8, currentZoom);
        const minX = dest.width * (1 - clampedZoom);
        const minY = dest.height * (1 - clampedZoom);
        const clampedPanX = Math.max(minX, Math.min(0, currentPan.x));
        const clampedPanY = Math.max(minY, Math.min(0, currentPan.y));

        if (clampedZoom !== currentZoom || clampedPanX !== currentPan.x || clampedPanY !== currentPan.y) {
          enableTransition();
          setZoom(clampedZoom);
          setPan({ x: clampedPanX, y: clampedPanY });
        }
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (ignoreNextDblClick.current) {
      ignoreNextDblClick.current = false;
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : destRef.current.width / 2;
    const cy = rect ? e.clientY - rect.top : destRef.current.height / 2;
    if (zoomRef.current > 1.1) {
      resetZoom();
    } else {
      zoomAroundPoint(2.5, cx, cy);
    }
  };

  const stageStyle = {
    left: destination.x,
    top: destination.y,
    width: destination.width,
    height: destination.height,
    '--art-open-x': `${transform.x}px`,
    '--art-open-y': `${transform.y}px`,
    '--art-open-scale-x': transform.scaleX,
    '--art-open-scale-y': transform.scaleY,
  } as CSSProperties;

  const effectiveX = pan.x + dismissDrag.x + swipeDragX;
  const effectiveY = pan.y + dismissDrag.y;
  const effectiveScale = zoom;

  const zoomLayerStyle = {
    transform: `translate3d(${effectiveX}px, ${effectiveY}px, 0px) scale(${effectiveScale})`,
    transformOrigin: dismissDrag.y > 0 ? '50% 50%' : '0 0',
    transition: dismissExit && !reduced ? `transform ${motionExitMs}ms ${motionEasing}` : isTransitioning ? (reduced ? 'none' : `transform 240ms ${motionEasing}`) : 'none',
  } as CSSProperties;

  const backdropStyle = dismissExit
    ? ({ opacity: 0, transition: `opacity ${motionExitMs}ms ${motionEasing}` } as CSSProperties)
    : dismissDrag.y > 0
      ? ({ opacity: Math.max(0.15, 1 - dismissDrag.y / 380), transition: 'none' } as CSSProperties)
      : undefined;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="art-viewer-backdrop" style={backdropStyle} />
          <Dialog.Content
            ref={dialogRef}
            className="art-viewer"
            data-transition={animation}
            aria-describedby={undefined}
            onCloseAutoFocus={e => {
              e.preventDefault();
              restoreFocus();
            }}
            onEscapeKeyDown={e => {
              if (zoomRef.current > 1.05) {
                e.preventDefault();
                resetZoom();
              }
            }}
            onClick={e => {
              if (e.target === e.currentTarget) onOpenChange(false);
            }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <div
              ref={stageRef}
              className={`art-viewer-stage ${zoom > 1 ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
              style={stageStyle}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onLostPointerCapture={handlePointerUp}
              onDoubleClick={handleDoubleClick}
            >
              <div ref={zoomLayerRef} className="art-viewer-zoomable" style={zoomLayerStyle}>
                {previous && <img draggable={false} src={previous.url} alt="Предыдущий арт" />}
                <motion.img
                  key={frame.job.id}
                  draggable={false}
                  src={frame.url}
                  alt={frame.job.prompt}
                  initial={{ opacity: previous ? 0 : 1 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduced ? 0 : 0.25, ease: 'easeOut' }}
                />
              </div>
            </div>

            {zoom > 1.05 && (
              <div
                className="art-viewer-zoom-controls"
              >
                <HintButton type="button" className="art-viewer-zoom-btn" onClick={zoomOut} aria-label="Уменьшить масштаб">
                  <Minus size={14} />
                </HintButton>
                <button
                  type="button"
                  className="art-viewer-zoom-btn art-viewer-zoom-reset"
                  onClick={resetZoom}
                  aria-label="Сбросить масштаб к 100%"
                >
                  <span>{Math.round(zoom * 100)}%</span>
                  <span className="art-viewer-zoom-sep">· Сброс</span>
                </button>
                <HintButton type="button" className="art-viewer-zoom-btn" onClick={zoomIn} aria-label="Увеличить масштаб">
                  <Plus size={14} />
                </HintButton>
              </div>
            )}

            {status && (() => {
              const known = typeof progress === 'number' && Number.isFinite(progress);
              const percent = known ? Math.max(0, Math.min(100, progress as number)) : 0;
              return (
                <div className="art-viewer-status" role="status">
                  <div className="art-viewer-status-track">
                    {known ? <div className="art-viewer-status-fill" style={{ transform: `scaleX(${percent / 100})` }} /> : <div className="art-viewer-status-wait" />}
                  </div>
                  <span className="art-viewer-status-label">{status}{known ? ` · ${Math.round(percent)}%` : ''}</span>
                </div>
              );
            })()}
            {favoriteAction}
            {editAction}
            {imageId && (
              <button
                type="button"
                className="art-viewer-close art-viewer-upscale"
                style={{ right: 144 }}
                aria-label="Увеличить арт"
                onClick={() => {
                  setUpscalingId(imageId);
                  onOpenChange(false);
                  editCompletion.current?.();editCompletion.current=afterSurfaceMotion(dialogRef.current,()=>{editCompletion.current=null;setUpscaling(true)});
                }}
              >
                <Expand size={16} />
              </button>
            )}
            {imageId && (
              <HintButton
                type="button"
                className="art-viewer-close art-viewer-animate"
                style={{ right: 100 }}
                aria-label="Оживить арт"
                onClick={() => {
                  setAnimatingId(imageId);
                  onOpenChange(false);
                  editCompletion.current?.();editCompletion.current=afterSurfaceMotion(dialogRef.current,()=>{editCompletion.current=null;setAnimating(true)});
                }}
              >
                <Clapperboard size={16} />
              </HintButton>
            )}
            <ArtDownload
              label={downloadLabel}
              extension={downloadExtension}
              url={frame.url}
              imageId={imageId}
              name={`Art-${frame.job.id}`}
              className="art-viewer-close art-viewer-download"
              size={16}
            />
            <Dialog.Close className="art-viewer-close" aria-label={closeLabel}>
              <X size={16} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {animatingId && <ArtAnimator imageId={animatingId} open={animating} onOpenChange={setAnimating} />}
      {upscalingId && <ArtUpscaler imageId={upscalingId} open={upscaling} onOpenChange={setUpscaling} />}
    </>
  );
}
