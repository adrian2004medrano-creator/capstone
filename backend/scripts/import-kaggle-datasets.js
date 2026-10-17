// Downloads public Kaggle datasets (no Kaggle account needed), maps their labels to the app's
// behavior categories, and writes capped CSVs to backend/data/datasets. The server then trains on them automatically.
// Usage: npm run import:kaggle [-- --refresh]   (--refresh ignores previously downloaded archives)
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { parseCsv, seededShuffle } = require('../ai/utils');
const { DATASET_DIR } = require('../ai/datasets');

const MAX_TEXT_LENGTH = 400;
const MIN_TEXT_LENGTH = 12;
const CACHE_DIR = path.join(os.tmpdir(), 'kalakbay-kaggle');
const refresh = process.argv.includes('--refresh');

const EMOTION_LABELS = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise'];

const SOURCES = [
  {
    ref: 'suchintikasarkar/sentiment-analysis-for-mental-health',
    output: 'kaggle-mental-health-statements.csv',
    files: /Combined Data\.csv$/i,
    rows: (record) => ({
      text: record.statement,
      category: {
        normal: 'neutral', depression: 'emotional_distress', anxiety: 'emotional_distress', stress: 'emotional_distress',
        bipolar: 'emotional_distress', 'personality disorder': 'emotional_distress', suicidal: 'self_harm'
      }[String(record.status).toLowerCase()]
    }),
    caps: { neutral: 3500, emotional_distress: 4500, self_harm: 3500 }
  },
  {
    ref: 'payaldhokane/stress-analysis-in-social-media-dataset',
    output: 'kaggle-dreaddit-subreddits.csv',
    files: /dreaddit-(train|test)\.csv$/i,
    rows: (record) => ({
      text: record.text,
      category: {
        ptsd: 'abuse_trauma', domesticviolence: 'abuse_trauma', survivorsofabuse: 'abuse_trauma',
        anxiety: 'emotional_distress', homeless: 'family_instability', almosthomeless: 'family_instability'
      }[record.subreddit]
    }),
    caps: { abuse_trauma: 2000, emotional_distress: 700, family_instability: 400 }
  },
  {
    ref: 'thedevastator/c-ssrs-labeled-suicidality-in-500-anonymized-red',
    output: 'kaggle-cssrs-suicidality.csv',
    files: /500_anonymized.*\.csv$/i,
    rows: (record) => ({
      text: String(record.post).replace(/^\[['"]|['"]\]$/g, ''),
      category: { ideation: 'self_harm', behavior: 'self_harm', attempt: 'self_harm', indicator: 'emotional_distress', supportive: 'neutral' }[String(record.label).toLowerCase()]
    }),
    caps: {}
  },
  {
    ref: 'parulpandey/emotion-dataset',
    output: 'kaggle-emotions.csv',
    files: /(training|validation|test)\.csv$/i,
    rows: (record) => ({
      text: record.text,
      category: { sadness: 'emotional_distress', fear: 'emotional_distress', anger: 'anger_irritability', joy: 'positive', love: 'positive', surprise: 'neutral' }[EMOTION_LABELS[Number(record.label)]]
    }),
    caps: { emotional_distress: 3000, positive: 2500, anger_irritability: 2500, neutral: 800 }
  },
  {
    ref: 'andrewmvd/cyberbullying-classification',
    output: 'kaggle-cyberbullying.csv',
    files: /cyberbullying_tweets\.csv$/i,
    rows: (record) => ({
      text: record.tweet_text,
      category: record.cyberbullying_type === 'not_cyberbullying' ? 'neutral' : 'violence'
    }),
    caps: { violence: 3000, neutral: 2500 }
  }
];

const clean = (value) => {
  const text = String(value ?? '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/&amp;|&gt;|&lt;|&#x200B;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const cut = text.slice(0, MAX_TEXT_LENGTH);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_TEXT_LENGTH - 40));
};

const csvField = (value) => `"${value.replace(/"/g, '""')}"`;

const download = async (ref) => {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const archive = path.join(CACHE_DIR, `${ref.replace('/', '__')}.zip`);
  if (!refresh && fs.existsSync(archive)) return fs.readFileSync(archive);

  const response = await fetch(`https://www.kaggle.com/api/v1/datasets/download/${ref}`);
  if (!response.ok) throw new Error(`Kaggle returned ${response.status} for ${ref}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archive, buffer);
  return buffer;
};

const metadata = async (ref) => {
  try {
    const response = await fetch(`https://www.kaggle.com/api/v1/datasets/view/${ref}`);
    const data = await response.json();
    return { title: data.titleNullable ?? data.title ?? ref, license: data.licenseNameNullable ?? data.licenseName ?? 'unknown' };
  } catch {
    return { title: ref, license: 'unknown' };
  }
};

(async () => {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
  const summary = [];
  const attributions = [];

  for (const source of SOURCES) {
    process.stdout.write(`${source.ref} ... `);
    const zip = await JSZip.loadAsync(await download(source.ref));
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && source.files.test(entry.name));
    if (!entries.length) throw new Error(`No matching CSV in ${source.ref}`);

    const mapped = [];
    for (const entry of entries) {
      const { records } = parseCsv(await entry.async('string'));
      records.forEach((record) => {
        const { text, category } = source.rows(record);
        const cleaned = clean(text);
        if (category && cleaned.length >= MIN_TEXT_LENGTH) mapped.push({ text: cleaned, category });
      });
    }

    const used = {};
    const rows = seededShuffle(mapped, 17).filter(({ category }) => {
      used[category] = (used[category] || 0) + 1;
      return !source.caps[category] || used[category] <= source.caps[category];
    });
    const counts = rows.reduce((total, { category }) => ({ ...total, [category]: (total[category] || 0) + 1 }), {});

    fs.writeFileSync(
      path.join(DATASET_DIR, source.output),
      `text,category\n${rows.map(({ text, category }) => `${csvField(text)},${category}`).join('\n')}\n`
    );
    const info = await metadata(source.ref);
    attributions.push({ ref: source.ref, ...info, url: `https://www.kaggle.com/datasets/${source.ref}`, output: source.output, rows: rows.length, categories: counts });
    summary.push({ file: source.output, rows: rows.length, ...counts });
    console.log(`${rows.length} rows -> ${source.output}`);
  }

  fs.writeFileSync(path.join(DATASET_DIR, 'kaggle-sources.json'), `${JSON.stringify(attributions, null, 2)}\n`);
  console.table(summary);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
