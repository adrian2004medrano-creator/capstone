// Behavior concern categories used by the text model; severity (1-3) feeds the risk model.
const CATEGORIES = [
  { key: 'self_harm', label: 'Self-harm or suicidal thoughts', severity: 3 },
  { key: 'abuse_trauma', label: 'History of abuse, neglect, or trauma', severity: 2 },
  { key: 'violence', label: 'Aggression or violence', severity: 2 },
  { key: 'running_away', label: 'Running away or absconding', severity: 2 },
  { key: 'substance_use', label: 'Substance use', severity: 2 },
  { key: 'emotional_distress', label: 'Emotional distress', severity: 2 },
  { key: 'delinquency', label: 'Stealing or conflict with the law', severity: 1 },
  { key: 'school_problems', label: 'School dropout or truancy', severity: 1 },
  { key: 'defiance', label: 'Defiance or refusal to follow rules', severity: 1 },
  { key: 'anger_irritability', label: 'Anger or irritability', severity: 1 },
  { key: 'family_instability', label: 'Unstable family situation', severity: 1 }
];
const CATEGORY_BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));
const NEUTRAL = 'neutral';
const POSITIVE = 'positive';

// Maps label names from public mental-health and behavior datasets onto our categories.
const LABEL_ALIASES = {
  normal: NEUTRAL, none: NEUTRAL, no_risk: NEUTRAL, not_concerning: NEUTRAL, safe: NEUTRAL, healthy: NEUTRAL, no_concern: NEUTRAL,
  progress: POSITIVE, good: POSITIVE, improvement: POSITIVE, improved: POSITIVE,
  suicidal: 'self_harm', suicide: 'self_harm', selfharm: 'self_harm', self_harm: 'self_harm', self_injury: 'self_harm',
  depression: 'emotional_distress', depressed: 'emotional_distress', anxiety: 'emotional_distress', stress: 'emotional_distress',
  sad: 'emotional_distress', sadness: 'emotional_distress', bipolar: 'emotional_distress', emotional: 'emotional_distress',
  distress: 'emotional_distress', panic: 'emotional_distress', personality_disorder: 'emotional_distress', loneliness: 'emotional_distress',
  mental_health: 'emotional_distress',
  aggression: 'violence', aggressive: 'violence', violent: 'violence', fighting: 'violence', bullying: 'violence', hostility: 'violence',
  anger: 'anger_irritability', angry: 'anger_irritability', irritability: 'anger_irritability',
  abuse: 'abuse_trauma', abused: 'abuse_trauma', trauma: 'abuse_trauma', neglect: 'abuse_trauma', maltreatment: 'abuse_trauma', ptsd: 'abuse_trauma',
  runaway: 'running_away', awol: 'running_away', absconding: 'running_away', escape: 'running_away',
  substance: 'substance_use', drug: 'substance_use', drugs: 'substance_use', alcohol: 'substance_use', addiction: 'substance_use',
  theft: 'delinquency', stealing: 'delinquency', crime: 'delinquency', conflict_with_the_law: 'delinquency',
  truancy: 'school_problems', dropout: 'school_problems', school: 'school_problems',
  oppositional: 'defiance', disobedience: 'defiance', conduct: 'defiance', conduct_disorder: 'defiance',
  family: 'family_instability', abandonment: 'family_instability', homeless: 'family_instability'
};

const normalizeLabel = (raw) => {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (CATEGORY_BY_KEY.has(key) || key === NEUTRAL || key === POSITIVE) return key;
  return LABEL_ALIASES[key] || null;
};

module.exports = { CATEGORIES, CATEGORY_BY_KEY, NEUTRAL, POSITIVE, normalizeLabel };
