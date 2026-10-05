import { db } from './db.js';

export const TEMPLATES = {
  logo: {
    name: 'Logo',
    hint: 'Marks, wordmarks and brand symbols',
    checklist: ['Write the brief', 'Collect keywords', 'Sketch rough ideas', 'Pick three directions', 'Test in black and white', 'Test at small sizes', 'Finalize and export'],
    zones: ['References', 'Keywords', 'Sketches'],
    stages: ['Rough sketches', 'Directions', 'Refinement', 'Final'],
    features: ['mockups'],
    bg: 'grid',
    tips: ['Sketch more ideas than feels necessary. The tenth one is often better than the first.', 'A good logo still works in one color and at 16 pixels.'],
  },
  illustration: {
    name: 'Illustration',
    hint: 'Drawings, characters and scenes',
    checklist: ['Idea', 'Rough sketch', 'Line art', 'Flat colors', 'Shading', 'Finishing touches'],
    zones: ['Poses', 'Light and mood', 'Color references'],
    stages: ['Idea', 'Rough sketch', 'Line art', 'Flat colors', 'Shading', 'Finish'],
    features: [],
    bg: 'kraft',
    tips: ['Squint at the drawing to check the big shapes and values.', 'Flip the canvas now and then. Mistakes jump out.'],
  },
  ui: {
    name: 'UI / web',
    hint: 'Apps, websites and screens',
    checklist: ['Define the goal and the user', 'List the screens', 'Wireframes', 'Visual design', 'Check contrast and type sizes', 'Collect feedback'],
    zones: ['Screen references', 'Type', 'Components'],
    stages: ['Wireframe', 'Low fidelity', 'High fidelity', 'Final'],
    features: [],
    bg: 'dots',
    tips: ['Body text reads best at 16px or larger.', 'Check every text color against its background in the palette tab.'],
  },
  poster: {
    name: 'Poster / editorial',
    hint: 'Posters, flyers and layouts',
    checklist: ['Gather the content', 'Rank the information', 'Sketch layouts', 'Set the typography', 'Final polish'],
    zones: ['Layouts', 'Type', 'Color'],
    stages: ['Thumbnails', 'Layout', 'Typography', 'Final'],
    features: [],
    bg: 'plain',
    tips: ['Decide what people should read first, second and third before you start.'],
  },
  free: {
    name: 'Free',
    hint: 'A blank project, no steps',
    checklist: [],
    zones: [],
    stages: ['Start', 'Middle', 'Final'],
    features: [],
    bg: 'plain',
    tips: [],
  },
};

export async function getTemplates() {
  const custom = await db.all('templates');
  const out = { ...TEMPLATES };
  custom.forEach((c) => { out[c.id] = c; });
  return out;
}

export const BOARD_BGS = [['plain', 'Plain'], ['grid', 'Grid paper'], ['dots', 'Dot grid'], ['cork', 'Cork board'], ['kraft', 'Kraft paper']];

export const LIBRARY_CATEGORIES = ['Typography', 'Logos', 'Color', 'Illustration', 'Layout', 'UI', 'Photography', 'Other'];

export const PROMPT_SUBJECTS = [
  'a cat napping in a sunbeam', 'your favorite mug', 'a rainy window', 'a tiny house on a hill', 'a hand holding something precious',
  'a houseplant that has seen things', 'your shoes by the door', 'a fox wearing a scarf', 'a crowded bookshelf', 'a bowl of fruit',
  'a street lamp at night', 'a sleepy dragon', 'an old bicycle', 'a cafe table for two', 'an old key', 'a jellyfish',
  'a robot gardener', 'someone waiting for a bus', 'a cloud with feelings', 'a lighthouse', 'a slice of cake', 'your desk right now',
  'a snail on an adventure', 'a pair of glasses', 'a mushroom village', 'a whale in the sky', 'a vintage camera', 'a sleeping dog',
  'a market stall', 'a teapot with a personality', 'a staircase going somewhere strange', 'a pigeon with big plans',
];
export const PROMPT_CONSTRAINTS = [
  'use only three colors', 'no outlines, only shapes', 'draw it from above', 'use one continuous line',
  'use your other hand for the first minute', 'only black and one accent color', 'keep it smaller than your palm',
  'exaggerate the proportions', 'use only straight lines', 'add a pattern somewhere', 'put it in a different season',
  'light it from below', 'draw it as if it were a logo', 'make it cuter than it should be', 'draw it three times, each one simpler',
  'no erasing allowed',
];
export const PROMPT_MINUTES = [10, 15, 20, 30];

// ---------- palette ideas, sorted by purpose ----------
export const PURPOSES = [
  ['illustration', 'Illustration', 'Mix light, mid and dark values, and keep one bright accent for what matters most.'],
  ['logo', 'Logo', 'Two or three colors is plenty. Make sure one is dark, so the logo works in a single color.'],
  ['ui', 'UI / web', 'You need a background, a text color and one main action color. Check text contrast first.'],
  ['poster', 'Poster', 'Go high contrast. One loud color pulls the eye to the most important line.'],
];
export const PURPOSE_OF_TYPE = { logo: 'logo', illustration: 'illustration', ui: 'ui', poster: 'poster' };

export const PALETTE_IDEAS = [
  { name: 'Sunday Picnic', purpose: 'illustration', colors: ['#0D3B66', '#F95738', '#EE964B', '#F4D35E', '#FAF0CA'] },
  { name: 'Forest Storybook', purpose: 'illustration', colors: ['#2F4F3E', '#6B8F71', '#A0613F', '#C9B79C', '#E8D9B5'] },
  { name: 'Dreamy Pastel', purpose: 'illustration', colors: ['#C9B8E8', '#F7C6D9', '#BFE0F5', '#B5EAD7', '#FFF1A6'] },
  { name: 'Night Market', purpose: 'illustration', colors: ['#1E2350', '#4450B8', '#F07C66', '#FFD166', '#F4F1DE'] },
  { name: 'Autumn Tea', purpose: 'illustration', colors: ['#5A3B2E', '#A0613F', '#D9772B', '#E8B04B', '#EFE6D8'] },
  { name: 'Ocean Nap', purpose: 'illustration', colors: ['#1F6F78', '#3BA3A6', '#A3D9D0', '#F2E8CF', '#E07A5F'] },
  { name: 'Classic Ink', purpose: 'logo', colors: ['#121212', '#D7263D', '#FAF8F5'] },
  { name: 'Cafe Corner', purpose: 'logo', colors: ['#3E2723', '#C68E5A', '#E3CDB3'] },
  { name: 'Fresh Mint', purpose: 'logo', colors: ['#0F4C3A', '#8FD3B0', '#FFFFFF'] },
  { name: 'Bold Indigo', purpose: 'logo', colors: ['#2B2724', '#4450B8', '#FFF1A6'] },
  { name: 'Sunny Shop', purpose: 'logo', colors: ['#1A1A1A', '#F6C700', '#FFFFFF'] },
  { name: 'Berry Badge', purpose: 'logo', colors: ['#6E1E4E', '#F4A6B8', '#FFF8F2'] },
  { name: 'Calm Workspace', purpose: 'ui', colors: ['#2B2724', '#4450B8', '#FFF1A6', '#FFFFFF', '#FAF8F5'] },
  { name: 'Night Mode', purpose: 'ui', colors: ['#1C1B22', '#25242C', '#8B96F0', '#F5E27A', '#ECE9E4'] },
  { name: 'Clinic Clean', purpose: 'ui', colors: ['#1B2B3A', '#1F6F78', '#E07A5F', '#FFFFFF', '#F5F8FA'] },
  { name: 'Soft Commerce', purpose: 'ui', colors: ['#3A2E2A', '#B4532E', '#F2C14E', '#FFFFFF', '#FFF8F2'] },
  { name: 'Fresh Start', purpose: 'ui', colors: ['#1E2D24', '#2E7D4F', '#F4A261', '#FFFFFF', '#F4FAF6'] },
  { name: 'Loud Concert', purpose: 'poster', colors: ['#111111', '#FF3B30', '#FFE600', '#FFFFFF'] },
  { name: 'Swiss Classic', purpose: 'poster', colors: ['#1A1A1A', '#E63312', '#F2F0E9'] },
  { name: 'Retro Fair', purpose: 'poster', colors: ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'] },
  { name: 'Riso Print', purpose: 'poster', colors: ['#0078BF', '#FF48B0', '#FFE800', '#F7F3EA'] },
  { name: 'Gallery Night', purpose: 'poster', colors: ['#0B132B', '#5BC0BE', '#FFD23F', '#F8F9FA'] },
];
