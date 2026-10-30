import { isLook, type LookChoice } from './looks';
import { mount, type FaceHandle } from './mount';
import { seedOf } from './seed';
import { isState } from './states';
import { faceColors, isShape } from './still';

const CSS = `
:host{display:inline-block;position:relative;inline-size:var(--size);block-size:var(--size);overflow:hidden;vertical-align:middle;border-radius:50%;background:var(--wash);contain:layout paint}
:host([shape=square]){border-radius:0}
:host([shape=rounded]){border-radius:16%}
:host([shape=squircle]){border-radius:30%}
@supports (corner-shape:squircle){:host([shape=squircle]){border-radius:50%;corner-shape:squircle}}
:host([background=false]){border-radius:0;corner-shape:round;background:none}
canvas{position:absolute;inset:0;inline-size:100%;block-size:100%;display:block;opacity:0;transition:opacity .45s ease}
:host([data-ready]) canvas{opacity:1}
:host(:not([data-ready]))::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);background-size:220% 100%;animation:sheen 1.4s ease-in-out infinite}
@keyframes sheen{from{background-position:120% 0}to{background-position:-120% 0}}
@media (prefers-reduced-motion:reduce){:host(:not([data-ready]))::after{animation:none}canvas{transition:none}}
`;

const ATTRS = ['name', 'look', 'size', 'shape', 'state', 'background', 'alive', 'pokeable', 'label'] as const;

/** An unknown look is painted as "auto". */
const lookFrom = (v: string | null): LookChoice => (v && (v === 'auto' || isLook(v)) ? v : 'auto');

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/** `<glorpie-face>`: the React component's options as attributes, for plain HTML and any framework. */
export class GlorpieElement extends Base {
  static observedAttributes = ATTRS;
  private canvas: HTMLCanvasElement | null = null;
  private handle: FaceHandle | null = null;

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('part', 'canvas');
      root.append(style, this.canvas);
    }
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.sync();
    this.handle ??= mount(this.canvas!, { ...this.options(), onPaint: () => this.toggleAttribute('data-ready', true) });
  }

  disconnectedCallback() {
    this.handle?.destroy();
    this.handle = null;
    this.removeAttribute('data-ready');
  }

  attributeChangedCallback(attr: string, was: string | null, now: string | null) {
    if (was === now || !this.handle) return;
    this.sync();
    // the canvas fades out only for a different painting: a renamed face, or a look that resolves to another
    const repaints =
      attr === 'name' ? seedOf(was ?? '') !== seedOf(now ?? '')
      : attr === 'look' ? lookFrom(was) !== lookFrom(now)
      : attr === 'background' && (was !== 'false') !== (now !== 'false');
    if (repaints) this.removeAttribute('data-ready');
    this.handle.update(this.options());
  }

  /** Mirrors attributes into what CSS and assistive tech read: size, the placeholder wash, the label. */
  private sync() {
    const size = this.getAttribute('size') ?? '48';
    this.style.setProperty('--size', /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size);
    this.style.setProperty('--wash', faceColors(this.name).bg);
    this.setAttribute('aria-label', this.getAttribute('label') ?? 'Avatar');
    const shape = this.getAttribute('shape');
    if (shape && !isShape(shape)) console.warn(`<glorpie-face> unknown shape "${shape}"`);
  }

  private get name() {
    return this.getAttribute('name') ?? '';
  }

  private options() {
    const look = this.getAttribute('look');
    const state = this.getAttribute('state');
    const alive = this.getAttribute('alive');
    return {
      name: this.name,
      look: lookFrom(look),
      state: isState(state) ? state : 'idle',
      background: this.getAttribute('background') !== 'false',
      alive: alive === null ? undefined : alive !== 'false',
      pokeable: this.hasAttribute('pokeable'),
    };
  }
}

/** Registers the element (as <glorpie-face> unless you name it). Safe to call more than once, and on a server. */
export function defineGlorpie(tag = 'glorpie-face') {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, class extends GlorpieElement {});
}

defineGlorpie();

declare global {
  interface HTMLElementTagNameMap {
    'glorpie-face': GlorpieElement;
  }
}
