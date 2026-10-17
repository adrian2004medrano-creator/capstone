// Generates synthetic seed datasets in backend/data/datasets. Add real labeled CSV files to that folder and the AI retrains automatically.
const fs = require('fs');
const path = require('path');
const { FEATURES } = require('../ai/riskModel');
const { DATASET_DIR } = require('../ai/datasets');
const templates = require('./behavior-text-templates');

const SAMPLES = Number(process.argv[2] || 1500);
let state = 20260101;
const random = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const normal = (deviation = 1) => {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()) * deviation;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const rows = [];
for (let index = 0; index < SAMPLES; index += 1) {
  const roll = random();
  const level = roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2;
  const latent = level === 0 ? random() * 0.33 : level === 1 ? 0.33 + random() * 0.33 : 0.66 + random() * 0.34;

  const row = {
    avg_mood: round(clamp(4.4 - 2.6 * latent + normal(0.5), 1, 5)),
    avg_participation: round(clamp(4.3 - 2.8 * latent + normal(0.55), 1, 5)),
    avg_cooperation: round(clamp(4.3 - 2.4 * latent + normal(0.55), 1, 5)),
    avg_peer: round(clamp(4.0 - 2.2 * latent + normal(0.6), 1, 5)),
    incidents_per_obs: round(clamp(0.05 + 1.6 * latent ** 1.5 + normal(0.25), 0, 5)),
    max_aggression: Math.round(clamp(3.4 * latent + normal(0.6), 0, 4)),
    checklist_load: round(clamp(0.2 + 5 * latent ** 1.3 + normal(0.8), 0, 12)),
    note_risk: round(clamp(0.1 + 3.2 * latent + normal(0.9), 0, 6)),
    // About a third of clients have no case records on file.
    record_flags: random() < 0.35 ? 0 : Math.round(clamp(6 * latent + normal(1.5) - 0.5, 0, 10)),
    mood_trend: round(clamp(-1.2 * (latent - 0.4) + normal(0.5), -3, 3)),
    participation_trend: round(clamp(-1.2 * (latent - 0.4) + normal(0.5), -3, 3)),
    return_count: Math.round(clamp(2.2 * latent + normal(0.9) - 0.3, 0, 10)),
    age: Math.round(7 + random() * 14)
  };

  // Real labels are noisy, so a small share is shifted one level.
  let label = level;
  if (random() < 0.06) label = clamp(level + (random() < 0.5 ? -1 : 1), 0, 2);
  rows.push({ ...row, risk_level: ['low', 'medium', 'high'][label] });
}

fs.mkdirSync(DATASET_DIR, { recursive: true });
const header = [...FEATURES, 'risk_level'];
const structuredPath = path.join(DATASET_DIR, 'behavior-structured.csv');
fs.writeFileSync(structuredPath, `${header.join(',')}\n${rows.map((row) => header.map((name) => row[name]).join(',')).join('\n')}\n`);
console.log(`Wrote ${rows.length} structured rows to ${structuredPath}`);

// Text dataset: behavior and mental-health sentences labeled by concern category.
const subjects = [
  { S: 'The youth', s: 'the youth', p: "the youth's", r: 'themselves' },
  { S: 'The client', s: 'the client', p: "the client's", r: 'themselves' },
  { S: 'The resident', s: 'the resident', p: "the resident's", r: 'themselves' },
  { S: 'The child', s: 'the child', p: "the child's", r: 'themselves' },
  { S: 'He', s: 'he', p: 'his', r: 'himself' },
  { S: 'She', s: 'she', p: 'her', r: 'herself' }
];
const prefixes = ['', '', '', 'Staff reported that ', 'Per the social worker, ', 'It was noted that ', 'During the week, ', 'Case note: '];
const suffixes = ['', '', '', ' yesterday', ' this week', ' last night', ' during recreation', ' in the dormitory', ' at school', ' during the counseling session'];
const pick = (list) => list[Math.floor(random() * list.length)];

const compose = (template) => {
  const subject = pick(subjects);
  const prefix = pick(prefixes);
  let sentence = template
    .replace('{S}', prefix ? subject.s : subject.S)
    .replace(/\{s\}/g, subject.s)
    .replace(/\{p\}/g, subject.p)
    .replace(/\{r\}/g, subject.r);
  sentence = `${prefix}${sentence}${pick(suffixes)}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
};

const targets = { positive: 220, neutral: 420, negated: 260 };
const textRows = new Set();
Object.entries(templates).forEach(([category, { en, tl }]) => {
  const label = category === 'negated' ? 'neutral' : category;
  const target = targets[category] || 160;
  tl.forEach((sentence) => textRows.add(`${JSON.stringify(sentence)},${label}`));
  let attempts = 0;
  let added = 0;
  while (added < target - tl.length && attempts < target * 20) {
    attempts += 1;
    const size = textRows.size;
    textRows.add(`${JSON.stringify(compose(pick(en)))},${label}`);
    if (textRows.size > size) added += 1;
  }
});

const textPath = path.join(DATASET_DIR, 'behavior-text.csv');
fs.writeFileSync(textPath, `text,category\n${[...textRows].join('\n')}\n`);
console.log(`Wrote ${textRows.size} text rows to ${textPath}`);
