const { CATEGORY_BY_KEY, NEUTRAL, POSITIVE } = require('./categories');
const { round, softmax, seededShuffle } = require('./utils');

const MAX_VOCAB = 30000;
const FLAG_THRESHOLD = 0.7;
const MAX_SENTENCES = 4000;
const EPOCHS = 12;
const LEARNING_RATE = 0.3;
const L2 = 1e-6;
const MAX_CLASS_WEIGHT = 6;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'were', 'are', 'be', 'been', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'with', 'for', 'that',
  'this', 'it', 'as', 'by', 'from', 'has', 'have', 'had', 'ang', 'ng', 'sa', 'na', 'ay', 'si', 'ni', 'kay', 'mga', 'nang'
]);
// Words after a negation cue are marked so "no history of drug use" is not read as drug use.
const NEGATIONS = new Set(['no', 'not', 'never', 'without', 'denies', 'denied', 'deny', 'none', 'cannot', 'nor', 'walang', 'hindi', 'wala', 'di']);

// Unigrams plus bigrams, with negation marking.
const featuresOf = (text) => {
  const features = [];
  text.toLowerCase().split(/[.,;:!?()\n]+/).forEach((clause) => {
    let negatedLeft = 0;
    let previous = null;
    (clause.match(/[a-z\u00f1\u00e0-\u00fc0-9']+/g) || []).forEach((token) => {
      if (NEGATIONS.has(token)) {
        negatedLeft = 4;
        previous = null;
        features.push(token);
        return;
      }
      if (STOPWORDS.has(token)) return;
      const word = negatedLeft > 0 ? `n_${token}` : token;
      negatedLeft = Math.max(0, negatedLeft - 1);
      features.push(word);
      if (previous) features.push(`${previous} ${word}`);
      previous = word;
    });
  });
  return features;
};

// TF-IDF weights over the model vocabulary, L2-normalized so long and short texts are comparable.
const vectorize = (features, vocab, idf) => {
  const indexes = [];
  const values = [];
  new Set(features).forEach((feature) => {
    const index = vocab[feature];
    if (index !== undefined) {
      indexes.push(index);
      values.push(idf[index]);
    }
  });
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return { indexes, values: values.map((value) => value / norm) };
};

const logitsOf = (vector, weights, biases, classCount) => {
  const logits = Array.from(biases);
  vector.indexes.forEach((featureIndex, position) => {
    const base = featureIndex * classCount;
    for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
      logits[classIndex] += vector.values[position] * weights[base + classIndex];
    }
  });
  return logits;
};

const classify = (model, text) => {
  const vector = vectorize(featuresOf(text), model.vocab, model.idf);
  if (!vector.indexes.length) return { label: NEUTRAL, probability: 1, known: 0 };

  const probabilities = softmax(logitsOf(vector, model.weights, model.biases, model.classes.length));
  const best = probabilities.indexOf(Math.max(...probabilities));
  return { label: model.classes[best], probability: probabilities[best], known: vector.indexes.length };
};

// Samples: [{ text, label }]. Softmax regression on TF-IDF features (AdaGrad) with class-balanced weights.
const trainTextModel = (samples) => {
  const shuffled = seededShuffle(samples, 11);
  const testSize = Math.floor(shuffled.length * 0.2);
  const testSet = shuffled.slice(0, testSize);
  const trainSet = shuffled.slice(testSize);

  const classes = [...new Set(samples.map((sample) => sample.label))].sort();
  if (classes.length < 2) throw new Error('Text datasets need at least two different labels.');
  const classCount = classes.length;
  const classIndex = new Map(classes.map((name, index) => [name, index]));

  const documentFrequency = new Map();
  const trainFeatures = trainSet.map(({ text }) => {
    const unique = [...new Set(featuresOf(text))];
    unique.forEach((feature) => documentFrequency.set(feature, (documentFrequency.get(feature) || 0) + 1));
    return unique;
  });
  const minFrequency = trainSet.length > 5000 ? 2 : 1;
  const kept = [...documentFrequency.entries()]
    .filter(([, frequency]) => frequency >= minFrequency)
    .sort((first, second) => second[1] - first[1])
    .slice(0, MAX_VOCAB);
  const vocab = Object.fromEntries(kept.map(([feature], index) => [feature, index]));
  const idf = kept.map(([, frequency]) => round(Math.log((trainSet.length + 1) / (frequency + 1)) + 1, 4));

  const vectors = trainFeatures.map((features) => vectorize(features, vocab, idf));
  const labels = trainSet.map((sample) => classIndex.get(sample.label));
  const labelCounts = classes.map((_, index) => labels.filter((label) => label === index).length);
  const classWeight = labelCounts.map((count) => Math.min(MAX_CLASS_WEIGHT, Math.max(0.3, trainSet.length / (classCount * Math.max(count, 1)))));

  const weights = new Float32Array(kept.length * classCount);
  const weightSquares = new Float32Array(kept.length * classCount).fill(1e-8);
  const biases = new Float32Array(classCount);
  const biasSquares = new Float32Array(classCount).fill(1e-8);

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    seededShuffle(vectors.map((_, index) => index), 100 + epoch).forEach((sampleIndex) => {
      const vector = vectors[sampleIndex];
      const probabilities = softmax(logitsOf(vector, weights, biases, classCount));
      for (let classIdx = 0; classIdx < classCount; classIdx += 1) {
        const gradient = (probabilities[classIdx] - (classIdx === labels[sampleIndex] ? 1 : 0)) * classWeight[labels[sampleIndex]];
        biasSquares[classIdx] += gradient * gradient;
        biases[classIdx] -= (LEARNING_RATE * gradient) / Math.sqrt(biasSquares[classIdx]);
        vector.indexes.forEach((featureIndex, position) => {
          const slot = featureIndex * classCount + classIdx;
          const slotGradient = gradient * vector.values[position] + L2 * weights[slot];
          weightSquares[slot] += slotGradient * slotGradient;
          weights[slot] -= (LEARNING_RATE * slotGradient) / Math.sqrt(weightSquares[slot]);
        });
      }
    });
  }

  const model = {
    classes,
    vocab,
    idf,
    weights: Array.from(weights, (value) => round(value, 3)),
    biases: Array.from(biases, (value) => round(value, 3))
  };

  // Held-out evaluation: accuracy, per-class F1, and how often risk categories are flagged at the production threshold.
  const confusion = classes.map(() => classes.map(() => 0));
  let flaggedNeutral = 0;
  let neutralTotal = 0;
  let flaggedRisk = 0;
  let riskTotal = 0;
  testSet.forEach((sample) => {
    const result = classify(model, sample.text);
    confusion[classIndex.get(sample.label)][classes.indexOf(result.label)] += 1;
    const flagged = CATEGORY_BY_KEY.has(result.label) && result.probability >= FLAG_THRESHOLD && result.known >= 2;
    if (CATEGORY_BY_KEY.has(sample.label)) {
      riskTotal += 1;
      if (flagged) flaggedRisk += 1;
    } else {
      neutralTotal += 1;
      if (flagged) flaggedNeutral += 1;
    }
  });
  const perClass = Object.fromEntries(classes.map((name, index) => {
    const truePositive = confusion[index][index];
    const actual = confusion[index].reduce((sum, value) => sum + value, 0);
    const predicted = confusion.reduce((sum, row) => sum + row[index], 0);
    const precision = predicted ? truePositive / predicted : 0;
    const recall = actual ? truePositive / actual : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return [name, { precision: round(precision, 3), recall: round(recall, 3), f1: round(f1, 3), examples: actual }];
  }));
  const correct = confusion.reduce((sum, row, index) => sum + row[index], 0);

  return {
    ...model,
    metadata: {
      trained_at: new Date().toISOString(),
      samples: samples.length,
      vocabulary: kept.length,
      test_accuracy: testSet.length ? round(correct / testSet.length, 4) : null,
      macro_f1: round(Object.values(perClass).reduce((sum, value) => sum + value.f1, 0) / classCount, 3),
      risk_recall: riskTotal ? round(flaggedRisk / riskTotal, 3) : null,
      false_alarm_rate: neutralTotal ? round(flaggedNeutral / neutralTotal, 3) : null,
      per_class: perClass,
      class_distribution: Object.fromEntries(classes.map((name) => [name, samples.filter((sample) => sample.label === name).length]))
    }
  };
};

const splitSentences = (text) => text
  .split(/\n+/)
  .flatMap((line) => line.split(/(?<=[.!?])\s+/))
  .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
  .filter((sentence) => sentence.length > 3)
  .slice(0, MAX_SENTENCES);

const clip = (sentence) => (sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence);

// Reads text sentence by sentence and returns the behavior concerns the trained model recognizes.
const analyzeText = (model, text) => {
  const buckets = new Map();
  const positives = [];

  splitSentences(text).forEach((sentence) => {
    const { label, probability, known } = classify(model, sentence);
    if (known < 2 || probability < FLAG_THRESHOLD) return;
    if (label === POSITIVE) {
      positives.push({ sentence, probability });
    } else if (CATEGORY_BY_KEY.has(label)) {
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push({ sentence, probability });
    }
  });

  const categories = [...buckets.entries()].map(([key, hits]) => {
    const category = CATEGORY_BY_KEY.get(key);
    const strongest = [...hits].sort((first, second) => second.probability - first.probability).slice(0, 2);
    return { key, label: category.label, severity: category.severity, count: hits.length, evidence: strongest.map((hit) => clip(hit.sentence)) };
  }).sort((first, second) => second.severity - first.severity || second.count - first.count);

  const summary = categories.length
    ? `AI found ${categories.length} risk indicator${categories.length === 1 ? '' : 's'}: ${categories.map((category) => category.label.toLowerCase()).join('; ')}.`
    : 'AI found no risk indicators in this text.';
  return {
    summary,
    categories,
    positives: positives.slice(0, 2).map((hit) => clip(hit.sentence)),
    word_count: text.split(/\s+/).filter(Boolean).length
  };
};

// Severity score (0-6) for a single observation's written notes.
const noteSeverity = (analysis) => Math.min(6, analysis.categories.reduce((sum, category) => sum + category.severity, 0));

module.exports = { trainTextModel, classify, analyzeText, noteSeverity, featuresOf };
