'use client';

import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ImgHTMLAttributes, type ReactNode,
} from 'react';
import type { LookChoice } from './looks';
import { mount, type FaceHandle } from './mount';
import type { FaceName } from './seed';
import type { FaceState } from './states';
import { faceColors, type Shape } from './still';

export type FuglioProps = {
  /** Any string or seed; the same name is always the same face. */
  name: FaceName;
  /** A look id, or `auto`: watercolour when large, the ink badge below 72px. */
  look?: LookChoice;
  /** Pixels, or any CSS length. Defaults to 48. */
  size?: number | string;
  /** The crop. Ignored without a background. */
  shape?: Shape;
  state?: FaceState;
  /** `false` shows only the face: no backdrop, no pencil lines, no crop, transparent all around. Defaults to true. */
  background?: boolean;
  /** Breathing, blinking and glancing. Defaults to on, unless the reader prefers reduced motion. */
  alive?: boolean;
  /** Tapping makes the face wobble. */
  pokeable?: boolean;
  /** Accessible name. Defaults to "Avatar". */
  label?: string;
  /** Higher paints sooner when many faces are waiting, e.g. the one in your header. */
  priority?: number;
  className?: string;
  style?: CSSProperties;
};

const RADIUS: Record<Shape, string> = { circle: '50%', squircle: '30%', rounded: '16%', square: '0' };

const length = (size: number | string) => (typeof size === 'number' ? `${size}px` : size);

/**
 * A living face. It renders on the server as a softly coloured placeholder in
 * the face's own background colour, then paints on the client.
 */
export function Fuglio({ name, look = 'auto', size = 48, shape = 'circle', state = 'idle', background = true, alive, pokeable = false, label = 'Avatar', priority, className, style }: FuglioProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<FaceHandle | null>(null);
  const [ready, setReady] = useState(false);
  const wash = useMemo(() => faceColors(name).bg, [name]);

  useEffect(() => {
    const h = mount(ref.current!, { name, look, state, background, alive, pokeable, priority, onPaint: () => setReady(true) });
    handle.current = h;
    return () => {
      h.destroy();
      handle.current = null;
    };
    // later prop changes are handed to the mounted face below
  }, []);

  useEffect(() => {
    handle.current?.update({ name, look, state, background, alive, pokeable });
  }, [name, look, state, background, alive, pokeable]);

  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: 'inline-block', position: 'relative', overflow: 'hidden', verticalAlign: 'middle', flexShrink: 0,
        // a face off its background waits on nothing: no placeholder wash, and no crop
        width: length(size), height: length(size), borderRadius: background ? RADIUS[shape] : 0, background: background ? wash : 'none', ...style,
      }}
    >
      <canvas
        ref={ref}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: ready ? 1 : 0, transition: 'opacity .45s ease' }}
      />
    </span>
  );
}

// ================= a photo, falling back to a face =================

type Status = 'loading' | 'loaded' | 'error';
const AvatarContext = createContext<{ status: Status; setStatus: (s: Status) => void } | null>(null);

function useAvatar(part: string) {
  const ctx = useContext(AvatarContext);
  if (!ctx) throw new Error(`<${part}> must be inside <Avatar>`);
  return ctx;
}

/**
 * A photo avatar that shows a face until the photo loads, and keeps showing it
 * if the photo fails or there isn't one.
 *
 *   <Avatar size={40}>
 *     <AvatarImage src={user.photo} alt={user.name} />
 *     <AvatarFallback name={user.email} />
 *   </Avatar>
 */
export function Avatar({ children, size = 48, shape = 'circle', className, style }: { children: ReactNode; size?: number | string; shape?: Shape; className?: string; style?: CSSProperties }) {
  const [status, setStatus] = useState<Status>('loading');
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <AvatarContext.Provider value={value}>
      <span
        className={className}
        style={{ display: 'inline-grid', position: 'relative', overflow: 'hidden', verticalAlign: 'middle', flexShrink: 0, width: length(size), height: length(size), borderRadius: RADIUS[shape], ...style }}
      >
        {children}
      </span>
    </AvatarContext.Provider>
  );
}

export function AvatarImage({ src, alt = '', style, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const { status, setStatus } = useAvatar('AvatarImage');
  const img = useRef<HTMLImageElement>(null);
  // a photo already in the cache can finish loading before React is listening, so look at it directly too
  useEffect(() => {
    const el = img.current;
    setStatus(!src ? 'error' : el?.complete && el.naturalWidth ? 'loaded' : 'loading');
  }, [src, setStatus]);
  if (!src || status === 'error') return null;
  return (
    <img
      {...rest}
      ref={img}
      src={src}
      alt={alt}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      style={{ gridArea: '1 / 1', width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'loaded' ? 1 : 0, transition: 'opacity .3s ease', ...style }}
    />
  );
}

/** The face shown while the photo loads, or instead of it. Takes every `Fuglio` prop except size and shape, which come from `Avatar`. */
export function AvatarFallback(props: Omit<FuglioProps, 'size' | 'shape'>) {
  const { status } = useAvatar('AvatarFallback');
  if (status === 'loaded') return null;
  return <Fuglio {...props} size="100%" shape="square" style={{ gridArea: '1 / 1', ...props.style }} />;
}
