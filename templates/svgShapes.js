// Flat-lay garment silhouettes as hand-built SVG, drawn programmatically (no external assets/licensing).
// Style: clean, minimal, soft studio shadow — matches a "premium flat mockup" aesthetic used across POD stores.

function studioBackdrop() {
  return `
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#232326"/>
        <stop offset="100%" stop-color="#141416"/>
      </radialGradient>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="28" stdDeviation="26" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="2000" height="2000" fill="url(#bg)"/>
  `;
}

function tshirt(fill, shadow) {
  // Crew-neck short-sleeve tee, flat lay, centered on a 2000x2000 canvas.
  const body = `
    M 630 380
    C 630 340, 690 300, 760 290
    L 900 260
    C 940 330, 1060 330, 1100 260
    L 1240 290
    C 1310 300, 1370 340, 1370 380
    L 1460 560
    C 1475 592, 1465 630, 1430 645
    L 1310 700
    L 1290 470
    L 1290 1650
    C 1290 1680, 1265 1700, 1235 1700
    L 765 1700
    C 735 1700, 710 1680, 710 1650
    L 710 470
    L 690 700
    L 570 645
    C 535 630, 525 592, 540 560
    Z
  `;
  const collar = `M 900 260 C 930 300, 1070 300, 1100 260 C 1080 250, 1040 244, 1000 244 C 960 244, 920 250, 900 260 Z`;
  return `
    <g filter="url(#softShadow)">
      <path d="${body}" fill="${fill}" stroke="${shadow}" stroke-width="4"/>
      <path d="${collar}" fill="${shadow}" opacity="0.55"/>
      <path d="M 710 470 L 690 700" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
      <path d="M 1290 470 L 1310 700" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
    </g>
  `;
}

function hoodie(fill, shadow) {
  const body = `
    M 640 470
    C 640 400, 720 340, 810 320
    L 860 305
    C 880 400, 1120 400, 1140 305
    L 1190 320
    C 1280 340, 1360 400, 1360 470
    L 1460 640
    C 1478 672, 1466 712, 1428 728
    L 1300 782
    L 1280 540
    L 1280 1680
    C 1280 1712, 1252 1734, 1220 1734
    L 780 1734
    C 748 1734, 720 1712, 720 1680
    L 720 540
    L 700 782
    L 572 728
    C 534 712, 522 672, 540 640
    Z
  `;
  const hood = `
    M 830 330
    C 840 250, 920 200, 1000 200
    C 1080 200, 1160 250, 1170 330
    C 1170 380, 1120 410, 1000 415
    C 880 410, 830 380, 830 330
    Z
  `;
  const pocket = `M 850 1150 L 1150 1150 C 1150 1260, 1080 1320, 1000 1320 C 920 1320, 850 1260, 850 1150 Z`;
  const stringL = `M 940 340 C 935 420, 930 470, 925 520`;
  const stringR = `M 1060 340 C 1065 420, 1070 470, 1075 520`;
  return `
    <g filter="url(#softShadow)">
      <path d="${body}" fill="${fill}" stroke="${shadow}" stroke-width="4"/>
      <path d="${hood}" fill="${fill}" stroke="${shadow}" stroke-width="4"/>
      <path d="${pocket}" fill="none" stroke="${shadow}" stroke-width="4" opacity="0.7"/>
      <path d="${stringL}" fill="none" stroke="${shadow}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
      <path d="${stringR}" fill="none" stroke="${shadow}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
      <circle cx="925" cy="525" r="8" fill="${shadow}"/>
      <circle cx="1075" cy="525" r="8" fill="${shadow}"/>
      <path d="M 720 540 L 700 782" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
      <path d="M 1280 540 L 1300 782" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
    </g>
  `;
}

function sweatshirt(fill, shadow) {
  const body = `
    M 650 400
    C 650 350, 720 305, 800 288
    L 900 262
    C 935 320, 1065 320, 1100 262
    L 1200 288
    C 1280 305, 1350 350, 1350 400
    L 1450 580
    C 1467 612, 1456 652, 1418 668
    L 1300 718
    L 1282 490
    L 1282 1660
    C 1282 1692, 1256 1714, 1224 1714
    L 776 1714
    C 744 1714, 718 1692, 718 1660
    L 718 490
    L 700 718
    L 582 668
    C 544 652, 533 612, 550 580
    Z
  `;
  const collar = `M 900 262 C 930 305, 1070 305, 1100 262 C 1078 250, 1040 244, 1000 244 C 960 244, 922 250, 900 262 Z`;
  const ribbing = `M 718 1660 L 718 1580 L 1282 1580 L 1282 1660`;
  return `
    <g filter="url(#softShadow)">
      <path d="${body}" fill="${fill}" stroke="${shadow}" stroke-width="4"/>
      <path d="${collar}" fill="${shadow}" opacity="0.5"/>
      <path d="${ribbing}" fill="none" stroke="${shadow}" stroke-width="3" opacity="0.35"/>
      <path d="M 718 490 L 700 718" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
      <path d="M 1282 490 L 1300 718" stroke="${shadow}" stroke-width="3" fill="none" opacity="0.4"/>
    </g>
  `;
}

const SHAPES = { tshirt, hoodie, sweatshirt };

function renderGarmentSvg(garmentId, fill, shadow) {
  const shapeFn = SHAPES[garmentId];
  if (!shapeFn) throw new Error(`Unknown garment: ${garmentId}`);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="0 0 2000 2000">
      ${studioBackdrop()}
      ${shapeFn(fill, shadow)}
    </svg>
  `;
}

module.exports = { renderGarmentSvg };
