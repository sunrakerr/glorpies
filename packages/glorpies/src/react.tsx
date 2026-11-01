'use client';

import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ImgHTMLAttributes, type ReactNode,
} from 'react';
import { cssLength, RADIUS, type GlorpieOptions } from './host';
import { mount, type FaceHandle } from './mount';
import { faceColors, type Shape } from './still';

export type GlorpieProps = GlorpieOptions & {
  /** Called if the face can't be painted; without it the error is logged. */
  onError?: (error: unknown) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * A living face. It renders on the server as a softly coloured placeholder in
 * the face's own background colour, then paints on the client.
 */
export function Glorpie({ name, look = 'auto', size = 48, shape = 'circle', state = 'idle', background = true, alive, pokeable = false, label = 'Avatar', priority, onError, className, style }: GlorpieProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const handle = useRef<FaceHandle | null>(null);
  const [ready, setReady] = useState(false);
  const wash = useMemo(() => faceColors(name).bg, [name]);
  const reportError = useRef(onError);
  useEffect(() => {
    reportError.current = onError;
  });

  useEffect(() => {
    const h = mount(ref.current!, {
      name, look, state, background, alive, pokeable, priority,
      onPaint: () => setReady(true),
      onError: (error) => (reportError.current ? reportError.current(error) : console.error('glorpies: could not paint', name, error)),
    });
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
        width: cssLength(size), height: cssLength(size), borderRadius: background ? RADIUS[shape] : 0, background: background ? wash : 'none', ...style,
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
export type AvatarProps = { children: ReactNode; size?: number | string; shape?: Shape; className?: string; style?: CSSProperties };

export type AvatarFallbackProps = Omit<GlorpieProps, 'size' | 'shape'>;

export function Avatar({ children, size = 48, shape = 'circle', className, style }: AvatarProps) {
  const [status, setStatus] = useState<Status>('loading');
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <AvatarContext.Provider value={value}>
      <span
        className={className}
        style={{ display: 'inline-grid', position: 'relative', overflow: 'hidden', verticalAlign: 'middle', flexShrink: 0, width: cssLength(size), height: cssLength(size), borderRadius: RADIUS[shape], ...style }}
      >
        {children}
      </span>
    </AvatarContext.Provider>
  );
}

export function AvatarImage({ src, srcSet, alt = '', style, onLoad, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const { status, setStatus } = useAvatar('AvatarImage');
  const img = useRef<HTMLImageElement>(null);
  const hasPhoto = Boolean(src || srcSet);
  // a photo already in the cache can finish loading before React is listening, so look at it directly too
  useEffect(() => {
    const el = img.current;
    setStatus(!hasPhoto ? 'error' : el?.complete && el.naturalWidth ? 'loaded' : 'loading');
  }, [hasPhoto, src, srcSet, setStatus]);
  if (!hasPhoto || status === 'error') return null;
  return (
    <img
      {...rest}
      ref={img}
      src={src}
      srcSet={srcSet}
      alt={alt}
      onLoad={(e) => {
        setStatus('loaded');
        onLoad?.(e);
      }}
      onError={(e) => {
        setStatus('error');
        onError?.(e);
      }}
      style={{ gridArea: '1 / 1', width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'loaded' ? 1 : 0, transition: 'opacity .3s ease', ...style }}
    />
  );
}

/** The face shown while the photo loads, or instead of it. Takes every `Glorpie` prop except size and shape, which come from `Avatar`. */
export function AvatarFallback(props: AvatarFallbackProps) {
  const { status } = useAvatar('AvatarFallback');
  if (status === 'loaded') return null;
  return <Glorpie {...props} size="100%" shape="square" style={{ gridArea: '1 / 1', ...props.style }} />;
}
