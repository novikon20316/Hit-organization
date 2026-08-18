// lib/colorTones.ts
// Derives a small dark-sidebar tonal palette from a single seed hex color —
// the same idea Material You uses to build a whole theme from one seed
// color. Used by components/dashboard/SidebarShell.tsx's 'accent' theme
// mode so every role (which today only has one accent hex, from
// getRoleAccent) gets a visually distinct sidebar without hand-authoring a
// full color system per role. Fixed lightness/saturation targets per tone —
// only the hue changes per role, so contrast/readability stays consistent
// no matter which role's accent goes in.

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  let r: number;
  let g: number;
  let b: number;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface SidebarTones {
  /** Sidebar background — dark, tinted with the role's hue. */
  bg: string;
  /** Active nav-item background. */
  container: string;
  /** Inactive nav-item text. */
  fgMuted: string;
  /** Active nav-item text, and the brand heading. */
  fgActive: string;
  /** Active-item accent border / highlight — the most saturated tone. */
  accentBright: string;
}

export function deriveSidebarTones(accentHex: string): SidebarTones {
  const [h] = hexToHsl(accentHex);
  return {
    bg: hslToHex(h, 32, 16),
    container: hslToHex(h, 30, 28),
    fgMuted: hslToHex(h, 18, 72),
    fgActive: hslToHex(h, 20, 93),
    accentBright: hslToHex(h, 55, 62),
  };
}
