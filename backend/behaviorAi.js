const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { buildFeatures, assess } = require('./ai/riskModel');
const { analyzeText, noteSeverity } = require('./ai/textModel');
const { createTrainer } = require('./ai/trainer');
const { DatasetError, saveDataset, deleteDataset } = require('./ai/datasets');
const { buildIdpDraft, buildCounselingPlan } = require('./ai/recommendations');
const { BEHAVIOR_CHECKLIST, isValidBehaviorKey, behaviorLabel, isCriticalBehavior, isRiskBehavior, checklistScore } = require('./ai/behaviorCatalog');
const { SUPPORTED_EXTENSIONS, readDocument, aggregateAnalyses } = require('./ai/documentReader');

const ALL_ROLES = ['superadmin', 'admin', 'social_worker', 'psychometrician', 'user'];
const CASE_ROLES = ['superadmin', 'admin', 'social_worker'];
const ADMIN_ROLES = ['superadmin', 'admin'];
const REMARK_ROLES = ['superadmin', 'psychometrician', 'user'];
const RISK_ORDER = { high: 0, medium: 1, low: 2 };
const IDP_STATUSES = ['draft', 'approved', 'completed'];
const GOAL_STATUSES = ['not_started', 'in_progress', 'achieved'];
const SESSION_STATUSES = ['scheduled', 'completed', 'cancelled'];

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const intInRange = (value, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
};
const parseJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

class ValidationError extends Error {}

const sanitizeGoals = (goals) => {
  if (!Array.isArray(goals) || goals.length > 12) throw new ValidationError('Goals must be a list of up to 12 items.');
  return goals.map((goal) => {
    const status = GOAL_STATUSES.includes(goal?.status) ? goal.status : 'not_started';
    const progress = intInRange(goal?.progress ?? 0, 0, 100);
    const targetDate = goal?.target_date ? String(goal.target_date) : '';
    if (progress === null || (targetDate && !isDate(targetDate))) throw new ValidationError('A goal has an invalid progress or target date.');
    const area = text(goal?.area, 100);
    const description = text(goal?.goal, 500);
    if (!area || !description) throw new ValidationError('Every goal needs an area and a description.');
    return {
      area,
      goal: description,
      strategies: (Array.isArray(goal?.strategies) ? goal.strategies : []).slice(0, 10).map((item) => text(item, 300)).filter(Boolean),
      target_date: targetDate,
      status,
      progress
    };
  });
};

const sanitizeRecommendations = (items) => {
  if (!Array.isArray(items) || items.length > 30) throw new ValidationError('Recommendations must be a list of up to 30 items.');
  return items
    .map((item) => ({
      priority: ['low', 'medium', 'high'].includes(item?.priority) ? item.priority : 'low',
      text: text(item?.text, 500),
      ...(item?.basis ? { basis: text(item.basis, 200) } : {})
    }))
    .filter((item) => item.text);
};

module.exports = function registerBehaviorAi({ app, db, requireAuth, requireRoles, documentDirectory }) {
  const query = async (sql, params = []) => (await db.promise().query(sql, params))[0];
  const trainer = createTrainer({ onRetrained: () => refreshAfterTraining() });
  const models = () => trainer.models();
  const NOT_READY = 'The AI is still training. Try again in a moment.';

  const ensureColumn = async (table, column, definition) => {
    const existing = await query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (!existing.length) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };

  const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 5 } }).array('documents', 5);
  const uploadDocuments = (req, res, next) => documentUpload(req, res, (error) => {
    if (error) {
      return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Each document must be 10 MB or smaller.' : 'Upload up to 5 documents at a time.' });
    }
    next();
  });

  const wrap = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
      console.error('Behavior AI request failed:', error.message);
      res.status(500).json({ message: 'The request could not be completed.' });
    }
  };

  const notifyUsers = (actorId, message) => query(
    'INSERT INTO notifications (recipient_id, actor_id, message) SELECT id, ?, ? FROM users WHERE id <> ?',
    [actorId, message.slice(0, 255), actorId]
  ).catch((error) => console.error('Failed to create risk notification:', error.message));

  const getClient = async (clientId) => (await query(
    'SELECT id, name, age, home_name, present_picture, facility_return_count, grade_level, educational_attainment, case_category FROM clients WHERE id = ?',
    [clientId]
  ))[0] || null;

  const parseAssessment = (row) => row && ({
    risk_level: row.risk_level,
    risk_score: Number(row.risk_score),
    factors: parseJson(row.factors, []),
    observation_count: Number(row.observation_count),
    assessed_at: row.assessed_at
  });

  const latestAssessment = async (clientId) => parseAssessment((await query(
    'SELECT risk_level, risk_score, factors, observation_count, created_at AS assessed_at FROM risk_assessments WHERE client_id = ? ORDER BY id DESC LIMIT 1',
    [clientId]
  ))[0]);

  const recordAnalysisForClient = async (clientId) => {
    const rows = await query("SELECT analysis FROM case_record_documents WHERE client_id = ? AND status = 'analyzed'", [clientId]);
    return aggregateAnalyses(rows.map((row) => parseJson(row.analysis, null)));
  };

  // Computes and stores a new risk assessment from recent observations, their written notes, and AI-read case records.
  const assessClient = async (client, { skipIfUnchanged = false } = {}) => {
    const { risk, text: textModel } = models();
    if (!risk || !textModel) throw new ValidationError(NOT_READY);
    const recent = await query(
      `SELECT mood, participation, cooperation, peer_relations, aggression, incident_count, behaviors,
         incident_details, activities, progress_notes, concerns
       FROM behavior_observations WHERE client_id = ? ORDER BY observed_on DESC, id DESC LIMIT 10`,
      [client.id]
    );
    if (!recent.length) return null;

    const noteCategories = new Map();
    const chronological = recent.reverse().map((row) => {
      const behaviors = parseJson(row.behaviors, []);
      const notes = analyzeText(textModel, [row.incident_details, row.concerns, row.progress_notes, row.activities].filter(Boolean).join('\n'));
      notes.categories.forEach((category) => noteCategories.set(category.key, category.label.toLowerCase()));
      return { ...row, behaviors, checklist_score: checklistScore(behaviors), note_score: noteSeverity(notes) };
    });
    const records = await recordAnalysisForClient(client.id);

    const behaviorCounts = new Map();
    chronological.forEach((row) => row.behaviors.forEach((key) => behaviorCounts.set(key, (behaviorCounts.get(key) || 0) + 1)));
    const topBehaviors = [...behaviorCounts.entries()]
      .filter(([key]) => isRiskBehavior(key))
      .sort((first, second) => second[1] - first[1]).slice(0, 3).map(([key]) => behaviorLabel(key).toLowerCase());

    const result = assess(risk, buildFeatures(chronological, client, records.record_flags), {
      topBehaviors,
      noteCategories: [...noteCategories.values()].slice(0, 3),
      recordCategories: records.categories.map((category) => category.label.toLowerCase())
    });

    // Safety net: a recent self-harm check always raises a high alert regardless of the model.
    const criticalRecently = chronological.slice(-3).some((row) => row.behaviors.some(isCriticalBehavior));
    if (criticalRecently) {
      result.risk_level = 'high';
      result.risk_score = Math.max(result.risk_score, 85);
      result.factors.unshift({ key: 'critical_behavior', text: 'Self-harm talk or acts was checked in a recent observation', weight: 99 });
    }

    const assessment = { ...result, observation_count: chronological.length, assessed_at: new Date().toISOString() };
    if (skipIfUnchanged) {
      const previous = await latestAssessment(client.id);
      if (previous?.risk_level === result.risk_level && previous.risk_score === result.risk_score) return assessment;
    }
    await query(
      'INSERT INTO risk_assessments (client_id, risk_level, risk_score, factors, observation_count, model_version) VALUES (?, ?, ?, ?, ?, ?)',
      [client.id, result.risk_level, result.risk_score, JSON.stringify(result.factors), chronological.length, String(risk.metadata?.version || '').slice(0, 40)]
    );
    return assessment;
  };

  // Runs after the AI retrains: re-reads stored case records, then refreshes every client's risk level.
  async function refreshAfterTraining() {
    const { text: textModel } = models();
    if (textModel) {
      for (const document of await query('SELECT id, original_name, stored_name FROM case_record_documents')) {
        try {
          const buffer = await fs.promises.readFile(path.join(documentDirectory, document.stored_name));
          const reading = await readDocument(buffer, document.original_name, textModel);
          await query(
            'UPDATE case_record_documents SET status = ?, status_note = ?, analysis = ? WHERE id = ?',
            [reading.status, reading.note, reading.analysis ? JSON.stringify(reading.analysis) : null, document.id]
          );
        } catch (error) {
          console.error(`Could not re-read ${document.original_name}:`, error.message);
        }
      }
    }
    const clients = await query('SELECT DISTINCT client_id FROM behavior_observations');
    for (const { client_id: clientId } of clients) {
      const client = await getClient(clientId);
      if (client) await assessClient(client, { skipIfUnchanged: true });
    }
    console.log(`Risk levels refreshed for ${clients.length} client(s) after AI training.`);
  }

  // Reassesses a client and notifies staff when the risk level escalates.
  const assessAndAlert = async (client, actorId) => {
    const previous = await latestAssessment(client.id);
    const assessment = await assessClient(client);
    const escalated = assessment && (
      (assessment.risk_level === 'high' && previous?.risk_level !== 'high')
      || (assessment.risk_level === 'medium' && (!previous || previous.risk_level === 'low'))
    );
    if (escalated) {
      await notifyUsers(actorId, `${assessment.risk_level.toUpperCase()} risk alert: ${client.name} (${client.home_name}). Review behavior monitoring.`);
    }
    return assessment;
  };

  const assessmentForPlanning = async (clientId) => (
    (await latestAssessment(clientId)) || { risk_level: 'low', risk_score: 0, factors: [], baseline: true }
  );

  // An older version of the app left tables with the same names but a different layout.
  const retireLegacyTable = async (table, requiredColumn) => {
    if (!(await query('SHOW TABLES LIKE ?', [table])).length) return;
    const columns = (await query(`SHOW COLUMNS FROM ${table}`)).map((column) => column.Field);
    if (columns.includes(requiredColumn)) return;

    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${table}`);
    if (Number(total) === 0) {
      await query(`DROP TABLE ${table}`);
      return;
    }
    const archive = `${table}_legacy_${Date.now()}`;
    await query(`RENAME TABLE ${table} TO ${archive}`);
    console.warn(`The existing ${table} table had an older layout. Its data was kept as ${archive}.`);
  };

  const init = async () => {
    await retireLegacyTable('behavior_observations', 'observed_on');
    await retireLegacyTable('risk_assessments', 'risk_score');
    await retireLegacyTable('individual_development_plans', 'goals');
    await retireLegacyTable('counseling_sessions', 'session_type');
    await retireLegacyTable('case_record_documents', 'stored_name');

    await query(`
      CREATE TABLE IF NOT EXISTS behavior_observations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        observer_id INT NULL,
        observed_on DATE NOT NULL,
        mood TINYINT NOT NULL,
        participation TINYINT NOT NULL,
        cooperation TINYINT NOT NULL,
        peer_relations TINYINT NOT NULL,
        aggression TINYINT NOT NULL DEFAULT 0,
        incident_count SMALLINT NOT NULL DEFAULT 0,
        incident_details TEXT NULL,
        activities TEXT NULL,
        progress_notes TEXT NULL,
        concerns TEXT NULL,
        follow_up_needed TINYINT(1) NOT NULL DEFAULT 0,
        behaviors LONGTEXT NULL,
        psychometrician_remarks TEXT NULL,
        remarks_by INT NULL,
        remarks_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_behavior_obs_client_date (client_id, observed_on),
        CONSTRAINT fk_behavior_obs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('behavior_observations', 'behaviors', 'LONGTEXT NULL');
    await ensureColumn('behavior_observations', 'psychometrician_remarks', 'TEXT NULL');
    await ensureColumn('behavior_observations', 'remarks_by', 'INT NULL');
    await ensureColumn('behavior_observations', 'remarks_at', 'DATETIME NULL');
    await query(`
      CREATE TABLE IF NOT EXISTS case_record_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL UNIQUE,
        mime_type VARCHAR(150) NULL,
        file_size BIGINT UNSIGNED NOT NULL,
        status VARCHAR(20) NOT NULL,
        status_note VARCHAR(255) NULL,
        analysis LONGTEXT NULL,
        uploaded_by INT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_case_documents_client (client_id),
        CONSTRAINT fk_case_documents_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS risk_assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        risk_level VARCHAR(10) NOT NULL,
        risk_score TINYINT UNSIGNED NOT NULL,
        factors LONGTEXT NULL,
        observation_count SMALLINT NOT NULL DEFAULT 0,
        model_version VARCHAR(40) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_risk_client (client_id, id),
        CONSTRAINT fk_risk_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS individual_development_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        summary TEXT NULL,
        goals LONGTEXT NULL,
        recommendations LONGTEXT NULL,
        risk_level VARCHAR(10) NULL,
        risk_score TINYINT UNSIGNED NULL,
        generated_by_ai TINYINT(1) NOT NULL DEFAULT 0,
        review_date DATE NULL,
        created_by INT NULL,
        approved_by INT NULL,
        approved_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_idp_client (client_id, id),
        CONSTRAINT fk_idp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS counseling_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        session_date DATE NOT NULL,
        session_type VARCHAR(60) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        focus VARCHAR(255) NULL,
        ai_plan LONGTEXT NULL,
        notes TEXT NULL,
        outcome TEXT NULL,
        next_session_date DATE NULL,
        counselor_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_counseling_client (client_id, session_date),
        CONSTRAINT fk_counseling_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await trainer.start();
    console.log('Behavior AI tables are ready. AI models train automatically from backend/data/datasets.');
  };

  // AI training status and datasets (training itself is automatic)

  app.get('/api/ai/model', requireAuth, requireRoles(ALL_ROLES), (req, res) => {
    res.json(trainer.status());
  });

  const datasetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } }).single('dataset');
  const uploadDataset = (req, res, next) => datasetUpload(req, res, (error) => {
    if (error) return res.status(400).json({ message: 'Upload one CSV dataset of 25 MB or smaller.' });
    next();
  });
  const asValidation = (action) => {
    try {
      return action();
    } catch (error) {
      throw error instanceof DatasetError ? new ValidationError(error.message) : error;
    }
  };

  app.post('/api/ai/datasets', requireAuth, requireRoles(['superadmin']), uploadDataset, wrap(async (req, res) => {
    if (!req.file) throw new ValidationError('Choose a CSV dataset to upload.');
    const dataset = asValidation(() => saveDataset(req.file.originalname, req.file.buffer));
    await trainer.trainNow();
    res.status(201).json({
      message: `Dataset added (${dataset.rows} usable rows${dataset.skipped ? `, ${dataset.skipped} skipped` : ''}). The AI trained on it automatically.`,
      dataset,
      status: trainer.status()
    });
  }));

  app.delete('/api/ai/datasets/:name', requireAuth, requireRoles(['superadmin']), wrap(async (req, res) => {
    const { name } = req.params;
    const datasets = trainer.status().datasets;
    const target = datasets.find((dataset) => dataset.name === name);
    if (target?.type && datasets.filter((dataset) => dataset.type === target.type).length === 1) {
      throw new ValidationError(`Keep at least one ${target.type} dataset so the AI can train.`);
    }
    asValidation(() => deleteDataset(name));
    await trainer.trainNow();
    res.json({ message: 'Dataset removed. The AI retrained automatically.', status: trainer.status() });
  }));

  // Behavior observations and risk alerts

  app.get('/api/behavior/risk-overview', requireAuth, requireRoles(ALL_ROLES), wrap(async (req, res) => {
    const [rows, unassessedRows] = await Promise.all([query(`
      SELECT c.id, c.name, c.age, c.home_name, c.present_picture,
        ra.risk_level, ra.risk_score, ra.factors, ra.created_at AS assessed_at,
        (SELECT COUNT(*) FROM behavior_observations o WHERE o.client_id = c.id) AS observation_count,
        (SELECT DATE_FORMAT(MAX(o.observed_on), '%Y-%m-%d') FROM behavior_observations o WHERE o.client_id = c.id) AS last_observed,
        (SELECT COUNT(*) FROM behavior_observations o WHERE o.client_id = c.id AND o.follow_up_needed = 1 AND o.psychometrician_remarks IS NULL) AS awaiting_response
      FROM clients c
      INNER JOIN risk_assessments ra ON ra.id = (SELECT MAX(r.id) FROM risk_assessments r WHERE r.client_id = c.id)
    `), query(`
      SELECT COUNT(*) AS count
      FROM clients c
      WHERE NOT EXISTS (SELECT 1 FROM risk_assessments ra WHERE ra.client_id = c.id)
    `)]);
    const clients = rows.map((row) => ({
      id: row.id,
      name: row.name,
      age: row.age === null ? null : Number(row.age),
      home_name: row.home_name,
      present_picture: row.present_picture,
      risk_level: row.risk_level || null,
      risk_score: row.risk_score === null ? null : Number(row.risk_score),
      factors: parseJson(row.factors, []),
      assessed_at: row.assessed_at,
      observation_count: Number(row.observation_count),
      last_observed: row.last_observed,
      awaiting_response: Number(row.awaiting_response)
    })).sort((first, second) => (
      (RISK_ORDER[first.risk_level] ?? 3) - (RISK_ORDER[second.risk_level] ?? 3)
      || (second.risk_score ?? -1) - (first.risk_score ?? -1)
      || first.name.localeCompare(second.name)
    ));
    const count = (level) => clients.filter((client) => client.risk_level === level).length;
    res.json({
      totals: {
        high: count('high'), medium: count('medium'), low: count('low'),
        unassessed: Number(unassessedRows[0].count),
        awaiting_response: clients.reduce((sum, client) => sum + client.awaiting_response, 0)
      },
      clients
    });
  }));

  app.get('/api/behavior/catalog', requireAuth, requireRoles(ALL_ROLES), (req, res) => {
    res.json({ groups: BEHAVIOR_CHECKLIST, document_types: SUPPORTED_EXTENSIONS });
  });

  app.get('/api/behavior/clients/:id', requireAuth, requireRoles(ALL_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.params.id);
    const client = clientId && await getClient(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const observations = await query(`
      SELECT o.id, DATE_FORMAT(o.observed_on, '%Y-%m-%d') AS observed_on, o.mood, o.participation, o.cooperation, o.peer_relations,
        o.aggression, o.incident_count, o.incident_details, o.activities, o.progress_notes, o.concerns, o.follow_up_needed,
        o.behaviors, o.psychometrician_remarks, DATE_FORMAT(o.remarks_at, '%Y-%m-%d %H:%i') AS remarks_at,
        TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS remarks_by_name,
        o.created_at, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS observer_name
      FROM behavior_observations o
      LEFT JOIN users u ON u.id = o.observer_id
      LEFT JOIN users r ON r.id = o.remarks_by
      WHERE o.client_id = ? ORDER BY o.observed_on DESC, o.id DESC LIMIT 30
    `, [clientId]);
    const history = await query(
      'SELECT risk_level, risk_score, created_at FROM risk_assessments WHERE client_id = ? ORDER BY id DESC LIMIT 12',
      [clientId]
    );
    res.json({
      client: { id: client.id, name: client.name, age: client.age, home_name: client.home_name, present_picture: client.present_picture },
      assessment: await latestAssessment(clientId),
      assessment_history: history.reverse().map((row) => ({ risk_level: row.risk_level, risk_score: Number(row.risk_score), assessed_at: row.created_at })),
      observations: observations.map((row) => ({ ...row, behaviors: parseJson(row.behaviors, []), follow_up_needed: Boolean(row.follow_up_needed) })),
      documents: await listDocuments(clientId)
    });
  }));

  app.post('/api/behavior/observations', requireAuth, requireRoles(ALL_ROLES), wrap(async (req, res) => {
    const body = req.body;
    const clientId = parseId(body.client_id);
    const scores = {
      mood: intInRange(body.mood, 1, 5),
      participation: intInRange(body.participation, 1, 5),
      cooperation: intInRange(body.cooperation, 1, 5),
      peer_relations: intInRange(body.peer_relations, 1, 5),
      aggression: intInRange(body.aggression ?? 0, 0, 4),
      incident_count: intInRange(body.incident_count ?? 0, 0, 50)
    };
    const today = new Date().toISOString().slice(0, 10);
    if (!clientId) throw new ValidationError('Choose a client.');
    if (!isDate(body.observed_on) || body.observed_on > today) throw new ValidationError('Enter a valid observation date that is not in the future.');
    if (Object.values(scores).some((value) => value === null)) throw new ValidationError('Scores are out of range (ratings 1-5, aggression 0-4, incidents 0-50).');
    const behaviors = Array.isArray(body.behaviors) ? [...new Set(body.behaviors)] : [];
    if (behaviors.length > 40 || !behaviors.every(isValidBehaviorKey)) throw new ValidationError('The behavior checklist contains an unknown item.');

    const client = await getClient(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { risk, text: textModel } = models();
    if (!risk || !textModel) throw new ValidationError(NOT_READY);

    await query(
      `INSERT INTO behavior_observations
        (client_id, observer_id, observed_on, mood, participation, cooperation, peer_relations, aggression, incident_count,
         incident_details, activities, progress_notes, concerns, follow_up_needed, behaviors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId, req.auth.id, body.observed_on, scores.mood, scores.participation, scores.cooperation, scores.peer_relations,
        scores.aggression, scores.incident_count,
        text(body.incident_details, 2000) || null, text(body.activities, 1000) || null,
        text(body.progress_notes, 2000) || null, text(body.concerns, 2000) || null, body.follow_up_needed ? 1 : 0,
        JSON.stringify(behaviors)
      ]
    );

    const noteFindings = analyzeText(
      textModel,
      [body.incident_details, body.concerns, body.progress_notes, body.activities].map((value) => text(value, 2000)).filter(Boolean).join('\n')
    ).categories.map((category) => category.label);
    const assessment = await assessAndAlert(client, req.auth.id);
    res.status(201).json({ message: 'Observation saved.', assessment, note_findings: noteFindings });
  }));

  app.delete('/api/behavior/observations/:id', requireAuth, requireRoles(ADMIN_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const [observation] = id ? await query('SELECT client_id FROM behavior_observations WHERE id = ?', [id]) : [];
    if (!observation) return res.status(404).json({ message: 'Observation not found.' });

    await query('DELETE FROM behavior_observations WHERE id = ?', [id]);
    const client = await getClient(observation.client_id);
    if (!(await assessClient(client))) {
      await query('DELETE FROM risk_assessments WHERE client_id = ?', [observation.client_id]);
    }
    res.json({ message: 'Observation deleted.' });
  }));

  // Psychometrician responses to observations

  app.put('/api/behavior/observations/:id/remarks', requireAuth, requireRoles(REMARK_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const remarks = text(req.body.remarks, 2000);
    if (!remarks) throw new ValidationError('Enter your remarks.');
    const [observation] = id ? await query(
      "SELECT client_id, observer_id, DATE_FORMAT(observed_on, '%Y-%m-%d') AS observed_on FROM behavior_observations WHERE id = ?", [id]
    ) : [];
    if (!observation) return res.status(404).json({ message: 'Observation not found.' });

    await query(
      'UPDATE behavior_observations SET psychometrician_remarks = ?, remarks_by = ?, remarks_at = NOW() WHERE id = ?',
      [remarks, req.auth.id, id]
    );
    if (observation.observer_id && observation.observer_id !== req.auth.id) {
      const client = await getClient(observation.client_id);
      await query(
        'INSERT INTO notifications (recipient_id, actor_id, message) VALUES (?, ?, ?)',
        [observation.observer_id, req.auth.id, `The psychometrician responded to your ${observation.observed_on} observation of ${client?.name || 'a client'}.`.slice(0, 255)]
      ).catch((error) => console.error('Failed to notify observer:', error.message));
    }
    res.json({ message: 'Remarks saved.' });
  }));

  // Case record documents read by the AI

  const listDocuments = async (clientId) => (await query(
    `SELECT d.id, d.original_name, d.file_size, d.status, d.status_note, d.analysis, d.uploaded_at,
       TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS uploaded_by_name
     FROM case_record_documents d LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.client_id = ? ORDER BY d.id DESC`,
    [clientId]
  )).map((row) => ({ ...row, file_size: Number(row.file_size), analysis: parseJson(row.analysis, null) }));

  app.post('/api/behavior/clients/:id/documents', requireAuth, requireRoles(ALL_ROLES), uploadDocuments, wrap(async (req, res) => {
    const clientId = parseId(req.params.id);
    const client = clientId && await getClient(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const files = req.files || [];
    if (!files.length) throw new ValidationError('Choose at least one document to upload.');
    const { text: textModel } = models();
    if (!textModel) throw new ValidationError(NOT_READY);
    const cleanName = (name) => name.split(/[\\/]/).pop().replace(/[\r\n"]/g, '_').slice(0, 255) || 'document';
    if (files.some((file) => !SUPPORTED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase()))) {
      throw new ValidationError('Upload PDF, DOCX, or TXT files only.');
    }

    for (const file of files) {
      const originalName = cleanName(file.originalname);
      const reading = await readDocument(file.buffer, originalName, textModel);
      const storedName = `${crypto.randomUUID()}${path.extname(originalName).toLowerCase()}`;
      await fs.promises.writeFile(path.join(documentDirectory, storedName), file.buffer);
      await query(
        `INSERT INTO case_record_documents (client_id, original_name, stored_name, mime_type, file_size, status, status_note, analysis, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, originalName, storedName, file.mimetype, file.size, reading.status, reading.note, reading.analysis ? JSON.stringify(reading.analysis) : null, req.auth.id]
      );
    }

    const assessment = await assessAndAlert(client, req.auth.id);
    res.status(201).json({ message: 'Documents uploaded and read by the AI.', documents: await listDocuments(clientId), assessment });
  }));

  app.get('/api/behavior/documents/:docId/download', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.docId);
    const [document] = id ? await query('SELECT original_name, stored_name FROM case_record_documents WHERE id = ?', [id]) : [];
    if (!document) return res.status(404).json({ message: 'Document not found.' });
    res.download(path.join(documentDirectory, document.stored_name), document.original_name, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: 'The saved document file could not be found.' });
    });
  }));

  app.delete('/api/behavior/documents/:docId', requireAuth, requireRoles(ADMIN_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.docId);
    const [document] = id ? await query('SELECT client_id, stored_name FROM case_record_documents WHERE id = ?', [id]) : [];
    if (!document) return res.status(404).json({ message: 'Document not found.' });

    await query('DELETE FROM case_record_documents WHERE id = ?', [id]);
    fs.promises.unlink(path.join(documentDirectory, document.stored_name)).catch(() => {});
    const client = await getClient(document.client_id);
    await assessClient(client);
    res.json({ message: 'Document deleted.' });
  }));

  // Individual development plans

  const formatPlan = (row) => ({
    id: row.id,
    client_id: row.client_id,
    status: row.status,
    summary: row.summary,
    goals: parseJson(row.goals, []),
    recommendations: parseJson(row.recommendations, []),
    risk_level: row.risk_level,
    risk_score: row.risk_score === null ? null : Number(row.risk_score),
    generated_by_ai: Boolean(row.generated_by_ai),
    review_date: row.review_date,
    approved_at: row.approved_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
  const PLAN_COLUMNS = `id, client_id, status, summary, goals, recommendations, risk_level, risk_score, generated_by_ai,
    DATE_FORMAT(review_date, '%Y-%m-%d') AS review_date, approved_at, created_at, updated_at`;

  app.get('/api/idp', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.query.client_id);
    if (!clientId) throw new ValidationError('Choose a client.');
    const rows = await query(`SELECT ${PLAN_COLUMNS} FROM individual_development_plans WHERE client_id = ? ORDER BY id DESC`, [clientId]);
    res.json(rows.map(formatPlan));
  }));

  app.post('/api/idp/generate', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.body.client_id);
    const client = clientId && await getClient(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const assessment = await assessmentForPlanning(clientId);
    const draft = buildIdpDraft(client, assessment);
    const { insertId } = await query(
      `INSERT INTO individual_development_plans
        (client_id, status, summary, goals, recommendations, risk_level, risk_score, generated_by_ai, review_date, created_by)
       VALUES (?, 'draft', ?, ?, ?, ?, ?, 1, ?, ?)`,
      [clientId, draft.summary, JSON.stringify(draft.goals), JSON.stringify(draft.recommendations),
        assessment.baseline ? null : assessment.risk_level, assessment.baseline ? null : assessment.risk_score, draft.review_date, req.auth.id]
    );
    const [row] = await query(`SELECT ${PLAN_COLUMNS} FROM individual_development_plans WHERE id = ?`, [insertId]);
    res.status(201).json(formatPlan(row));
  }));

  app.put('/api/idp/:id', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const [existing] = id ? await query('SELECT id, status FROM individual_development_plans WHERE id = ?', [id]) : [];
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });

    const goals = sanitizeGoals(req.body.goals);
    const recommendations = sanitizeRecommendations(req.body.recommendations);
    const reviewDate = req.body.review_date ? String(req.body.review_date) : null;
    if (reviewDate && !isDate(reviewDate)) throw new ValidationError('Enter a valid review date.');

    // Edits by non-admin staff send the plan back to draft until an admin approves it again.
    const isAdmin = ADMIN_ROLES.includes(req.auth.role);
    const status = isAdmin && IDP_STATUSES.includes(req.body.status) ? req.body.status : 'draft';
    const approving = status === 'approved' && existing.status !== 'approved';

    await query(
      `UPDATE individual_development_plans
       SET status = ?, summary = ?, goals = ?, recommendations = ?, review_date = ?,
           approved_by = CASE WHEN ? THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? THEN NOW() ELSE approved_at END
       WHERE id = ?`,
      [status, text(req.body.summary, 2000) || null, JSON.stringify(goals), JSON.stringify(recommendations), reviewDate,
        approving ? 1 : 0, req.auth.id, approving ? 1 : 0, id]
    );
    const [row] = await query(`SELECT ${PLAN_COLUMNS} FROM individual_development_plans WHERE id = ?`, [id]);
    res.json(formatPlan(row));
  }));

  app.delete('/api/idp/:id', requireAuth, requireRoles(ADMIN_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const result = id ? await query('DELETE FROM individual_development_plans WHERE id = ?', [id]) : { affectedRows: 0 };
    if (!result.affectedRows) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ message: 'Plan deleted.' });
  }));

  // Counseling sessions

  const formatSession = (row) => ({ ...row, ai_plan: parseJson(row.ai_plan, null) });
  const SESSION_COLUMNS = `id, client_id, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date, session_type, status, focus, ai_plan, notes, outcome,
    DATE_FORMAT(next_session_date, '%Y-%m-%d') AS next_session_date, created_at`;

  app.get('/api/counseling/suggest', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.query.client_id);
    const client = clientId && await getClient(clientId);
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const assessment = await assessmentForPlanning(clientId);
    res.json({ assessment: assessment.baseline ? null : assessment, plan: buildCounselingPlan(client, assessment) });
  }));

  app.get('/api/counseling/sessions', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.query.client_id);
    if (!clientId) throw new ValidationError('Choose a client.');
    const rows = await query(`SELECT ${SESSION_COLUMNS} FROM counseling_sessions WHERE client_id = ? ORDER BY session_date DESC, id DESC`, [clientId]);
    res.json(rows.map(formatSession));
  }));

  const readSessionBody = (body) => {
    const session = {
      session_date: String(body.session_date || ''),
      session_type: text(body.session_type, 60),
      status: body.status,
      focus: text(body.focus, 255) || null,
      notes: text(body.notes, 4000) || null,
      outcome: text(body.outcome, 2000) || null,
      next_session_date: body.next_session_date ? String(body.next_session_date) : null,
      ai_plan: body.ai_plan && typeof body.ai_plan === 'object' ? JSON.stringify(body.ai_plan) : null
    };
    if (!isDate(session.session_date)) throw new ValidationError('Enter a valid session date.');
    if (!session.session_type) throw new ValidationError('Enter the session type.');
    if (!SESSION_STATUSES.includes(session.status)) throw new ValidationError('Choose a valid session status.');
    if (session.next_session_date && !isDate(session.next_session_date)) throw new ValidationError('Enter a valid next session date.');
    if (session.ai_plan && session.ai_plan.length > 20000) throw new ValidationError('The AI plan is too large.');
    return session;
  };

  app.post('/api/counseling/sessions', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const clientId = parseId(req.body.client_id);
    if (!clientId || !(await getClient(clientId))) return res.status(404).json({ message: 'Client not found.' });

    const session = readSessionBody(req.body);
    const { insertId } = await query(
      `INSERT INTO counseling_sessions
        (client_id, session_date, session_type, status, focus, ai_plan, notes, outcome, next_session_date, counselor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, session.session_date, session.session_type, session.status, session.focus, session.ai_plan,
        session.notes, session.outcome, session.next_session_date, req.auth.id]
    );
    const [row] = await query(`SELECT ${SESSION_COLUMNS} FROM counseling_sessions WHERE id = ?`, [insertId]);
    res.status(201).json(formatSession(row));
  }));

  app.put('/api/counseling/sessions/:id', requireAuth, requireRoles(CASE_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const session = readSessionBody(req.body);
    const result = id ? await query(
      `UPDATE counseling_sessions
       SET session_date = ?, session_type = ?, status = ?, focus = ?, ai_plan = ?, notes = ?, outcome = ?, next_session_date = ?
       WHERE id = ?`,
      [session.session_date, session.session_type, session.status, session.focus, session.ai_plan,
        session.notes, session.outcome, session.next_session_date, id]
    ) : { affectedRows: 0 };
    if (!result.affectedRows) return res.status(404).json({ message: 'Session not found.' });
    const [row] = await query(`SELECT ${SESSION_COLUMNS} FROM counseling_sessions WHERE id = ?`, [id]);
    res.json(formatSession(row));
  }));

  app.delete('/api/counseling/sessions/:id', requireAuth, requireRoles(ADMIN_ROLES), wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const result = id ? await query('DELETE FROM counseling_sessions WHERE id = ?', [id]) : { affectedRows: 0 };
    if (!result.affectedRows) return res.status(404).json({ message: 'Session not found.' });
    res.json({ message: 'Session deleted.' });
  }));

  return { init };
};
