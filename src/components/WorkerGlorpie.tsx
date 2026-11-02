'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { GlorpieProps } from 'glorpies/react';
import { faceColors, resolveLook } from 'glorpies';
import { canPaintOffscreen, painter } from '@/lib/face-worker';

const Fallback = dynamic(() => import('glorpies/react').then((module) => module.Glorpie), {
  ssr: false,
});
const RADIUS = { circle: '50%', squircle: '30%', rounded: '16%', square: '0' };
/** Website-only off-thread renderer. The published components and their defaults stay unchanged. */
export function WorkerGlorpie(props: GlorpieProps) {
  const {
    name,
    size = 48,
    look = 'auto',
    state = 'idle',
    alive,
    background = true,
    shape = 'circle',
    label = 'Avatar',
    className,
    style,
    pokeable,
  } = props;
  const root = useRef<HTMLSpanElement>(null);
  const update = useRef<(() => void) | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (fallback) return;
    if (!canPaintOffscreen()) {
      setFallback(true);
      return;
    }
    const host = root.current!;
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .45s ease';
    host.append(canvas);
    const client = painter((message) => {
      if (message.error) {
        setFallback(true);
        return;
      }
      canvas.style.opacity = '1';
      host.dataset.ready = 'true';
      host.dataset.seed = String(message.seed);
      host.dataset.animated = String(message.animated);
    });
    const offscreen = canvas.transferControlToOffscreen();
    client.send({ kind: 'attach', id: client.id, canvas: offscreen }, [offscreen]);
    let visible = false,
      near = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (!near) return;
      const p = latest.current,
        css = host.clientWidth;
      if (!css) return;
      client.send({
        kind: 'face',
        id: client.id,
        visible: visible && !document.hidden,
        settings: {
          name: p.name,
          look: resolveLook(p.look, css),
          state: p.state ?? 'idle',
          background: p.background !== false && typeof p.background !== 'string',
          alive: p.alive ?? !motion.matches,
          px: Math.min(1000, Math.round(css * Math.min(devicePixelRatio || 1, 2))),
          fps: matchMedia('(pointer: coarse)').matches ? 12 : 20,
        },
      });
    };
    update.current = sync;
    const viewport = new IntersectionObserver((entries) => {
      visible = entries[0]!.isIntersecting;
      client.send({ kind: 'visible', id: client.id, visible: visible && !document.hidden });
    });
    const proximity = new IntersectionObserver(
      (entries) => {
        near = entries[0]!.isIntersecting;
        if (near) sync();
      },
      { rootMargin: '80px' },
    );
    viewport.observe(host);
    proximity.observe(host);
    const resize = new ResizeObserver(sync);
    resize.observe(host);
    const visibility = () =>
      client.send({ kind: 'visible', id: client.id, visible: visible && !document.hidden });
    const point = (event: PointerEvent) => {
      const r = host.getBoundingClientRect();
      client.send({
        kind: 'pointer',
        id: client.id,
        x: Math.max(-1, Math.min(1, ((event.clientX - r.left - r.width / 2) / r.width) * 2)),
        y: Math.max(-1, Math.min(1, ((event.clientY - r.top - r.height / 2) / r.height) * 2)),
        poke: event.type === 'pointerdown',
      });
    };
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', sync);
    host.addEventListener('pointermove', point, { passive: true });
    if (latest.current.pokeable) host.addEventListener('pointerdown', point);
    return () => {
      client.dispose();
      canvas.remove();
      update.current = null;
      viewport.disconnect();
      proximity.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', sync);
      host.removeEventListener('pointermove', point);
      host.removeEventListener('pointerdown', point);
    };
  }, [fallback]);
  useEffect(() => update.current?.(), [name, size, look, state, alive, background, pokeable]);
  if (fallback) return <Fallback {...props} />;
  return (
    <span
      ref={root}
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: 'inline-block',
        position: 'relative',
        overflow: 'hidden',
        verticalAlign: 'middle',
        flexShrink: 0,
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        borderRadius: background !== false ? RADIUS[shape] : 0,
        background:
          typeof background === 'string' ? background : background ? faceColors(name).bg : 'none',
        ...style,
      }}
    />
  );
}
