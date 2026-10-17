const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FEATURES, OPTIONAL_FEATURES, CLASSES } = require('./riskModel');
const { parseCsv } = require('./utils');
const { normalizeLabel } = require('./categories');

const DATASET_DIR = path.join(__dirname, '..', 'data', 'datasets');
const MAX_DATASET_BYTES = 25 * 1024 * 1024;
const TEXT_COLUMNS = ['text', 'statement', 'sentence', 'description', 'post', 'content', 'comment', 'message', 'note', 'observation', 'narrative'];
const LABEL_COLUMNS = ['category', 'label', 'status', 'class', 'target', 'condition'];
const REQUIRED_FEATURES = FEATURES.filter((name) => !OPTIONAL_FEATURES.includes(name));

class DatasetError extends Error {}

fs.mkdirSync(DATASET_DIR, { recursive: true });

// Structured datasets hold observation features + risk_level; text datasets hold a text column + a label column.
const inspectDataset = (content) => {
  const { columns, records } = parseCsv(content);

  if (columns.includes('risk_level') && REQUIRED_FEATURES.every((name) => columns.includes(name))) {
    const samples = [];
    records.forEach((record) => {
      const label = CLASSES.indexOf(record.risk_level.toLowerCase());
      const features = {};
      let valid = label !== -1;
      FEATURES.forEach((name) => {
        const raw = record[name];
        features[name] = raw === undefined || raw === '' ? (OPTIONAL_FEATURES.includes(name) ? 0 : NaN) : Number(raw);
        if (!Number.isFinite(features[name])) valid = false;
      });
      if (valid) samples.push({ features, label });
    });
    return { type: 'structured', samples, skipped: records.length - samples.length };
  }

  const textColumn = TEXT_COLUMNS.find((name) => columns.includes(name));
  const labelColumn = LABEL_COLUMNS.find((name) => name !== textColumn && columns.includes(name));
  if (textColumn && labelColumn) {
    const samples = [];
    records.forEach((record) => {
      const label = normalizeLabel(record[labelColumn]);
      if (record[textColumn] && label) samples.push({ text: record[textColumn], label });
    });
    return { type: 'text', samples, skipped: records.length - samples.length };
  }

  return {
    type: null,
    samples: [],
    skipped: records.length,
    error: `Unrecognized columns. Use a structured file (${REQUIRED_FEATURES.join(', ')}, risk_level) or a text file with a text column (${TEXT_COLUMNS.slice(0, 4).join('/')}) and a label column (${LABEL_COLUMNS.slice(0, 3).join('/')}).`
  };
};

const datasetFiles = () => fs.readdirSync(DATASET_DIR).filter((name) => name.toLowerCase().endsWith('.csv')).sort();

// Cheap change detector used for automatic retraining.
const datasetSignature = () => datasetFiles().map((name) => {
  const stats = fs.statSync(path.join(DATASET_DIR, name));
  return `${name}:${stats.size}:${Math.round(stats.mtimeMs)}`;
}).join('|');

const loadDatasets = () => {
  const hash = crypto.createHash('sha256');
  const structured = [];
  const text = [];
  const files = datasetFiles().map((name) => {
    const filePath = path.join(DATASET_DIR, name);
    const content = fs.readFileSync(filePath, 'utf8');
    hash.update(`${name}\0${content}\0`);
    const stats = fs.statSync(filePath);
    const inspected = inspectDataset(content);
    if (inspected.type === 'structured') structured.push(...inspected.samples);
    if (inspected.type === 'text') text.push(...inspected.samples);
    return {
      name,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      type: inspected.type,
      rows: inspected.samples.length,
      skipped: inspected.skipped,
      error: inspected.error || null
    };
  });
  return { files, structured, text, fingerprint: hash.digest('hex') };
};

const cleanName = (name) => {
  const base = path.basename(String(name || '')).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return base.endsWith('.csv') ? base : `${base}.csv`;
};

const saveDataset = (originalName, buffer) => {
  if (buffer.length > MAX_DATASET_BYTES) throw new DatasetError('The dataset must be 25 MB or smaller.');
  let content;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new DatasetError('The dataset must be a UTF-8 CSV file.');
  }
  const inspected = inspectDataset(content);
  if (!inspected.type) throw new DatasetError(inspected.error);
  if (!inspected.samples.length) throw new DatasetError('No usable rows were found in this dataset.');

  const name = cleanName(originalName);
  const temporary = path.join(DATASET_DIR, `${name}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, path.join(DATASET_DIR, name));
  return { name, type: inspected.type, rows: inspected.samples.length, skipped: inspected.skipped };
};

const deleteDataset = (name) => {
  if (!/^[a-z0-9._-]+\.csv$/.test(name)) throw new DatasetError('Invalid dataset name.');
  const filePath = path.join(DATASET_DIR, name);
  if (!fs.existsSync(filePath)) throw new DatasetError('Dataset not found.');
  fs.unlinkSync(filePath);
};

module.exports = { DATASET_DIR, DatasetError, loadDatasets, datasetSignature, saveDataset, deleteDataset };
