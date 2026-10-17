// Single source of truth for the behavior checklist; the frontend loads it through /api/behavior/catalog.
// weight > 0 raises risk, weight < 0 marks a positive behavior.
const BEHAVIOR_CHECKLIST = [
  { group: 'Aggression and conflict', items: [
    { key: 'physical_fight', label: 'Physical fight or hitting others', weight: 3 },
    { key: 'verbal_threats', label: 'Verbal abuse or threats', weight: 2 },
    { key: 'property_damage', label: 'Destroyed or damaged property', weight: 2 },
    { key: 'bullying', label: 'Bullied or intimidated others', weight: 2 }
  ] },
  { group: 'Rule-breaking', items: [
    { key: 'defiance', label: 'Defied staff or refused instructions', weight: 1 },
    { key: 'ran_away', label: 'Ran away or attempted to leave the facility', weight: 3 },
    { key: 'stealing', label: 'Stealing', weight: 2 },
    { key: 'lying', label: 'Lying or manipulation', weight: 1 },
    { key: 'substance_use', label: 'Substance use or possession', weight: 3 },
    { key: 'inappropriate_sexual', label: 'Inappropriate sexual behavior', weight: 3 }
  ] },
  { group: 'Emotional state', items: [
    { key: 'crying_sadness', label: 'Frequent crying or sadness', weight: 1 },
    { key: 'withdrawn', label: 'Withdrawn or isolates self', weight: 2 },
    { key: 'anxious_fearful', label: 'Anxious or fearful', weight: 1 },
    { key: 'irritable', label: 'Irritable or sudden mood swings', weight: 1 },
    { key: 'hopeless', label: 'Hopeless statements', weight: 3 },
    { key: 'self_harm', label: 'Self-harm talk or acts', weight: 4, critical: true },
    { key: 'sleep_appetite', label: 'Sleep or appetite problems', weight: 1 },
    { key: 'trauma_reaction', label: 'Nightmares or trauma reactions', weight: 2 }
  ] },
  { group: 'Participation', items: [
    { key: 'skips_activities', label: 'Refused to join activities or school', weight: 1 }
  ] },
  { group: 'Positive behavior', items: [
    { key: 'follows_rules', label: 'Followed rules and routines', weight: -1 },
    { key: 'helps_others', label: 'Helped or encouraged others', weight: -1 },
    { key: 'joins_activities', label: 'Actively joined activities or school', weight: -1 },
    { key: 'shows_remorse', label: 'Showed remorse or took responsibility', weight: -1 },
    { key: 'seeks_help', label: 'Asked for help in a healthy way', weight: -1 }
  ] }
];

const ITEMS = BEHAVIOR_CHECKLIST.flatMap((group) => group.items);
const ITEM_BY_KEY = new Map(ITEMS.map((item) => [item.key, item]));

const isValidBehaviorKey = (key) => ITEM_BY_KEY.has(key);
const behaviorLabel = (key) => ITEM_BY_KEY.get(key)?.label || key;
const isCriticalBehavior = (key) => Boolean(ITEM_BY_KEY.get(key)?.critical);
const isRiskBehavior = (key) => (ITEM_BY_KEY.get(key)?.weight || 0) > 0;

// Risk behaviors add their weight; each positive behavior offsets half a point.
const checklistScore = (keys) => {
  const known = keys.map((key) => ITEM_BY_KEY.get(key)).filter(Boolean);
  const risk = known.filter((item) => item.weight > 0).reduce((sum, item) => sum + item.weight, 0);
  const positives = known.filter((item) => item.weight < 0).length;
  return Math.min(20, Math.max(0, risk - 0.5 * positives));
};

module.exports = { BEHAVIOR_CHECKLIST, isValidBehaviorKey, behaviorLabel, isCriticalBehavior, isRiskBehavior, checklistScore };
