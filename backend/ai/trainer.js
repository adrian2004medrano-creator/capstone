const fs = require('fs');
const path = require('path');
const { trainModel: trainRiskModel } = require('./riskModel');
const { trainTextModel } = require('./textModel');
const { DATASET_DIR, loadDatasets, datasetSignature } = require('./datasets');

// Bump when features or training logic change so saved models are rebuilt automatically.
const SCHEMA_VERSION = 'ai-v4';
const RISK_MODEL_FILE = path.join(DATASET_DIR, '..', 'risk-model.json');
const TEXT_MODEL_FILE = path.join(DATASET_DIR, '..', 'text-model.json');
const POLL_INTERVAL_MS = 15000;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const writeJson = (file, value) => {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value));
  fs.renameSync(`${file}.tmp`, file);
};

// Trains both models from the dataset folder at startup and whenever a dataset file changes.
const createTrainer = ({ onRetrained = async () => {}, logger = console } = {}) => {
  let risk = null;
  let text = null;
  let signature = null;
  let queued = false;
  const state = { training: false, error: null, datasets: [] };

  const trainNow = async ({ force = false } = {}) => {
    if (state.training) {
      queued = true;
      return false;
    }
    state.training = true;
    state.error = null;
    let retrained = false;

    try {
      signature = datasetSignature();
      const data = loadDatasets();
      state.datasets = data.files;
      const fingerprint = `${SCHEMA_VERSION}:${data.fingerprint}`;
      const savedRisk = readJson(RISK_MODEL_FILE);
      const savedText = readJson(TEXT_MODEL_FILE);

      if (!force && savedRisk?.metadata?.fingerprint === fingerprint && savedText?.metadata?.fingerprint === fingerprint) {
        risk = savedRisk;
        text = savedText;
      } else {
        const errors = [];
        const datasetNames = (type) => data.files.filter((file) => file.type === type).map((file) => file.name);

        try {
          if (data.structured.length < 30) throw new Error('Add a structured dataset with at least 30 rows to train the risk model.');
          const model = trainRiskModel(data.structured);
          model.metadata = { ...model.metadata, fingerprint, datasets: datasetNames('structured') };
          writeJson(RISK_MODEL_FILE, model);
          risk = model;
        } catch (error) {
          errors.push(error.message);
          risk = risk || savedRisk;
        }

        try {
          if (data.text.length < 20) throw new Error('Add a text dataset with at least 20 labeled rows to train the text model.');
          const model = trainTextModel(data.text);
          model.metadata = { ...model.metadata, fingerprint, datasets: datasetNames('text') };
          writeJson(TEXT_MODEL_FILE, model);
          text = model;
        } catch (error) {
          errors.push(error.message);
          text = text || savedText;
        }

        retrained = errors.length < 2;
        state.error = errors.length ? errors.join(' ') : null;
        if (retrained) logger.log(`AI models trained automatically (risk accuracy ${risk?.metadata?.test_accuracy}, text accuracy ${text?.metadata?.test_accuracy}).`);
        if (errors.length) logger.warn(`AI training problem: ${state.error}`);
      }
    } catch (error) {
      state.error = `Training failed: ${error.message}`;
      logger.error(state.error);
    } finally {
      state.training = false;
    }

    if (retrained) await onRetrained().catch((error) => logger.error('Post-training refresh failed:', error.message));
    if (queued) {
      queued = false;
      return trainNow();
    }
    return retrained;
  };

  const start = async () => {
    await trainNow();
    setInterval(() => {
      if (!state.training && datasetSignature() !== signature) trainNow();
    }, POLL_INTERVAL_MS).unref();
  };

  const status = () => ({
    ready: Boolean(risk && text),
    training: state.training,
    error: state.error,
    auto_training: true,
    datasets: state.datasets,
    risk: risk && {
      trained_at: risk.metadata.trained_at,
      samples: risk.metadata.samples,
      test_accuracy: risk.metadata.test_accuracy,
      class_distribution: risk.metadata.class_distribution
    },
    text: text && {
      trained_at: text.metadata.trained_at,
      samples: text.metadata.samples,
      vocabulary: text.metadata.vocabulary,
      test_accuracy: text.metadata.test_accuracy,
      macro_f1: text.metadata.macro_f1,
      risk_recall: text.metadata.risk_recall,
      false_alarm_rate: text.metadata.false_alarm_rate,
      classes: text.classes
    }
  });

  return { start, trainNow, status, models: () => ({ risk, text }) };
};

module.exports = { createTrainer };
