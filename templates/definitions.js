// Default garment templates. Each is rendered as a flat-lay SVG at startup (see generateBaseTemplates.js)
// so the app ships with zero external image downloads. Users can add their own blank photos via
// the "Templates" tab, which get the same printArea treatment.
//
// printArea is the region (in canvas px, on a 2000x2000 canvas) where the design gets composited.

const CANVAS = 2000;

const GARMENT_COLORS = {
  black: { fill: '#1a1a1a', shadow: '#000000', label: 'Black' },
  white: { fill: '#f5f5f0', shadow: '#d8d8d2', label: 'White' },
  gray: { fill: '#9b9b93', shadow: '#7d7d76', label: 'Heather Gray' }
};

const GARMENTS = {
  tshirt: {
    name: 'T-Shirt',
    colors: ['black', 'white', 'gray'],
    printArea: { x: 780, y: 630, w: 440, h: 440 }
  },
  hoodie: {
    name: 'Hoodie',
    colors: ['black', 'white'],
    printArea: { x: 790, y: 800, w: 420, h: 420 }
  },
  sweatshirt: {
    name: 'Sweatshirt',
    colors: ['black', 'white'],
    printArea: { x: 790, y: 720, w: 420, h: 420 }
  }
};

function buildDefaultTemplateList() {
  const list = [];
  for (const [garmentId, garment] of Object.entries(GARMENTS)) {
    for (const colorId of garment.colors) {
      const color = GARMENT_COLORS[colorId];
      list.push({
        id: `${garmentId}-${colorId}`,
        garment: garmentId,
        garmentName: garment.name,
        color: colorId,
        colorName: color.label,
        printArea: garment.printArea,
        source: 'default',
        baseImage: `/templates-static/${garmentId}-${colorId}.png`
      });
    }
  }
  return list;
}

module.exports = { CANVAS, GARMENT_COLORS, GARMENTS, buildDefaultTemplateList };
