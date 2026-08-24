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
    printArea: { x: 780, y: 630, w: 440, h: 440 },
    photoPrintArea: { x: 760, y: 640, w: 480, h: 480 }
  },
  hoodie: {
    name: 'Hoodie',
    colors: ['black', 'white'],
    printArea: { x: 790, y: 800, w: 420, h: 420 },
    photoPrintArea: { x: 760, y: 980, w: 480, h: 420 }
  },
  sweatshirt: {
    name: 'Sweatshirt',
    colors: ['black', 'white'],
    printArea: { x: 790, y: 720, w: 420, h: 420 },
    photoPrintArea: { x: 750, y: 700, w: 500, h: 500 }
  }
};

// On-model templates (person wearing the garment) — each generated via Gemini with a
// standardized straight-on, mid-thigh-up framing (see templates/generateModelTemplates.js),
// so a single printArea per garment covers the whole set reasonably well.
const MODEL_TEMPLATES = [
  { id: 'tshirt-model-male-black', garmentName: 'T-Shirt (Model)', colorName: 'Black — Male', printArea: { x: 640, y: 680, w: 720, h: 440 } },
  { id: 'tshirt-model-male-white', garmentName: 'T-Shirt (Model)', colorName: 'White — Male', printArea: { x: 640, y: 680, w: 720, h: 440 } },
  { id: 'tshirt-model-female-black', garmentName: 'T-Shirt (Model)', colorName: 'Black — Female', printArea: { x: 640, y: 680, w: 720, h: 440 } },
  { id: 'tshirt-model-female-white', garmentName: 'T-Shirt (Model)', colorName: 'White — Female', printArea: { x: 640, y: 680, w: 720, h: 440 } },
  { id: 'hoodie-model-male-black', garmentName: 'Hoodie (Model)', colorName: 'Black — Male', printArea: { x: 680, y: 780, w: 640, h: 420 } },
  { id: 'sweatshirt-model-female-white', garmentName: 'Sweatshirt (Model)', colorName: 'White — Female', printArea: { x: 640, y: 750, w: 720, h: 440 } }
];

// Model Wardrobe: a reusable roster of model identities (see templates/generateModelVariants.js)
// — each generated once, then edited (not regenerated) into every garment x color combo, so the
// same person wears every variant. TODO (noted for later): more models, and reusing these same
// identities for background swaps, is a natural extension of this same approach.
const MODEL_ROSTER = [
  { id: 'male-1', label: 'Model 1', gender: 'Male' },
  { id: 'male-2', label: 'Model 2', gender: 'Male' },
  { id: 'male-3', label: 'Model 3', gender: 'Male' },
  { id: 'female-1', label: 'Model 4', gender: 'Female' },
  { id: 'female-2', label: 'Model 5', gender: 'Female' },
  { id: 'female-3', label: 'Model 6', gender: 'Female' }
];

const WARDROBE_GARMENTS = {
  tshirt: 'T-Shirt',
  hoodie: 'Hoodie',
  sweatshirt: 'Sweatshirt',
  jumper: 'Jumper'
};

const WARDROBE_COLORS = {
  black: 'Black',
  white: 'White',
  'heather-gray': 'Heather Gray',
  navy: 'Navy'
};

// Same print-area box for every garment on a given model — all generated with identical
// straight-on, mid-thigh-up framing, so one chest-centered box works across the set (same
// approach as MODEL_TEMPLATES above).
const WARDROBE_PRINT_AREA = { x: 640, y: 680, w: 720, h: 440 };

function buildModelWardrobeList() {
  const list = [];
  for (const model of MODEL_ROSTER) {
    for (const garmentId of Object.keys(WARDROBE_GARMENTS)) {
      for (const colorId of Object.keys(WARDROBE_COLORS)) {
        list.push({
          id: `wardrobe-${model.id}-${garmentId}-${colorId}`,
          garment: garmentId,
          garmentName: WARDROBE_GARMENTS[garmentId],
          color: colorId,
          colorName: `${WARDROBE_COLORS[colorId]} — ${model.label}`,
          printArea: WARDROBE_PRINT_AREA,
          source: 'default',
          style: 'photo',
          baseImage: `/templates-model-v2/${model.id}-${garmentId}-${colorId}.jpg`,
          modelId: model.id,
          modelLabel: model.label,
          modelGender: model.gender
        });
      }
    }
  }
  return list;
}

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
        style: 'flat',
        baseImage: `/templates-static/${garmentId}-${colorId}.png`
      });

      if (garment.photoPrintArea) {
        list.push({
          id: `${garmentId}-${colorId}-photo`,
          garment: garmentId,
          garmentName: garment.name,
          color: colorId,
          colorName: color.label,
          printArea: garment.photoPrintArea,
          source: 'default',
          style: 'photo',
          baseImage: `/templates-photo/${garmentId}-${colorId}.jpg`
        });
      }
    }
  }

  for (const tpl of MODEL_TEMPLATES) {
    const garmentCategory = tpl.id.startsWith('hoodie') ? 'hoodie'
      : tpl.id.startsWith('sweatshirt') ? 'sweatshirt'
      : 'tshirt';
    list.push({
      id: tpl.id,
      garment: garmentCategory,
      garmentName: tpl.garmentName,
      color: 'model',
      colorName: tpl.colorName,
      printArea: tpl.printArea,
      source: 'default',
      style: 'photo',
      baseImage: `/templates-model/${tpl.id}.jpg`
    });
  }

  list.push(...buildModelWardrobeList());

  return list;
}

module.exports = {
  CANVAS,
  GARMENT_COLORS,
  GARMENTS,
  MODEL_TEMPLATES,
  MODEL_ROSTER,
  WARDROBE_GARMENTS,
  WARDROBE_COLORS,
  buildDefaultTemplateList
};
