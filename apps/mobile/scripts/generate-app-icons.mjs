/**
 * Rasterises `_/brand/logo-mark.svg` into every PNG `app.config.ts` references.
 *
 *   node scripts/generate-app-icons.mjs      (or `npm run icons -w mobile`)
 *
 * Build-time only. `sharp` is a devDependency and is never imported from
 * `src/` — nothing here reaches the native bundle, so running this does not
 * require a dev-client rebuild. Seeing the *result* on a phone does: an app
 * icon and splash image are baked into the APK, so they only change on the
 * next `npm run build:dev` / `build:preview`, never on a JS reload.
 *
 * The PNGs are committed alongside this script on purpose — a reviewer should
 * be able to look at the icon without installing Node and sharp first.
 *
 * ── Why compose the SVG here instead of keeping six SVG files ───────────────
 * The outputs are not six drawings, they are six *crops* of one drawing: the
 * full composition for the launcher icon and favicon, the letterforms alone
 * for Android's adaptive foreground (which is masked, and gets its blue from
 * the background layer), the letters plus the accent with no tile for the
 * splash (whose background is already brand blue). Six files would be six
 * things to keep in sync; one file plus three named groups is one.
 */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');

const SOURCE = path.join(repoRoot, '_/brand/logo-mark.svg');
const OUT_DIR = path.join(appRoot, 'assets/images');

/** The tile fill, and the `android.adaptiveIcon.backgroundColor` in app.config.ts. */
const BRAND_BLUE = '#0B5FA5';

/** The source's viewBox. Every bounding box below is in these coordinates. */
const CANVAS = 1024;

/**
 * Ink bounds of `#monogram`, measured from the source's own numbers rather
 * than guessed: the rects run x 244→780 and y 236→644, and the K's arms end in
 * a butt cap whose corners sit 33.23 beyond the endpoint (half of the 88 stroke
 * projected onto the arm's normal), putting the extremes at 235.77 / 644.23.
 */
const MONOGRAM_BOX = { x: 244, y: 235.77, width: 536, height: 408.46 };

/** `#monogram` plus the accent disc (centre 822,806 r108). */
const MARK_BOX = { x: 244, y: 235.77, width: 686, height: 678.23 };

/**
 * Android adaptive icons: the launcher mask can crop anything outside a
 * centred circle 66dp across on the 108dp layer. Fitting the monogram's
 * *diagonal* inside that circle — not just its width — is what guarantees the
 * K's top-left and the E's bottom-right corner survive a circular mask.
 */
const ADAPTIVE_SAFE_FRACTION = 66 / 108;

/**
 * Supersample before downscaling. sharp renders an SVG at `density` DPI
 * against the document's 1024pt size, so 144 DPI is a 2048px render; resizing
 * that down with Lanczos gives cleaner diagonals than rasterising straight to
 * the target size.
 */
const RENDER_DENSITY = 144;

const source = await readFile(SOURCE, 'utf8');

/** Pulls one top-level `<g id="…">` out of the source. Groups are flat by contract. */
function group(id) {
  const match = source.match(new RegExp(`<g id="${id}"[\\s\\S]*?</g>`));
  if (!match) throw new Error(`${path.relative(repoRoot, SOURCE)} has no <g id="${id}">`);
  return match[0];
}

const TILE = group('tile');
const MONOGRAM = group('monogram');
const ACCENT = group('accent');

/**
 * A transform that centres `box` on the canvas and scales it so its diagonal
 * fits `fraction` of the canvas width. Diagonal rather than width because the
 * callers that need this are fitting into a circle.
 */
function fitDiagonal(box, fraction) {
  const diagonal = Math.hypot(box.width, box.height);
  const scale = (CANVAS * fraction) / diagonal;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = CANVAS / 2;

  return `translate(${half} ${half}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})`;
}

/** As above, but fits the box's *extent* — for square canvases with no mask. */
function fitExtent(box, fraction) {
  const scale = Math.min((CANVAS * fraction) / box.width, (CANVAS * fraction) / box.height);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const half = CANVAS / 2;

  return `translate(${half} ${half}) scale(${scale.toFixed(4)}) translate(${-cx} ${-cy})`;
}

function svgDocument({ parts, transform, background }) {
  const body = transform ? `<g transform="${transform}">${parts.join('')}</g>` : parts.join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">`,
    background ? `<rect width="${CANVAS}" height="${CANVAS}" fill="${background}"/>` : '',
    body,
    '</svg>',
  ].join('');
}

/**
 * Each output names why it is shaped the way it is, because "why is the splash
 * 384px" is the question someone will have in six months.
 */
const OUTPUTS = [
  {
    file: 'icon.png',
    size: 1024,
    /**
     * The store/legacy icon. Full bleed and fully opaque: every platform that
     * uses this file applies its own corner mask, so shipping our own rounded
     * corners would round them twice, and iOS rejects an icon with alpha.
     */
    svg: svgDocument({ parts: [MONOGRAM, ACCENT], background: BRAND_BLUE }),
    opaque: true,
  },
  {
    file: 'android-icon-foreground.png',
    size: 512,
    /**
     * Adaptive foreground: letters only on transparent, since the blue comes
     * from the background layer underneath. Scaled into the 66dp safe circle,
     * which is why the mark looks small in this file and correct on a phone.
     */
    svg: svgDocument({ parts: [MONOGRAM], transform: fitDiagonal(MONOGRAM_BOX, ADAPTIVE_SAFE_FRACTION) }),
  },
  {
    file: 'android-icon-background.png',
    size: 512,
    /** Flat brand blue — the same value `app.config.ts` sets as `backgroundColor`. */
    svg: svgDocument({ parts: [], background: BRAND_BLUE }),
    opaque: true,
  },
  {
    file: 'android-icon-monochrome.png',
    size: 432,
    /**
     * Themed icons (Android 13+): the launcher recolours this layer and keeps
     * only its alpha, so it is the foreground's silhouette. The accent disc is
     * left out deliberately — flattened to one colour it would read as a blob
     * next to the letters rather than as a badge.
     */
    svg: svgDocument({ parts: [MONOGRAM], transform: fitDiagonal(MONOGRAM_BOX, ADAPTIVE_SAFE_FRACTION) }),
  },
  {
    file: 'splash-icon.png',
    size: 384,
    /**
     * `expo-splash-screen` draws this at `imageWidth: 96` dp, so 384px is 4×
     * for an xxxhdpi screen — exporting the 1024px icon here would ship ~7×
     * the pixels for no visible gain. No tile: the splash background is
     * already `#0B5FA5`, so a blue tile on blue is either invisible or, worse,
     * a faint seam where its antialiased edge meets the background.
     */
    svg: svgDocument({ parts: [MONOGRAM, ACCENT], transform: fitExtent(MARK_BOX, 0.94) }),
  },
  {
    file: 'favicon.png',
    size: 48,
    /** Phase 2's web output. Keeps the rounded tile — a browser tab applies no mask. */
    svg: svgDocument({ parts: [TILE, MONOGRAM, ACCENT] }),
  },
  {
    file: 'brand-mark.png',
    size: 256,
    /**
     * The in-app mark rendered by `src/components/brand-header.tsx`, at 44–72dp.
     * 256px covers the largest of those at 4× density. Rounded tile and
     * transparent corners so it sits on a light *or* dark screen background
     * without a visible box — the one asset here that is not an OS icon.
     */
    svg: svgDocument({ parts: [TILE, MONOGRAM, ACCENT] }),
  },
];

await mkdir(OUT_DIR, { recursive: true });

for (const { file, size, svg, opaque } of OUTPUTS) {
  let pipeline = sharp(Buffer.from(svg), { density: RENDER_DENSITY }).resize(size, size, {
    kernel: 'lanczos3',
    fit: 'fill',
  });

  if (opaque) pipeline = pipeline.flatten({ background: BRAND_BLUE });

  const png = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(path.join(OUT_DIR, file), png);

  console.log(`${file.padEnd(30)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

console.log(`\nWrote ${OUTPUTS.length} files to ${path.relative(repoRoot, OUT_DIR)}`);
console.log('Icon and splash changes need a new dev-client/EAS build to show on a device.');
