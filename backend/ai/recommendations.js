// Template-based drafting of recommendations, IDPs, and counseling plans from risk assessment output.
// Output is decision support for staff review, never a clinical diagnosis.

const addMonths = (months) => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
};

const FACTOR_RECOMMENDATIONS = {
  avg_mood: 'Hold a one-on-one check-in to explore the youth\'s feelings and any recent triggers (family news, conflict, anniversaries).',
  avg_participation: 'Re-engage the youth with activities matched to their interests and pair them with a supportive peer or mentor.',
  avg_cooperation: 'Use clear, consistent routines and positive reinforcement; discuss expectations calmly instead of through punishment.',
  avg_peer: 'Monitor peer interactions, consider group mediation, and teach conflict-resolution and communication skills.',
  incidents_per_obs: 'Review recent incident reports for common triggers, times, and places, and adjust supervision accordingly.',
  max_aggression: 'Introduce anger-management and de-escalation strategies; ensure staff follow a consistent response protocol.',
  mood_trend: 'Mood is trending down. Increase the frequency of observations and counseling contact over the next two weeks.',
  participation_trend: 'Participation is trending down. Ask the youth directly what changed and adjust the activity plan.',
  return_count: 'History of returning to a facility suggests reviewing the aftercare and family-support plan with the social worker.'
};

const LEVEL_RECOMMENDATIONS = {
  high: [
    'Notify the psychometrician and the assigned social worker today and confirm who is responding.',
    'Schedule a counseling session within the week and increase supervision until risk is reassessed.',
    'Record a new observation after every notable incident so the risk level stays current.'
  ],
  medium: [
    'Schedule a counseling or check-in session within two weeks.',
    'Continue daily observations and review the trend at the next case conference.'
  ],
  low: [
    'Maintain current routines and continue regular observations.',
    'Reinforce positive behavior and progress with recognition and encouragement.'
  ]
};

const buildRecommendations = (assessment) => {
  if (assessment.baseline) {
    return [{ priority: 'low', text: 'Start recording behavior observations so the AI can assess risk and tailor this plan.' }];
  }
  const levelItems = (LEVEL_RECOMMENDATIONS[assessment.risk_level] || []).map((text) => ({
    priority: assessment.risk_level,
    text
  }));
  const factorItems = assessment.factors
    .filter((factor) => FACTOR_RECOMMENDATIONS[factor.key])
    .map((factor) => ({ priority: assessment.risk_level === 'low' ? 'low' : 'medium', text: FACTOR_RECOMMENDATIONS[factor.key], basis: factor.text }));
  return [...levelItems, ...factorItems];
};

const hasFactor = (assessment, ...keys) => assessment.factors.some((factor) => keys.includes(factor.key));

const buildIdpDraft = (client, assessment) => {
  const age = Number(client.age || 0);
  const isMinor = age > 0 && age < 18;
  const elevated = assessment.risk_level !== 'low';
  const goals = [];

  if (elevated || hasFactor(assessment, 'incidents_per_obs', 'max_aggression', 'avg_cooperation')) {
    goals.push({
      area: 'Behavior and Conduct',
      goal: 'Reduce behavioral incidents and follow house rules consistently.',
      strategies: [
        'Agree on 2-3 clear behavior targets with the youth.',
        'Use a daily behavior chart with positive reinforcement.',
        'Teach and rehearse calming and de-escalation techniques.'
      ],
      target_date: addMonths(3)
    });
  }

  goals.push({
    area: 'Emotional Well-being',
    goal: hasFactor(assessment, 'avg_mood', 'mood_trend')
      ? 'Improve mood and emotional coping, with regular counseling support.'
      : 'Maintain healthy emotional coping and express feelings in a safe way.',
    strategies: [
      'Attend scheduled counseling sessions.',
      'Practice journaling or another healthy outlet for emotions.',
      'Staff to log mood observations at least weekly.'
    ],
    target_date: addMonths(3)
  });

  if (hasFactor(assessment, 'avg_peer', 'avg_participation', 'participation_trend') || elevated) {
    goals.push({
      area: 'Social Skills and Peer Relations',
      goal: 'Build positive relationships and take part in group activities.',
      strategies: [
        'Join at least one group or recreational activity each week.',
        'Pair with a supportive peer or mentor.',
        'Practice communication and conflict-resolution skills.'
      ],
      target_date: addMonths(3)
    });
  }

  if (isMinor) {
    goals.push({
      area: 'Education',
      goal: client.grade_level
        ? `Attend school regularly and progress beyond ${client.grade_level}.`
        : 'Return to or stay in school and make steady academic progress.',
      strategies: [
        'Coordinate with the school or alternative learning system on enrollment and attendance.',
        'Set aside daily study and tutoring time.',
        'Review academic progress monthly with the social worker.'
      ],
      target_date: addMonths(6)
    });
  } else {
    goals.push({
      area: 'Livelihood and Life Skills',
      goal: 'Develop practical skills for independent living and income.',
      strategies: [
        'Identify interests and enroll in a skills or vocational program.',
        'Practice budgeting, hygiene, and daily-living routines.'
      ],
      target_date: addMonths(6)
    });
  }

  goals.push({
    area: 'Family and Reintegration',
    goal: Number(client.facility_return_count) > 0
      ? 'Strengthen family and community support to prevent another return to the facility.'
      : 'Assess family situation and prepare a safe reintegration or placement plan.',
    strategies: [
      'Social worker to conduct family or guardian assessment and home visit where appropriate.',
      'Plan supervised contact and family sessions as appropriate.',
      'Link the family to community services and aftercare support.'
    ],
    target_date: addMonths(6)
  });

  return {
    summary: assessment.baseline
      ? 'Baseline plan. No behavior observations are recorded yet, so risk could not be assessed. Review and adjust with the youth and care team before approval.'
      : `AI-drafted plan based on the ${assessment.risk_level} risk level (score ${assessment.risk_score}/100)${assessment.factors.length ? `. Main concerns: ${assessment.factors.map((factor) => factor.text.toLowerCase()).join('; ')}` : ''}. Review and adjust with the youth and care team before approval.`,
    goals: goals.map((goal) => ({ ...goal, status: 'not_started', progress: 0 })),
    recommendations: buildRecommendations(assessment),
    review_date: addMonths(3)
  };
};

const buildCounselingPlan = (client, assessment) => {
  const level = assessment.risk_level;
  const config = {
    high: { session_type: 'Crisis follow-up', frequency: 'Twice weekly until risk drops, then weekly', urgency: 'Within 24-72 hours' },
    medium: { session_type: 'Supportive counseling', frequency: 'Weekly or every two weeks', urgency: 'Within 1-2 weeks' },
    low: { session_type: 'Routine check-in', frequency: 'Monthly', urgency: 'Next regular schedule' }
  }[level];

  const focusAreas = assessment.factors.map((factor) => factor.text);
  if (!focusAreas.length) focusAreas.push('Strengths, goals, and general well-being');

  const techniques = ['Active listening and rapport building'];
  if (hasFactor(assessment, 'avg_mood', 'mood_trend')) techniques.push('Feelings identification and emotion-coping exercises');
  if (hasFactor(assessment, 'max_aggression', 'incidents_per_obs', 'avg_cooperation')) techniques.push('Anger management and de-escalation skills practice');
  if (hasFactor(assessment, 'avg_peer', 'avg_participation', 'participation_trend')) techniques.push('Social skills and peer-relationship role play');
  if (Number(client.facility_return_count) > 0) techniques.push('Relapse-prevention and aftercare planning');
  if (level === 'low') techniques.push('Strengths-based goal setting');

  const talkingPoints = [
    'Ask how the youth has been feeling since the last session.',
    'Review recent incidents or concerns without blame, and explore what happened.',
    'Highlight recent progress and positive moments.',
    'Agree on one small goal before the next session.'
  ];
  if (level === 'high') {
    talkingPoints.splice(1, 0, 'Ask directly about safety, including thoughts of self-harm or harming others.');
  }

  return {
    session_type: config.session_type,
    priority: level,
    suggested_timing: config.urgency,
    suggested_frequency: config.frequency,
    focus_areas: focusAreas,
    techniques,
    talking_points: talkingPoints,
    safety_note: level === 'high'
      ? 'If the youth shows immediate danger to self or others, follow the facility emergency protocol and inform the psychometrician and officer-in-charge right away.'
      : 'Escalate to the psychometrician if concerns increase or the youth discloses harm.',
    disclaimer: 'AI-generated suggestion for professional review. It is not a diagnosis.'
  };
};

module.exports = { buildRecommendations, buildIdpDraft, buildCounselingPlan };
