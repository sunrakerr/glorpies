import type { LookId } from 'fuglios/internal/looks';
import { fileName, pngBlob, svgMarkup } from 'fuglios/internal/studio';

export const EXPORT_SIZES = [1024, 2048] as const;

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

export async function downloadPNG(seed: number, px: number = 1024, look?: LookId) {
  save(await pngBlob(seed, px, look), fileName(seed, 'png', look));
}

export async function downloadSVG(seed: number, look?: LookId) {
  const svg = await svgMarkup(seed, look);
  save(new Blob([svg], { type: 'image/svg+xml' }), fileName(seed, 'svg', look));
}

/**
 * The clipboard item is created synchronously with a pending blob so Safari
 * still counts the write as part of the click that asked for it.
 */
export async function copyPNG(seed: number, look?: LookId) {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('This browser cannot copy images');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(seed, 1024, look) })]);
}

export async function copySVG(seed: number, look?: LookId) {
  const svg = svgMarkup(seed, look);
  if ('ClipboardItem' in window && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': svg.then((s) => new Blob([s], { type: 'text/plain' })),
        }),
      ]);
      return;
    } catch {
      // Fall through to writeText for browsers that only allow plain text writes.
    }
  }
  await navigator.clipboard.writeText(await svg);
}
