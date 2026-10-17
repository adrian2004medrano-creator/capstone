const { mean, round, softmax, seededShuffle } = require('./utils');

const CLASSES = ['low', 'medium', 'high'];
const FEATURES = [
  'avg_mood',
  'avg_participation',
  'avg_cooperation',
  'avg_peer',
  'incidents_per_obs',
  'max_aggression',
  'checklist_load',
  'note_risk',
  'record_flags',
  'mood_trend',
  'participation_trend',
  'return_count',
  'age'
];
// Datasets may omit these columns; missing values are read as 0.
const OPTIONAL_FEATURES = ['checklist_load', 'note_risk', 'record_flags'];
// Age is a model input but is not reported as a risk factor to staff.
const EXPLAINABLE_FEATURES = FEATURES.filter((name) => name !== 'age');

// Observations must be sorted oldest to newest; each needs numeric checklist_score and note_score.
const buildFeatures = (observations, client, recordFlags = 0) => {
  const column = (key) => observations.map((observation) => Number(observation[key]));
  const trend = (key) => {
    if (observations.length < 2) return 0;
    const half = Math.floor(observations.length / 2);
    const values = column(key);
    return mean(values.slice(-half)) - mean(values.slice(0, half));
  };

  return {
    avg_mood: mean(column('mood')),
    avg_participation: mean(column('participation')),
    avg_cooperation: mean(column('cooperation')),
    avg_peer: mean(column('peer_relations')),
    incidents_per_obs: mean(column('incident_count')),
    max_aggression: Math.max(0, ...column('aggression')),
    checklist_load: mean(column('checklist_score')),
    note_risk: mean(column('note_score')),
    record_flags: Number(recordFlags),
    mood_trend: trend('mood'),
    participation_trend: trend('participation'),
    return_count: Number(client.facility_return_count || 0),
    age: Number(client.age || 0)
  };
};

const standardize = (features, model) => model.features.map((name, index) => ((features[name] ?? 0) - model.means[index]) / model.stds[index]);

const evaluate = (model, samples) => {
  const matrix = CLASSES.map(() => CLASSES.map(() => 0));
  samples.forEach(({ features, label }) => {
    const probabilities = predictProbabilities(model, features);
    matrix[label][probabilities.indexOf(Math.max(...probabilities))] += 1;
  });
  const correct = matrix.reduce((sum, row, index) => sum + row[index], 0);
  return { accuracy: round(samples.length ? correct / samples.length : 0, 4), confusion: matrix };
};

const predictProbabilities = (model, features) => {
  const inputs = standardize(features, model);
  const logits = model.weights.map((classWeights, classIndex) => (
    classWeights.reduce((sum, weight, index) => sum + weight * inputs[index], model.biases[classIndex])
  ));
  return softmax(logits);
};

const trainModel = (samples, { epochs = 1500, learningRate = 0.1, l2 = 0.001 } = {}) => {
  if (samples.length < 30) throw new Error('At least 30 structured training rows are required.');

  const shuffled = seededShuffle(samples);
  const testSize = Math.floor(shuffled.length * 0.2);
  const testSet = shuffled.slice(0, testSize);
  const trainSet = shuffled.slice(testSize);

  const means = FEATURES.map((name) => mean(trainSet.map((sample) => sample.features[name])));
  const stds = FEATURES.map((name, index) => {
    const variance = mean(trainSet.map((sample) => (sample.features[name] - means[index]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  const model = {
    classes: CLASSES,
    features: FEATURES,
    means,
    stds,
    weights: CLASSES.map(() => FEATURES.map(() => 0)),
    biases: CLASSES.map(() => 0)
  };

  const inputs = trainSet.map((sample) => standardize(sample.features, model));
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const weightGradient = CLASSES.map(() => FEATURES.map(() => 0));
    const biasGradient = CLASSES.map(() => 0);

    inputs.forEach((input, sampleIndex) => {
      const logits = model.weights.map((classWeights, classIndex) => (
        classWeights.reduce((sum, weight, index) => sum + weight * input[index], model.biases[classIndex])
      ));
      const probabilities = softmax(logits);
      probabilities.forEach((probability, classIndex) => {
        const error = probability - (trainSet[sampleIndex].label === classIndex ? 1 : 0);
        biasGradient[classIndex] += error;
        input.forEach((value, index) => {
          weightGradient[classIndex][index] += error * value;
        });
      });
    });

    CLASSES.forEach((_, classIndex) => {
      model.biases[classIndex] -= (learningRate * biasGradient[classIndex]) / inputs.length;
      FEATURES.forEach((__, index) => {
        const gradient = weightGradient[classIndex][index] / inputs.length + l2 * model.weights[classIndex][index];
        model.weights[classIndex][index] -= learningRate * gradient;
      });
    });
  }

  const train = evaluate(model, trainSet);
  const test = evaluate(model, testSet);
  return {
    ...model,
    metadata: {
      version: new Date().toISOString(),
      trained_at: new Date().toISOString(),
      samples: samples.length,
      train_accuracy: train.accuracy,
      test_accuracy: test.accuracy,
      test_confusion_matrix: test.confusion,
      class_distribution: Object.fromEntries(CLASSES.map((name, index) => [name, samples.filter((sample) => sample.label === index).length]))
    }
  };
};

const FACTOR_TEXT = {
  note_risk: (features, extras) => `Observation notes describe ${extras.noteCategories?.length ? extras.noteCategories.join(', ') : 'concerning behavior'}`,
  checklist_load: (features, extras) => `Concerning behaviors checked in observations${extras.topBehaviors?.length ? ` (${extras.topBehaviors.join(', ')})` : ''}`,
  record_flags: (features, extras) => `Case records flag ${extras.recordCategories?.length ? extras.recordCategories.join(', ') : 'risk indicators'}`,
  avg_mood: (features) => `Low average mood (${round(features.avg_mood, 1)}/5)`,
  avg_participation: (features) => `Low participation in activities (${round(features.avg_participation, 1)}/5)`,
  avg_cooperation: (features) => `Low cooperation with staff (${round(features.avg_cooperation, 1)}/5)`,
  avg_peer: (features) => `Strained peer relationships (${round(features.avg_peer, 1)}/5)`,
  incidents_per_obs: (features) => `Frequent incidents (${round(features.incidents_per_obs, 1)} per observation)`,
  max_aggression: (features) => `Aggression observed (up to ${features.max_aggression}/4)`,
  mood_trend: () => 'Mood has been declining recently',
  participation_trend: () => 'Participation has been declining recently',
  return_count: (features) => `Returned to a facility ${features.return_count} time${features.return_count === 1 ? '' : 's'}`
};

const assess = (model, features, extras = {}) => {
  const probabilities = predictProbabilities(model, features);
  const levelIndex = probabilities.indexOf(Math.max(...probabilities));
  const highIndex = CLASSES.indexOf('high');
  const lowIndex = CLASSES.indexOf('low');
  const inputs = standardize(features, model);

  const factors = EXPLAINABLE_FEATURES
    .filter((name) => model.features.includes(name))
    .map((name) => {
      const index = model.features.indexOf(name);
      const contribution = (model.weights[highIndex][index] - model.weights[lowIndex][index]) * inputs[index];
      return { key: name, contribution, text: FACTOR_TEXT[name](features, extras) };
    })
    .filter((factor) => factor.contribution > 0.15)
    .sort((first, second) => second.contribution - first.contribution)
    .slice(0, 4)
    .map(({ key, text, contribution }) => ({ key, text, weight: round(contribution) }));

  return {
    risk_level: CLASSES[levelIndex],
    risk_score: Math.round(100 * (probabilities[highIndex] + 0.5 * probabilities[CLASSES.indexOf('medium')])),
    probabilities: Object.fromEntries(CLASSES.map((name, index) => [name, round(probabilities[index], 3)])),
    factors
  };
};

module.exports = { CLASSES, FEATURES, OPTIONAL_FEATURES, buildFeatures, assess, trainModel };
