import { faceCanvas, faceSVG, type FaceState, type Shape } from 'fuglios';
import type { LookId } from 'fuglios/internal/looks';
import { fileName, PRIORITY, schedule } from 'fuglios/internal/studio';

export const EXPORT_SIZES = [1024, 2048] as const;

/** A face as it should be exported: the gallery's are square and at ease, the playground's take its shape and mood. */
export type Still = { name: string; look: LookId; shape?: Shape; state?: FaceState };

/** Painted in the queue, after the face being looked at and before the rest of the gallery. */
const painted = <T,>(work: () => T) => schedule(PRIORITY.export, work).promise;

function pngBlob(s: Still, px: number): Promise<Blob> {
  return painted(() => faceCanvas(s.name, { ...s, size: px })).then(
    (c) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')),
  );
}

const svgMarkup = (s: Still) => painted(() => faceSVG(s.name, { ...s, size: 1024 }));

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPNG(s: Still, px: number = 1024) {
  save(await pngBlob(s, px), fileName(s.name, 'png', s.look));
}

export async function downloadSVG(s: Still) {
  save(new Blob([await svgMarkup(s)], { type: 'image/svg+xml' }), fileName(s.name, 'svg', s.look));
}

/**
 * The clipboard item is created synchronously with a pending blob so Safari
 * still counts the write as part of the click that asked for it.
 */
export async function copyPNG(s: Still) {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('This browser cannot copy images');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(s, 1024) })]);
}

export async function copySVG(s: Still) {
  const svg = svgMarkup(s);
  if ('ClipboardItem' in window && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': svg.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return;
    } catch {
      // fall through to writeText for browsers that only allow plain text writes
    }
  }
  await navigator.clipboard.writeText(await svg);
}
