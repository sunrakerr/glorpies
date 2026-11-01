import { isLook, type LookChoice } from './looks';
import { mount, type FaceHandle } from './mount';
import { seedOf, type FaceName } from './seed';
import { isState } from './states';
import { backdropOf, faceColors, isShape } from './still';

const CSS = `
:host{display:inline-block;position:relative;inline-size:var(--size);block-size:var(--size);overflow:hidden;vertical-align:middle;border-radius:50%;background:var(--wash);contain:layout paint}
:host([shape=square]){border-radius:0!important}
:host([shape=rounded]){border-radius:16%!important}
:host([shape=squircle]){border-radius:30%!important}
@supports (corner-shape:squircle){:host([shape=squircle]){border-radius:50%!important;corner-shape:squircle}}
:host([background=false]){border-radius:0!important;corner-shape:round;background:none!important}
canvas{position:absolute;inset:0;inline-size:100%;block-size:100%;display:block;opacity:0;transition:opacity .45s ease}
:host([data-ready]) canvas{opacity:1}
:host(:not([data-ready]))::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);background-size:220% 100%;animation:sheen 1.4s ease-in-out infinite}
@keyframes sheen{from{background-position:120% 0}to{background-position:-120% 0}}
@media (prefers-reduced-motion:reduce){:host(:not([data-ready]))::after{animation:none}canvas{transition:none}}
`;

const ATTRS = ['name', 'look', 'size', 'shape', 'state', 'background', 'alive', 'pokeable', 'label', 'priority'] as const;

/** An unknown look is painted as "auto". */
const lookFrom = (v: string | null): LookChoice => (v && (v === 'auto' || isLook(v)) ? v : 'auto');

// The marker only applies to the name it accompanied; later HTML attribute edits are strings.
function numericName(element: GlorpieElement): number | undefined {
  const value = element.getAttribute('data-seed');
  return value !== null && value === element.getAttribute('name') && String(Number(value)) === value ? Number(value) : undefined;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/** `<glorpie-face>`: the React component's options as attributes, for plain HTML and any framework. */
export class GlorpieElement extends Base {
  static observedAttributes = [...ATTRS, 'data-seed'];
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
    this.handle ??= mount(this.canvas!, {
      ...this.options(),
      onPaint: () => this.toggleAttribute('data-ready', true),
      // a listener can call preventDefault() to handle the failure itself; otherwise it's logged
      onError: (error) => {
        if (this.dispatchEvent(new CustomEvent('glorpie-error', { detail: error, cancelable: true }))) console.error('glorpies: could not paint', this.faceName, error);
      },
    });
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
      attr === 'data-seed' ? true
      : attr === 'name' ? seedOf(was ?? '') !== seedOf(now ?? '')
      : attr === 'look' ? lookFrom(was) !== lookFrom(now)
      // a colour is the host's own background, so only going on or off the paper repaints
      : attr === 'background' && backdropOf(was).paper !== backdropOf(now).paper;
    if (repaints) this.removeAttribute('data-ready');
    this.handle.update(this.options());
  }

  /** Mirrors attributes into what CSS and assistive tech read: size, the wash behind the face (its own, or a chosen colour), the label. */
  private sync() {
    const size = this.getAttribute('size') ?? '48';
    this.style.setProperty('--size', /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size);
    this.style.setProperty('--wash', backdropOf(this.getAttribute('background')).colour ?? faceColors(this.faceName).bg);
    this.setAttribute('aria-label', this.getAttribute('label') ?? 'Avatar');
    const shape = this.getAttribute('shape');
    if (shape && !isShape(shape)) console.warn(`<glorpie-face> unknown shape "${shape}"`);
  }

  private get faceName(): FaceName {
    return numericName(this) ?? this.getAttribute('name') ?? '';
  }

  private options() {
    const look = this.getAttribute('look');
    const state = this.getAttribute('state');
    const alive = this.getAttribute('alive');
    const priority = Number(this.getAttribute('priority'));
    return {
      name: this.faceName,
      look: lookFrom(look),
      state: isState(state) ? state : 'idle',
      background: backdropOf(this.getAttribute('background')).paper,
      alive: alive === null ? undefined : alive !== 'false',
      pokeable: this.hasAttribute('pokeable'),
      priority: Number.isFinite(priority) && this.hasAttribute('priority') ? priority : undefined,
    };
  }
}

/** Attributes for which `false` is a value of its own rather than "leave it out". */
const SWITCHES = new Set<string>(['background', 'alive']);

// every attribute is a property too, as frameworks set properties when an element has them
for (const attr of ATTRS) {
  Object.defineProperty(GlorpieElement.prototype, attr, {
    get(this: GlorpieElement) {
      return attr === 'name' ? numericName(this) ?? this.getAttribute(attr) : this.getAttribute(attr);
    },
    set(this: GlorpieElement, value: unknown) {
      if (attr === 'name') {
        if (typeof value === 'number') this.setAttribute('data-seed', String(value));
        else this.removeAttribute('data-seed');
      }
      if (value === false && SWITCHES.has(attr)) this.setAttribute(attr, 'false');
      else if (value === null || value === undefined || value === false || (value === '' && SWITCHES.has(attr))) this.removeAttribute(attr);
      else this.setAttribute(attr, value === true ? '' : String(value));
    },
  });
}

export interface GlorpieElement extends Record<Exclude<(typeof ATTRS)[number], 'name'>, string | null> {
  name: FaceName | null;
}

/** Registers the element (as <glorpie-face> unless you name it). Safe to call more than once, and on a server. */
export function defineGlorpie(tag = 'glorpie-face') {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, class extends GlorpieElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'glorpie-face': GlorpieElement;
  }
}
