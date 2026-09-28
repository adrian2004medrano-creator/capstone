const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
let databaseImportInProgress = false;
app.use((req, res, next) => {
  if (databaseImportInProgress && req.path.startsWith('/api/')) {
    return res.status(503).json({ message: 'Database restore is in progress. Please try again shortly.' });
  }
  next();
});

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV is production.');
}
const jwtSecret = process.env.JWT_SECRET || 'kalakbay-local-development-secret-change-before-deployment';
const smtpUser = process.env.SMTP_USER || 'medrano.adrian.bsinfotech@gmail.com';
const mailFrom = process.env.MAIL_FROM || smtpUser;
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpConfigured = Boolean(process.env.SMTP_PASS);
const mailTransporter = smtpConfigured
  ? nodemailer.createTransport({
  host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
  auth: { user: smtpUser, pass: process.env.SMTP_PASS }
    })
  : null;
const requireAuth = (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.auth = jwt.verify(token, jwtSecret);
    db.query('SELECT id FROM users WHERE id = ?', [req.auth.id], (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Could not verify the user account.' });
      }
      if (!rows.length) {
        return res.status(401).json({ message: 'User account no longer exists. Please sign in again.' });
      }
      next();
    });
  } catch {
    res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
};
const requireSuperadmin = (req, res, next) => {
  if (req.auth?.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only a superadmin can manage user accounts.' });
  }
  next();
};
const requireRoles = (roles) => (req, res, next) => {
  if (!roles.includes(req.auth?.role)) {
    return res.status(403).json({ message: 'Your role is not allowed to access this resource.' });
  }
  next();
};
const requireBackupAccess = requireRoles(['superadmin', 'admin', 'social_worker']);
const teamChatRoles = ['superadmin', 'admin', 'social_worker', 'psychometrician', 'user'];
const caseManagementRoles = ['superadmin', 'admin', 'social_worker'];

const uploadDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const documentDirectory = path.join(__dirname, 'client-documents');
fs.mkdirSync(documentDirectory, { recursive: true });
const imageStorage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'));
    }
    callback(null, true);
  }
});
const uploadClientImages = (req, res, next) => {
  imageUpload.fields([
    { name: 'past_picture', maxCount: 1 },
    { name: 'present_picture', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each image must be 5 MB or smaller.'
        : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};
const documentStorage = multer.diskStorage({
  destination: documentDirectory,
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});
const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }
}).array('documents', 10);
const uploadClientDocuments = (req, res, next) => {
  documentUpload(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each document must be 20 MB or smaller.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'You can upload up to 10 documents at a time.'
          : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};
const reportUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }
}).array('documents', 10);
const uploadHomeReportFiles = (req, res, next) => {
  reportUpload(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each report file must be 20 MB or smaller.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'You can upload up to 10 report files at a time.'
          : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};
const careHomeNames = ['Girls Home', 'Boys Home', 'Kids Home', 'Home for the Aged', 'Kamada'];
const clientSelectColumns = 'id, home_name, past_picture, present_picture, name, first_name, middle_initial, last_name, age, sex, civil_status, religion, occupation_income, birthdate, birthplace, city_address, barangay, source_of_referral, date_admitted, case_category, educational_attainment, school_last_attended, grade_level, age_when_found, date_time_when_found, place_where_found, present_whereabouts, created_at';
app.use('/uploads', express.static(uploadDirectory));

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kalakbay__ai'
});
const databaseBackupDirectory = path.join(__dirname, 'backups');
const databaseSafetyBackupDirectory = path.join(databaseBackupDirectory, 'import-safety');
fs.mkdirSync(databaseBackupDirectory, { recursive: true });
fs.mkdirSync(databaseSafetyBackupDirectory, { recursive: true });
const databaseBackupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }
}).single('backup');

const uploadDatabaseBackup = (req, res, next) => {
  databaseBackupUpload(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'The database backup must be 100 MB or smaller.'
        : error.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

const splitBackupStatements = (sql) => {
  const statements = [];
  let statement = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      statement += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote !== '`') {
        escaped = true;
      } else if (character === quote) {
        if (sql[index + 1] === quote) {
          statement += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
    } else if (character === '-' && sql[index + 1] === '-' && (index + 2 === sql.length || /\s/.test(sql[index + 2]))) {
      while (index + 1 < sql.length && sql[index + 1] !== '\n') index += 1;
    } else if (character === '#') {
      while (index + 1 < sql.length && sql[index + 1] !== '\n') index += 1;
    } else if (character === '/' && sql[index + 1] === '*') {
      const commentEnd = sql.indexOf('*/', index + 2);
      if (commentEnd === -1) throw new Error('The SQL backup contains an unclosed comment.');
      index = commentEnd + 1;
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character;
      statement += character;
    } else if (character === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
    } else {
      statement += character;
    }
  }

  if (quote) throw new Error('The SQL backup contains an unterminated quoted value.');
  if (statement.trim()) throw new Error('The SQL backup must end each statement with a semicolon.');
  return statements;
};

const validateDatabaseBackup = async (sql) => {
  const statements = splitBackupStatements(sql.replace(/^\uFEFF/, ''));
  const [tableRows] = await db.promise().query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const allowedTables = new Set(tableRows.map((row) => row[Object.keys(row)[0]]));
  const validated = [];
  let pendingCreate = null;
  const createdTables = new Set();

  for (const rawStatement of statements) {
    const statement = rawStatement.replace(
      /^(\s*(?:DROP TABLE IF EXISTS|CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO|ALTER TABLE)\s+)(?:`[A-Za-z0-9_$-]+`\s*\.\s*)?(`[A-Za-z0-9_]+`)/i,
      '$1$2'
    ).replace(
      /(\bREFERENCES\s+)(?:`[A-Za-z0-9_$-]+`\s*\.\s*)?(`[A-Za-z0-9_]+`)/i,
      '$1$2'
    );
    if (/^CREATE\s+DATABASE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?[A-Za-z0-9_$-]+`?(?:\s+.*)?$/i.test(statement)
      || /^DROP\s+DATABASE(?:\s+IF\s+EXISTS)?\s+`?[A-Za-z0-9_$-]+`?$/i.test(statement)
      || /^USE\s+`?[A-Za-z0-9_$-]+`?$/i.test(statement)
      || /^SET\s+(?:SQL_MODE|TIME_ZONE|NAMES|CHARACTER_SET_CLIENT|CHARACTER_SET_RESULTS|COLLATION_CONNECTION|UNIQUE_CHECKS)\b/i.test(statement)
      || /^SET\s+@(?:OLD_)?[A-Z0-9_]+\s*=/i.test(statement)
      || /^START\s+TRANSACTION$/i.test(statement)
      || /^BEGIN$/i.test(statement)
      || /^COMMIT$/i.test(statement)
      || /^LOCK\s+TABLES\b[\s\S]*$/i.test(statement)
      || /^UNLOCK\s+TABLES$/i.test(statement)
      || /^ALTER\s+TABLE\s+`[A-Za-z0-9_]+`\s+(?:DISABLE|ENABLE)\s+KEYS$/i.test(statement)) {
      continue;
    }

    if (/^SET\s+FOREIGN_KEY_CHECKS\s*=\s*[01]$/i.test(statement)) continue;
    if (/^SET\s+AUTOCOMMIT\s*=\s*[01]$/i.test(statement)) continue;

    const dropMatch = statement.match(/^DROP TABLE IF EXISTS `([A-Za-z0-9_]+)`$/i);
    const createMatch = statement.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+`([A-Za-z0-9_]+)`\s*\([\s\S]+\)(?:\s+[\s\S]+)?$/i);
    const insertMatch = statement.match(/^INSERT INTO\s+`([A-Za-z0-9_]+)`(?:\s+\([\s\S]*\))?\s+VALUES\s+[\s\S]+$/i);
    const alterMatch = statement.match(/^ALTER TABLE\s+`([A-Za-z0-9_]+)`\s+([\s\S]+)$/i);

    if (dropMatch) {
      if (pendingCreate || createdTables.has(dropMatch[1]) || !allowedTables.has(dropMatch[1])) throw new Error('The SQL backup contains an unsupported table.');
      pendingCreate = dropMatch[1];
    } else if (createMatch) {
      if (!allowedTables.has(createMatch[1]) || createdTables.has(createMatch[1]) || (pendingCreate && pendingCreate !== createMatch[1])) {
        throw new Error('The SQL backup has an invalid table definition.');
      }
      if (!pendingCreate) validated.push(`DROP TABLE IF EXISTS ${mysql.escapeId(createMatch[1])}`);
      pendingCreate = null;
      createdTables.add(createMatch[1]);
    } else if (insertMatch) {
      if (!allowedTables.has(insertMatch[1]) || !createdTables.has(insertMatch[1])) {
        throw new Error('The SQL backup contains data for an unsupported table.');
      }
    } else if (alterMatch) {
      if (!allowedTables.has(alterMatch[1]) || !createdTables.has(alterMatch[1])) {
        throw new Error('The SQL backup contains an unsupported table alteration.');
      }
    } else {
      const command = statement.match(/^[A-Za-z]+(?:\s+[A-Za-z]+)?/)?.[0] || 'unknown';
      throw new Error(`The SQL backup contains an unsupported ${command} command.`);
    }

    validated.push(statement);
  }

  if (pendingCreate) throw new Error('The SQL backup is missing a table definition.');
  if (createdTables.size !== allowedTables.size || [...allowedTables].some((table) => !createdTables.has(table))) {
    throw new Error('The SQL backup does not contain all tables required by this application.');
  }
  return ['SET FOREIGN_KEY_CHECKS=0', ...validated, 'SET FOREIGN_KEY_CHECKS=1'];
};

const createDatabaseBackup = async (directory = databaseBackupDirectory) => {
  const [tables] = await db.promise().query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tableNames = tables.map((table) => table[Object.keys(table)[0]]);
  const statements = ['SET FOREIGN_KEY_CHECKS=0;'];

  for (const tableName of tableNames) {
    const escapedTableName = mysql.escapeId(tableName);
    const [definitions] = await db.promise().query(`SHOW CREATE TABLE ${escapedTableName}`);
    const createStatement = definitions[0]['Create Table'];
    const [rows] = await db.promise().query(`SELECT * FROM ${escapedTableName}`);

    statements.push(`DROP TABLE IF EXISTS ${escapedTableName};`, `${createStatement};`);
    const columns = rows.length ? Object.keys(rows[0]) : (await db.promise().query(`SHOW COLUMNS FROM ${escapedTableName}`))[0].map(({ Field }) => Field);
    for (let offset = 0; offset < rows.length; offset += 100) {
      const values = rows.slice(offset, offset + 100).map((row) => (
        `(${columns.map((column) => {
          const value = row[column];
          return value !== null && typeof value === 'object' && !Buffer.isBuffer(value)
            ? mysql.escape(JSON.stringify(value))
            : mysql.escape(value);
        }).join(', ')})`
      ));
      statements.push(`INSERT INTO ${escapedTableName} (${columns.map((column) => mysql.escapeId(column)).join(', ')}) VALUES\n${values.join(',\n')};`);
    }
  }

  statements.push('SET FOREIGN_KEY_CHECKS=1;');
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const filename = `kalakbay-backup-${timestamp}-${crypto.randomUUID()}.sql`;
  const temporaryPath = path.join(directory, `${filename}.tmp`);
  const backupPath = path.join(directory, filename);

  try {
    await fs.promises.writeFile(temporaryPath, `${statements.join('\n\n')}\n`, 'utf8');
    await fs.promises.rename(temporaryPath, backupPath);
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return { filename, size: (await fs.promises.stat(backupPath)).size };
};

const listDatabaseBackups = async () => {
  const files = await fs.promises.readdir(databaseBackupDirectory);
  const backups = await Promise.all(files
    .filter((filename) => /^kalakbay-backup-\d{8}T\d{6}Z-[a-f0-9-]{36}\.sql$/.test(filename))
    .map(async (filename) => {
      const stats = await fs.promises.stat(path.join(databaseBackupDirectory, filename));
      return { filename, size: stats.size, created_at: stats.mtime.toISOString() };
    }));
  return backups.sort((first, second) => second.created_at.localeCompare(first.created_at));
};

const notifyAllUsers = (actorId, message) => {
  db.query(
    "INSERT INTO notifications (recipient_id, actor_id, message) SELECT id, ?, ? FROM users WHERE role NOT IN ('psychometrician', 'user')",
    [actorId, message],
    (err) => {
      if (err) console.error('Failed to create system notification:', err.message);
    }
  );
};

const notifyChatUsers = (actorId, message, recipientId = null, onComplete = () => {}) => {
  const recipientFilter = recipientId === null
    ? "id <> ? AND role IN ('superadmin', 'admin', 'social_worker', 'psychometrician', 'user')"
    : "id = ? AND id <> ? AND role IN ('superadmin', 'admin', 'social_worker', 'psychometrician', 'user')";
  const values = recipientId === null
    ? [actorId, message, actorId]
    : [actorId, message, recipientId, actorId];
  db.query(
    `INSERT INTO notifications (recipient_id, actor_id, message)
     SELECT id, ?, ? FROM users WHERE ${recipientFilter}`,
    values,
    (error) => {
      if (error) console.error('Failed to create chat notification:', error.message);
      onComplete(error);
    }
  );
};

const createPasswordResetCodesTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      user_id INT PRIMARY KEY,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_password_reset_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Failed to create password reset table:', err.message);
    else console.log('Password reset table is ready.');
  });
};

const createUsersTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      middle_initial VARCHAR(30) NULL,
      last_name VARCHAR(100) NOT NULL,
      age INT NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      position VARCHAR(100) NOT NULL DEFAULT '',
      profile_picture VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.error('Failed to create users table:', err.message);
      process.exit(1);
    }
    console.log('Users table is ready.');

    const seedBootstrapAdmin = () => {
      const bootstrapAdmin = [
        'Agnes',
        'C.',
        'Aragon',
        30,
        'superadmin@boystown.org',
        bcrypt.hashSync('superadmin123', 10),
        'superadmin',
        'Officer-in-Charge'
      ];
      db.query(
        `INSERT INTO users (first_name, middle_initial, last_name, age, email, password, role, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name = ?, middle_initial = ?, last_name = ?, role = ?, position = ?`,
        [...bootstrapAdmin, bootstrapAdmin[0], bootstrapAdmin[1], bootstrapAdmin[2], bootstrapAdmin[6], bootstrapAdmin[7]],
        (seedError) => {
          if (seedError) console.error('Failed to seed bootstrap superadmin:', seedError.message);
          createPasswordResetCodesTable();
        }
      );
    };

    const ensureMiddleInitialColumn = () => {
      db.query("SHOW COLUMNS FROM users LIKE 'middle_initial'", (columnError, columns) => {
        if (columnError) {
          console.error('Failed to inspect users table:', columnError.message);
          process.exit(1);
        }
        if (columns.length) {
          seedBootstrapAdmin();
          return;
        }
        db.query('ALTER TABLE users ADD COLUMN middle_initial VARCHAR(30) NULL AFTER first_name', (migrationError) => {
          if (migrationError) {
            console.error('Failed to add users.middle_initial column:', migrationError.message);
            process.exit(1);
          }
          console.log('Added the missing users.middle_initial column.');
          db.query(
            `UPDATE users
             SET middle_initial = CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(first_name), ' ', -1), '.', 1), '.'),
                 first_name = SUBSTRING_INDEX(TRIM(first_name), ' ', 1)
             WHERE middle_initial IS NULL AND TRIM(first_name) REGEXP '^[^ ]+ [A-Za-z]\\.?$'`,
            (backfillError) => {
              if (backfillError) {
                console.error('Failed to migrate existing user middle initials:', backfillError.message);
                process.exit(1);
              }
              seedBootstrapAdmin();
            }
          );
        });
      });
    };

    const ensureProfilePictureColumn = () => {
      db.query("SHOW COLUMNS FROM users LIKE 'profile_picture'", (columnError, columns) => {
        if (columnError) {
          console.error('Failed to inspect users table:', columnError.message);
          process.exit(1);
        }
        if (columns.length) {
          ensureMiddleInitialColumn();
          return;
        }
        db.query(
          'ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) NULL',
          (migrationError) => {
            if (migrationError) {
              console.error('Failed to add users.profile_picture column:', migrationError.message);
              process.exit(1);
            }
            console.log('Added the missing users.profile_picture column.');
            ensureMiddleInitialColumn();
          }
        );
      });
    };

    const ensurePositionColumn = () => {
      db.query("SHOW COLUMNS FROM users LIKE 'position'", (columnError, columns) => {
        if (columnError) {
          console.error('Failed to inspect users table:', columnError.message);
          process.exit(1);
        }
        if (columns.length) {
          ensureProfilePictureColumn();
          return;
        }
        db.query(
          "ALTER TABLE users ADD COLUMN position VARCHAR(100) NOT NULL DEFAULT ''",
          (migrationError) => {
            if (migrationError) {
              console.error('Failed to add users.position column:', migrationError.message);
              process.exit(1);
            }
            console.log('Added the missing users.position column.');
            ensureProfilePictureColumn();
          }
        );
      });
    };

    const ensureRoleColumn = () => {
      db.query("SHOW COLUMNS FROM users LIKE 'role'", (columnError, columns) => {
        if (columnError) {
          console.error('Failed to inspect users table:', columnError.message);
          process.exit(1);
        }

        if (columns.length) {
          ensurePositionColumn();
          return;
        }

        db.query(
          "ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'",
          (migrationError) => {
            if (migrationError) {
              console.error('Failed to add users.role column:', migrationError.message);
              process.exit(1);
            }
            console.log('Added the missing users.role column.');
            ensurePositionColumn();
          }
        );
      });
    };

    ensureRoleColumn();
  });
};

const createClientDocumentsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS client_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL UNIQUE,
      mime_type VARCHAR(150),
      file_size BIGINT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_client_documents_client_id (client_id),
      CONSTRAINT fk_client_documents_client
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.error('Failed to create client documents table:', err.message);
      process.exit(1);
    }
    console.log('Client documents table is ready.');
  });
};

const createHomeReportsTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS home_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      home_name VARCHAR(100) NOT NULL,
      report_type ENUM('monthly', 'yearly') NOT NULL,
      report_period VARCHAR(7) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL UNIQUE,
      mime_type VARCHAR(150),
      file_size BIGINT UNSIGNED NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_home_reports_period (home_name, report_type, report_period, uploaded_at)
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create home reports table:', err.message);
      process.exit(1);
    }
    console.log('Home reports table is ready.');
  });
};

const createNotificationsTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_id INT NOT NULL,
      actor_id INT NULL,
      message VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME NULL,
      INDEX idx_notifications_recipient (recipient_id, read_at, created_at),
      CONSTRAINT fk_notifications_recipient
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create notifications table:', err.message);
      process.exit(1);
    }
    console.log('Notifications table is ready.');
  });
};

const createTeamChatTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS team_chat_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      message VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_team_chat_sender (sender_id),
      CONSTRAINT fk_team_chat_sender
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (error) => {
    if (error) {
      console.error('Failed to create team chat table:', error.message);
      process.exit(1);
    }
    console.log('Team chat table is ready.');
      ensureChatColumn('team_chat_messages', 'deleted_at', 'created_at');
  });
};

const createTeamChatClearTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS team_chat_conversation_clears (
      user_id INT PRIMARY KEY,
      cleared_through_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      cleared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_team_chat_clear_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (error) => {
    if (error) {
      console.error('Failed to create team chat clear table:', error.message);
      process.exit(1);
    }
    console.log('Team chat conversation clear table is ready.');
  });
};

const createPrivateChatTable = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS private_chat_messages (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      recipient_id INT NOT NULL,
      message VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME NULL,
      deleted_at DATETIME NULL,
      INDEX idx_private_chat_sender_recipient (sender_id, recipient_id, id),
      INDEX idx_private_chat_recipient_sender (recipient_id, sender_id, id),
      CONSTRAINT fk_private_chat_sender
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_private_chat_recipient
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (error) => {
    if (error) {
      console.error('Failed to create private chat table:', error.message);
      process.exit(1);
    }
    console.log('Private chat table is ready.');
      ensureChatColumn('private_chat_messages', 'deleted_at', 'created_at', () => {
        ensureChatColumn('private_chat_messages', 'sender_hidden_at', 'deleted_at', () => {
          ensureChatColumn('private_chat_messages', 'recipient_hidden_at', 'sender_hidden_at');
        });
      });
  });
};

const ensureChatColumn = (tableName, columnName, afterColumn, onComplete = () => {}) => {
  const escapedTableName = mysql.escapeId(tableName);
  const escapedColumnName = mysql.escapeId(columnName);
  const escapedAfterColumn = mysql.escapeId(afterColumn);
  db.query(`SHOW COLUMNS FROM ${escapedTableName} LIKE ?`, [columnName], (lookupError, columns) => {
    if (lookupError) {
      console.error(`Failed to inspect ${tableName}:`, lookupError.message);
      process.exit(1);
      return;
    }
    if (columns.length) {
      onComplete();
      return;
    }
    db.query(`ALTER TABLE ${escapedTableName} ADD COLUMN ${escapedColumnName} DATETIME NULL AFTER ${escapedAfterColumn}`, (migrationError) => {
      if (migrationError) {
        console.error(`Failed to add ${tableName}.${columnName}:`, migrationError.message);
        process.exit(1);
        return;
      }
      onComplete();
    });
  });
};

const createClientTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      home_name VARCHAR(100) NOT NULL,
      past_picture VARCHAR(255),
      present_picture VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL DEFAULT '',
      middle_initial VARCHAR(30) NULL,
      last_name VARCHAR(150) NOT NULL DEFAULT '',
      age INT,
      sex VARCHAR(50),
      civil_status VARCHAR(100),
      religion VARCHAR(100),
      occupation_income VARCHAR(255),
      birthdate DATE,
      birthplace VARCHAR(255),
      city_address VARCHAR(255),
      barangay VARCHAR(150),
      source_of_referral VARCHAR(255),
      date_admitted DATE,
      facility_return_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      case_category VARCHAR(255),
      educational_attainment VARCHAR(255),
      school_last_attended VARCHAR(255),
      grade_level VARCHAR(100),
      age_when_found INT,
      date_time_when_found DATETIME,
      place_where_found VARCHAR(255),
      present_whereabouts VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.error('Failed to create clients table:', err.message);
      process.exit(1);
    }
    console.log('Clients table is ready.');

    const ensureClientNameColumns = () => {
      const columnsToAdd = [
        ['first_name', "VARCHAR(100) NOT NULL DEFAULT ''"],
        ['middle_initial', 'VARCHAR(30) NULL'],
        ['last_name', "VARCHAR(150) NOT NULL DEFAULT ''"],
        ['facility_return_count', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0']
      ];
      const ensureColumn = (index) => {
        if (index === columnsToAdd.length) {
          db.query("SELECT id, name FROM clients WHERE first_name = '' OR last_name = ''", (selectError, rows) => {
            if (selectError) {
              console.error('Failed to load client names for migration:', selectError.message);
              process.exit(1);
            }
            const migrateName = (rowIndex) => {
              if (rowIndex === rows.length) {
                createClientDocumentsTable();
                return;
              }
              const row = rows[rowIndex];
              const parts = String(row.name || '').trim().split(/\s+/).filter(Boolean);
              const firstName = parts.shift() || '';
              let middleInitial = null;
              if (parts.length > 1 && /^[A-Za-z]\.?$/.test(parts[0])) {
                middleInitial = parts.shift();
              }
              const lastName = parts.join(' ');
              db.query(
                'UPDATE clients SET first_name = ?, middle_initial = ?, last_name = ? WHERE id = ?',
                [firstName, middleInitial, lastName, row.id],
                (updateError) => {
                  if (updateError) {
                    console.error('Failed to migrate a client name:', updateError.message);
                    process.exit(1);
                  }
                  migrateName(rowIndex + 1);
                }
              );
            };
            migrateName(0);
          });
          return;
        }

        const [column, definition] = columnsToAdd[index];
        db.query(`SHOW COLUMNS FROM clients LIKE '${column}'`, (columnError, rows) => {
          if (columnError) {
            console.error('Failed to inspect clients table:', columnError.message);
            process.exit(1);
          }
          if (rows.length) {
            ensureColumn(index + 1);
            return;
          }
          db.query(`ALTER TABLE clients ADD COLUMN ${column} ${definition}`, (migrationError) => {
            if (migrationError) {
              console.error(`Failed to add clients.${column} column:`, migrationError.message);
              process.exit(1);
            }
            ensureColumn(index + 1);
          });
        });
      };
      ensureColumn(0);
    };

    ensureClientNameColumns();
  });
};

db.connect((err) => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1);
  }

  console.log('MySQL connected successfully!');
  createUsersTable();
  createClientTable();
  createHomeReportsTable();
  createNotificationsTable();
  createTeamChatTable();
  createTeamChatClearTable();
  createPrivateChatTable();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' });
});

app.get('/api/database-backups', requireAuth, requireBackupAccess, async (req, res) => {
  try {
    res.json(await listDatabaseBackups());
  } catch (error) {
    console.error('Failed to list database backups:', error.message);
    res.status(500).json({ message: 'Could not load database backups.' });
  }
});

app.post('/api/database-backups', requireAuth, requireBackupAccess, async (req, res) => {
  try {
    const backup = await createDatabaseBackup();
    res.status(201).json({ ...backup, created_at: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to create database backup:', error.message);
    res.status(500).json({ message: 'Could not create the database backup.' });
  }
});

app.delete('/api/database-backups/:filename', requireAuth, requireBackupAccess, async (req, res) => {
  const { filename } = req.params;
  if (!/^kalakbay-backup-\d{8}T\d{6}Z-[a-f0-9-]{36}\.sql$/.test(filename)) {
    return res.status(400).json({ message: 'Invalid database backup filename.' });
  }

  try {
    await fs.promises.unlink(path.join(databaseBackupDirectory, filename));
    res.json({ message: 'Database backup deleted.' });
  } catch (error) {
    res.status(error.code === 'ENOENT' ? 404 : 500).json({ message: 'Could not delete the database backup.' });
  }
});

app.post('/api/database-backups/import', requireAuth, requireBackupAccess, uploadDatabaseBackup, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a SQL backup file to import.' });
  if (path.extname(req.file.originalname).toLowerCase() !== '.sql') {
    return res.status(400).json({ message: 'Only .sql database backups can be imported.' });
  }
  if (databaseImportInProgress) {
    return res.status(409).json({ message: 'Another database restore is already in progress.' });
  }

  let safetyBackup;
  let foreignKeysDisabled = false;
  databaseImportInProgress = true;
  try {
    const sql = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer);
    const statements = await validateDatabaseBackup(sql);
    safetyBackup = await createDatabaseBackup(databaseSafetyBackupDirectory);

    for (const statement of statements) {
      await db.promise().query(statement);
      if (/^SET\s+FOREIGN_KEY_CHECKS\s*=\s*0$/i.test(statement)) foreignKeysDisabled = true;
      if (/^SET\s+FOREIGN_KEY_CHECKS\s*=\s*1$/i.test(statement)) foreignKeysDisabled = false;
    }

    res.json({
      message: 'Database backup imported successfully.',
      safety_backup: safetyBackup.filename
    });
  } catch (error) {
    console.error('Failed to import database backup:', error.message);
    res.status(safetyBackup ? 500 : 400).json({
      message: safetyBackup
        ? `Import failed. A safety backup of the previous database was saved as ${safetyBackup.filename}.`
        : error instanceof TypeError
          ? 'The selected file is not valid UTF-8 SQL.'
          : error.message
    });
  } finally {
    if (foreignKeysDisabled) {
      await db.promise().query('SET FOREIGN_KEY_CHECKS=1').catch((error) => {
        console.error('Failed to restore foreign key checks after database import:', error.message);
      });
    }
    databaseImportInProgress = false;
  }
});

app.get('/api/database-backups/:filename/download', requireAuth, requireBackupAccess, (req, res) => {
  const { filename } = req.params;
  if (!/^kalakbay-backup-\d{8}T\d{6}Z-[a-f0-9-]{36}\.sql$/.test(filename)) {
    return res.status(400).json({ message: 'Invalid database backup filename.' });
  }
  res.download(path.join(databaseBackupDirectory, filename), filename, (error) => {
    if (error && !res.headersSent) {
      res.status(error.code === 'ENOENT' ? 404 : 500).json({ message: 'Could not download the database backup.' });
    }
  });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  db.query(
    'SELECT id, actor_id, message, created_at, read_at FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.auth.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to load notifications.', error: err.message });
      }
      db.query(
        'SELECT COUNT(*) AS unread_count FROM notifications WHERE recipient_id = ? AND read_at IS NULL',
        [req.auth.id],
        (countError, counts) => {
          if (countError) {
            return res.status(500).json({ message: 'Failed to count unread notifications.', error: countError.message });
          }
          res.json({ notifications: rows, unread_count: Number(counts[0].unread_count) });
        }
      );
    }
  );
});

app.get('/api/team-chat/messages', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const afterId = req.query.after_id === undefined ? null : Number(req.query.after_id);
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) {
    return res.status(400).json({ message: 'Invalid chat message cursor.' });
  }

  const query = `
    SELECT messages.id, messages.sender_id, messages.message, messages.created_at, messages.deleted_at,
           users.first_name, users.middle_initial, users.last_name, users.role
    FROM team_chat_messages AS messages
    INNER JOIN users ON users.id = messages.sender_id
    WHERE messages.id > COALESCE((
      SELECT cleared_through_id FROM team_chat_conversation_clears WHERE user_id = ?
    ), 0)
    ${afterId === null ? '' : 'AND messages.id > ?'}
    ORDER BY messages.id ${afterId === null ? 'DESC' : 'ASC'}
    LIMIT 100
  `;
  const params = afterId === null ? [req.auth.id] : [req.auth.id, afterId];
  db.query(query, params, (error, rows) => {
    if (error) {
      return res.status(500).json({ message: 'Could not load team chat messages.' });
    }
    res.json({ messages: afterId === null ? rows.reverse() : rows });
  });
});

app.delete('/api/team-chat/conversation', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  db.query('SELECT COALESCE(MAX(id), 0) AS last_message_id FROM team_chat_messages', (lookupError, rows) => {
    if (lookupError) return res.status(500).json({ message: 'Could not find the latest team chat message.' });
    const lastMessageId = Number(rows[0].last_message_id);
    db.query(
      `INSERT INTO team_chat_conversation_clears (user_id, cleared_through_id, cleared_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE cleared_through_id = GREATEST(cleared_through_id, ?), cleared_at = CURRENT_TIMESTAMP`,
      [req.auth.id, lastMessageId, lastMessageId],
      (clearError) => {
        if (clearError) return res.status(500).json({ message: 'Could not delete the team conversation from your inbox.' });
        db.query(
          "DELETE FROM notifications WHERE recipient_id = ? AND message LIKE 'New team chat message from %'",
          [req.auth.id],
          (notificationError) => {
            if (notificationError) console.error('Failed to clear team chat notifications:', notificationError.message);
            res.json({ message: 'Team conversation removed from your inbox.' });
          }
        );
      }
    );
  });
});

app.post('/api/team-chat/messages', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 2000) {
    return res.status(400).json({ message: 'Enter a message between 1 and 2,000 characters.' });
  }

  db.query('INSERT INTO team_chat_messages (sender_id, message) VALUES (?, ?)', [req.auth.id, message], (insertError, result) => {
    if (insertError) {
      return res.status(500).json({ message: 'Could not send the team chat message.' });
    }

    db.query(
      `SELECT messages.id, messages.sender_id, messages.message, messages.created_at, messages.deleted_at,
              users.first_name, users.middle_initial, users.last_name, users.role
       FROM team_chat_messages AS messages
       INNER JOIN users ON users.id = messages.sender_id
       WHERE messages.id = ?`,
      [result.insertId],
      (lookupError, rows) => {
        if (lookupError || !rows[0]) {
          return res.status(500).json({ message: 'Message was sent but could not be loaded.' });
        }
        const senderName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || 'A team member';
        notifyChatUsers(req.auth.id, `New team chat message from ${senderName}.`, null, () => {
          res.status(201).json({ message: rows[0] });
        });
      }
    );
  });
});

app.delete('/api/team-chat/messages/:messageId', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: 'Invalid team chat message ID.' });
  }

  db.query(
    'UPDATE team_chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id = ? AND deleted_at IS NULL',
    [messageId, req.auth.id],
    (error, result) => {
      if (error) return res.status(500).json({ message: 'Could not delete the team chat message.' });
      if (!result.affectedRows) return res.status(404).json({ message: 'Message not found or you cannot delete it.' });
      res.json({ message: 'Team chat message deleted.' });
    }
  );
});

app.get('/api/team-chat/users', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  db.query(
    `SELECT id, first_name, middle_initial, last_name, role
     FROM users WHERE id <> ? ORDER BY first_name, last_name`,
    [req.auth.id],
    (error, users) => {
      if (error) return res.status(500).json({ message: 'Could not load chat recipients.' });
      res.json({ users });
    }
  );
});

app.get('/api/team-chat/private/:userId/messages', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const recipientId = Number(req.params.userId);
  const afterId = req.query.after_id === undefined ? null : Number(req.query.after_id);
  if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid chat recipient.' });
  }
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) {
    return res.status(400).json({ message: 'Invalid chat message cursor.' });
  }

  db.query(
    'SELECT id FROM users WHERE id = ?',
    [recipientId],
    (userError, users) => {
      if (userError) return res.status(500).json({ message: 'Could not verify the chat recipient.' });
      if (!users.length) return res.status(404).json({ message: 'Chat recipient not found.' });

      db.query(
        'UPDATE private_chat_messages SET read_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL AND recipient_hidden_at IS NULL',
        [recipientId, req.auth.id],
        (readError) => {
          if (readError) return res.status(500).json({ message: 'Could not mark private messages as read.' });

          const query = `
                 SELECT messages.id, messages.sender_id, messages.recipient_id, messages.message,
                   messages.created_at, messages.read_at, messages.deleted_at,
                   users.first_name, users.middle_initial, users.last_name, users.role
            FROM private_chat_messages AS messages
            INNER JOIN users ON users.id = messages.sender_id
            WHERE ((messages.sender_id = ? AND messages.recipient_id = ?)
                   OR (messages.sender_id = ? AND messages.recipient_id = ?))
              AND ((messages.sender_id = ? AND messages.sender_hidden_at IS NULL)
                   OR (messages.recipient_id = ? AND messages.recipient_hidden_at IS NULL))
            ${afterId === null ? '' : 'AND messages.id > ?'}
            ORDER BY messages.id ${afterId === null ? 'DESC' : 'ASC'}
            LIMIT 100
          `;
          const params = [req.auth.id, recipientId, recipientId, req.auth.id, req.auth.id, req.auth.id];
          if (afterId !== null) params.push(afterId);
          db.query(query, params, (messageError, messages) => {
            if (messageError) return res.status(500).json({ message: 'Could not load private messages.' });
            res.json({ messages: afterId === null ? messages.reverse() : messages });
          });
        }
      );
    }
  );
});

app.delete('/api/team-chat/private/:userId/conversation', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const otherUserId = Number(req.params.userId);
  if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid private conversation.' });
  }

  db.query(
    `UPDATE private_chat_messages
     SET sender_hidden_at = CASE WHEN sender_id = ? THEN COALESCE(sender_hidden_at, CURRENT_TIMESTAMP) ELSE sender_hidden_at END,
         recipient_hidden_at = CASE WHEN recipient_id = ? THEN COALESCE(recipient_hidden_at, CURRENT_TIMESTAMP) ELSE recipient_hidden_at END
     WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
       AND ((sender_id = ? AND sender_hidden_at IS NULL) OR (recipient_id = ? AND recipient_hidden_at IS NULL))`,
    [req.auth.id, req.auth.id, req.auth.id, otherUserId, otherUserId, req.auth.id, req.auth.id, req.auth.id],
    (error, result) => {
      if (error) return res.status(500).json({ message: 'Could not delete this conversation from your inbox.' });
      if (!result.affectedRows) return res.status(404).json({ message: 'Conversation not found.' });

      db.query(
        "DELETE FROM notifications WHERE recipient_id = ? AND actor_id = ? AND message LIKE 'New private message from %'",
        [req.auth.id, otherUserId],
        (notificationError) => {
          if (notificationError) console.error('Failed to clear private chat notifications:', notificationError.message);
          res.json({ message: 'Conversation removed from your inbox.' });
        }
      );
    }
  );
});

app.post('/api/team-chat/private/:userId/messages', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const recipientId = Number(req.params.userId);
  const message = String(req.body.message || '').trim();
  if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'Choose a valid chat recipient.' });
  }
  if (!message || message.length > 2000) {
    return res.status(400).json({ message: 'Enter a message between 1 and 2,000 characters.' });
  }

  db.query('SELECT id FROM users WHERE id = ?', [recipientId], (userError, users) => {
    if (userError) return res.status(500).json({ message: 'Could not verify the chat recipient.' });
    if (!users.length) return res.status(404).json({ message: 'Chat recipient not found.' });

    db.query(
      'INSERT INTO private_chat_messages (sender_id, recipient_id, message) VALUES (?, ?, ?)',
      [req.auth.id, recipientId, message],
      (insertError, result) => {
        if (insertError) return res.status(500).json({ message: 'Could not send the private message.' });

        db.query(
            `SELECT messages.id, messages.sender_id, messages.recipient_id, messages.message,
              messages.created_at, messages.read_at, messages.deleted_at,
                  users.first_name, users.middle_initial, users.last_name, users.role
           FROM private_chat_messages AS messages
           INNER JOIN users ON users.id = messages.sender_id
           WHERE messages.id = ?`,
          [result.insertId],
          (lookupError, rows) => {
            if (lookupError || !rows[0]) return res.status(500).json({ message: 'Message was sent but could not be loaded.' });
            const senderName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ') || 'A team member';
            notifyChatUsers(req.auth.id, `New private message from ${senderName}.`, recipientId, () => {
              res.status(201).json({ message: rows[0] });
            });
          }
        );
      }
    );
  });
});

app.delete('/api/team-chat/private/messages/:messageId', requireAuth, requireRoles(teamChatRoles), (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ message: 'Invalid private message ID.' });
  }

  db.query(
    'UPDATE private_chat_messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id = ? AND deleted_at IS NULL',
    [messageId, req.auth.id],
    (error, result) => {
      if (error) return res.status(500).json({ message: 'Could not delete the private message.' });
      if (!result.affectedRows) return res.status(404).json({ message: 'Message not found or you cannot delete it.' });
      res.json({ message: 'Private message deleted.' });
    }
  );
});

app.put('/api/notifications/read', requireAuth, (req, res) => {
  db.query(
    'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = ? AND read_at IS NULL',
    [req.auth.id],
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to mark notifications as read.', error: err.message });
      }
      res.json({ message: 'Notifications marked as read.' });
    }
  );
});

app.delete('/api/notifications/:notificationId', requireAuth, (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: 'Invalid notification ID.' });
  }

  db.query(
    'DELETE FROM notifications WHERE id = ? AND recipient_id = ?',
    [notificationId, req.auth.id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to delete notification.', error: err.message });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ message: 'Notification not found.' });
      }
      res.json({ message: 'Notification deleted.' });
    }
  );
});

app.get('/api/dashboard', requireAuth, requireRoles(['superadmin', 'admin', 'social_worker', 'psychometrician', 'user']), (req, res) => {
  if (['psychometrician', 'user'].includes(req.auth.role)) {
    db.query('SELECT id, name, age, home_name, present_picture FROM clients ORDER BY name', (clientError, rows) => {
      if (clientError) {
        return res.status(500).json({ message: 'Could not load behavior overview.', error: clientError.message });
      }

        const psychometricianClients = rows.map((row) => ({
          name: row.name,
          age: row.age === null ? null : Number(row.age),
          home_name: row.home_name,
          present_picture: row.present_picture
        }));
        return res.json({
          role: req.auth.role,
          totals: {
            clients: psychometricianClients.length,
            homes: new Set(psychometricianClients.map((client) => client.home_name)).size
          },
          psychometricianClients
        });
    });
    return;
  }

  db.query(
    'SELECT home_name, COUNT(*) AS client_count FROM clients GROUP BY home_name ORDER BY home_name',
    (clientError, clientRows) => {
      if (clientError) {
        return res.status(500).json({ message: 'Could not load dashboard data.', error: clientError.message });
      }

      const clientsByHome = clientRows.map((row) => ({
        home_name: row.home_name,
        client_count: Number(row.client_count)
      }));
      const clientCount = clientsByHome.reduce((total, home) => total + home.client_count, 0);
      const summary = {
        role: req.auth.role,
        totals: {
          clients: clientCount,
          homes: clientsByHome.length
        },
        clientsByHome
      };

      if (req.auth.role !== 'superadmin') {
        return res.json(summary);
      }

      db.query('SELECT role, COUNT(*) AS account_count FROM users GROUP BY role ORDER BY role', (userError, userRows) => {
        if (userError) {
          return res.status(500).json({ message: 'Could not load account summary.', error: userError.message });
        }

        const usersByRole = userRows.map((row) => ({
          role: row.role,
          account_count: Number(row.account_count)
        }));
        summary.totals.accounts = usersByRole.reduce((total, role) => total + role.account_count, 0);
        summary.usersByRole = usersByRole;
        res.json(summary);
      });
    }
  );
});

app.get('/users', requireAuth, requireSuperadmin, (req, res) => {
  db.query('SELECT id, first_name, last_name, age, email, created_at FROM users', (err, result) => {
    if (err) return res.status(500).json({ message: 'Error fetching users', error: err.message });
    res.json(result);
  });
});

app.get('/api/search/clients', requireAuth, requireRoles(['superadmin', 'admin', 'social_worker', 'psychometrician', 'user']), (req, res) => {
  const name = String(req.query.name || '').trim();
  if (name.length < 2) {
    return res.json([]);
  }

  const searchPattern = `%${name.slice(0, 100)}%`;
  const isPsychometrician = ['psychometrician', 'user'].includes(req.auth.role);
  const sql = isPsychometrician
    ? 'SELECT name, age FROM clients WHERE name LIKE ? ORDER BY name LIMIT 10'
    : 'SELECT id, name, age, home_name FROM clients WHERE name LIKE ? ORDER BY name LIMIT 10';

  db.query(sql, [searchPattern], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Client name search failed.', error: err.message });
    }
    res.json(rows.map((row) => ({
      ...row,
      age: row.age === null ? null : Number(row.age)
    })));
  });
});

app.get('/api/clients', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  const { home_name } = req.query;
  let query = `SELECT ${clientSelectColumns} FROM clients`;
  const params = [];

  if (home_name) {
    query += ' WHERE home_name = ?';
    params.push(home_name);
  }

  db.query(query, params, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error fetching clients', error: err.message });
    }
    res.json(result);
  });
});

app.get('/api/clients/:id', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  const { id } = req.params;

  db.query(`SELECT ${clientSelectColumns} FROM clients WHERE id = ?`, [id], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Error fetching client', error: err.message });
    }

    if (!rows[0]) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    res.json(rows[0]);
  });
});

app.get('/api/clients/:id/documents', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  db.query(
    'SELECT id, original_name, mime_type, file_size, uploaded_at FROM client_documents WHERE client_id = ? ORDER BY uploaded_at DESC',
    [req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to load client documents.', error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/api/clients/:id/documents', requireAuth, requireRoles(caseManagementRoles), uploadClientDocuments, (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ message: 'Choose at least one document to upload.' });
  }

  db.query('SELECT id FROM clients WHERE id = ?', [req.params.id], (clientError, clients) => {
    if (clientError || !clients[0]) {
      files.forEach((file) => fs.promises.unlink(path.join(documentDirectory, file.filename)).catch(() => {}));
      if (clientError) {
        return res.status(500).json({ message: 'Could not verify client.', error: clientError.message });
      }
    }

    const documentRows = files.map((file) => {
      const originalName = file.originalname
        .split(/[\\/]/)
        .pop()
        .replace(/[\r\n"]/g, '_')
        .slice(0, 255) || 'document';
      return [req.params.id, originalName, file.filename, file.mimetype, file.size];
    });

    db.query(
      'INSERT INTO client_documents (client_id, original_name, stored_name, mime_type, file_size) VALUES ?',
      [documentRows],
      (insertError, result) => {
        if (insertError) {
          files.forEach((file) => fs.promises.unlink(path.join(documentDirectory, file.filename)).catch(() => {}));
          return res.status(500).json({ message: 'Failed to save client documents.', error: insertError.message });
        }
        res.status(201).json({ message: 'Documents uploaded successfully.', count: result.affectedRows });
      }
    );
  });
});

const splitClientName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || '';
  const middleInitial = parts.length > 1 && /^[A-Za-z]\.?$/.test(parts[0]) ? parts.shift() : '';
  return { firstName, middleInitial, lastName: parts.join(' ') };
};

const getClientNameParts = (data) => {
  const legacy = splitClientName(data.name);
  const firstName = String(data.first_name || legacy.firstName).trim();
  const middleInitial = String(data.middle_initial || legacy.middleInitial).trim();
  const lastName = String(data.last_name || legacy.lastName).trim();
  return {
    firstName,
    middleInitial,
    lastName,
    fullName: [firstName, middleInitial, lastName].filter(Boolean).join(' ')
  };
};

app.get('/api/clients/:id/documents/:documentId/download', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  db.query(
    'SELECT original_name, stored_name FROM client_documents WHERE id = ? AND client_id = ?',
    [req.params.documentId, req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to find document.', error: err.message });
      }
      if (!rows[0]) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      res.download(path.join(documentDirectory, rows[0].stored_name), rows[0].original_name, (downloadError) => {
        if (downloadError && !res.headersSent) {
          res.status(404).json({ message: 'The saved document file could not be found.' });
        }
      });
    }
  );
});

app.delete('/api/clients/:id/documents/:documentId', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  db.query(
    'SELECT stored_name FROM client_documents WHERE id = ? AND client_id = ?',
    [req.params.documentId, req.params.id],
    (findError, rows) => {
      if (findError) {
        return res.status(500).json({ message: 'Failed to find document.', error: findError.message });
      }
      if (!rows[0]) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      db.query(
        'DELETE FROM client_documents WHERE id = ? AND client_id = ?',
        [req.params.documentId, req.params.id],
        (deleteError) => {
          if (deleteError) {
            return res.status(500).json({ message: 'Failed to delete document.', error: deleteError.message });
          }
          fs.promises.unlink(path.join(documentDirectory, rows[0].stored_name)).catch(() => {});
          res.json({ message: 'Document deleted successfully.' });
        }
      );
    }
  );
});

app.get('/api/home-reports', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  const { home_name, report_type, report_period } = req.query;
  const periodIsValid = report_type === 'monthly'
    ? /^\d{4}-(0[1-9]|1[0-2])$/.test(String(report_period || ''))
    : report_type === 'yearly' && /^\d{4}$/.test(String(report_period || ''));

  if (!careHomeNames.includes(home_name) || !periodIsValid) {
    return res.status(400).json({ message: 'Choose a valid care home, report type, and period.' });
  }

  db.query(
    'SELECT id, home_name, report_type, report_period, original_name, mime_type, file_size, uploaded_at FROM home_reports WHERE home_name = ? AND report_type = ? AND report_period = ? ORDER BY uploaded_at DESC',
    [home_name, report_type, report_period],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to load home reports.', error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/api/home-reports', requireAuth, requireRoles(caseManagementRoles), uploadHomeReportFiles, (req, res) => {
  const files = req.files || [];
  const { home_name, report_type, report_period } = req.body;
  const periodIsValid = report_type === 'monthly'
    ? /^\d{4}-(0[1-9]|1[0-2])$/.test(String(report_period || ''))
    : report_type === 'yearly' && /^\d{4}$/.test(String(report_period || ''));

  const removeFiles = () => files.forEach((file) => fs.promises.unlink(path.join(documentDirectory, file.filename)).catch(() => {}));
  if (!files.length) {
    return res.status(400).json({ message: 'Choose at least one report file to upload.' });
  }
  if (!careHomeNames.includes(home_name) || !periodIsValid) {
    removeFiles();
    return res.status(400).json({ message: 'Choose a valid care home, report type, and period.' });
  }

  const reportRows = files.map((file) => {
    const originalName = file.originalname
      .split(/[\\/]/)
      .pop()
      .replace(/[\r\n"]/g, '_')
      .slice(0, 255) || 'report';
    return [home_name, report_type, report_period, originalName, file.filename, file.mimetype, file.size];
  });

  db.query(
    'INSERT INTO home_reports (home_name, report_type, report_period, original_name, stored_name, mime_type, file_size) VALUES ?',
    [reportRows],
    (err, result) => {
      if (err) {
        removeFiles();
        return res.status(500).json({ message: 'Failed to save home report files.', error: err.message });
      }
      notifyAllUsers(req.auth.id, `A ${report_type} report was uploaded to ${home_name}.`);
      res.status(201).json({ message: 'Home reports uploaded successfully.', count: result.affectedRows });
    }
  );
});

app.get('/api/home-reports/:reportId/download', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  db.query(
    'SELECT original_name, stored_name, home_name, report_type FROM home_reports WHERE id = ?',
    [req.params.reportId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to find report file.', error: err.message });
      }
      if (!rows[0]) {
        return res.status(404).json({ message: 'Report file not found.' });
      }
      res.download(path.join(documentDirectory, rows[0].stored_name), rows[0].original_name, (downloadError) => {
        if (downloadError && !res.headersSent) {
          res.status(404).json({ message: 'The saved report file could not be found.' });
        }
      });
    }
  );
});

app.delete('/api/home-reports/:reportId', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  db.query('SELECT stored_name FROM home_reports WHERE id = ?', [req.params.reportId], (findError, rows) => {
    if (findError) {
      return res.status(500).json({ message: 'Failed to find report file.', error: findError.message });
    }
    if (!rows[0]) {
      return res.status(404).json({ message: 'Report file not found.' });
    }

    db.query('DELETE FROM home_reports WHERE id = ?', [req.params.reportId], (deleteError) => {
      if (deleteError) {
        return res.status(500).json({ message: 'Failed to delete report file.', error: deleteError.message });
      }
      fs.promises.unlink(path.join(documentDirectory, rows[0].stored_name)).catch(() => {});
      notifyAllUsers(req.auth.id, `A ${rows[0].report_type} report was removed from ${rows[0].home_name}.`);
      res.json({ message: 'Report file deleted successfully.' });
    });
  });
});

app.post('/api/clients', requireAuth, requireRoles(caseManagementRoles), uploadClientImages, (req, res) => {
  const data = req.body;
  const nameParts = getClientNameParts(data);
  const requiredFields = [
    'home_name',
    'age',
    'sex',
    'civil_status',
    'religion',
    'occupation_income',
    'birthdate',
    'birthplace',
    'city_address',
    'barangay',
    'source_of_referral',
    'date_admitted',
    'case_category',
    'educational_attainment',
    'school_last_attended',
    'grade_level',
    'age_when_found',
    'date_time_when_found',
    'place_where_found',
    'present_whereabouts'
  ];

  const missing = requiredFields.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
  if (!nameParts.firstName) missing.push('first_name');
  if (!nameParts.lastName) missing.push('last_name');
  if (nameParts.middleInitial.length > 30) missing.push('middle_initial (max 30 characters)');
  if (missing.length > 0) {
    return res.status(400).json({ message: 'Missing required client fields.', missing });
  }
  const facilityReturnCount = Number(data.facility_return_count ?? 0);
  if (!Number.isInteger(facilityReturnCount) || facilityReturnCount < 0 || facilityReturnCount > 65535) {
    return res.status(400).json({ message: 'Facility return count must be a whole number from 0 to 65,535.' });
  }

  const sql = `
    INSERT INTO clients (
      home_name,
      past_picture,
      present_picture,
      name,
      first_name,
      middle_initial,
      last_name,
      age,
      sex,
      civil_status,
      religion,
      occupation_income,
      birthdate,
      birthplace,
      city_address,
      barangay,
      source_of_referral,
      date_admitted,
      facility_return_count,
      case_category,
      educational_attainment,
      school_last_attended,
      grade_level,
      age_when_found,
      date_time_when_found,
      place_where_found,
      present_whereabouts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    data.home_name,
    req.files?.past_picture?.[0] ? `/uploads/${req.files.past_picture[0].filename}` : null,
    req.files?.present_picture?.[0] ? `/uploads/${req.files.present_picture[0].filename}` : null,
    nameParts.fullName,
    nameParts.firstName,
    nameParts.middleInitial || null,
    nameParts.lastName,
    data.age,
    data.sex,
    data.civil_status,
    data.religion,
    data.occupation_income,
    data.birthdate,
    data.birthplace,
    data.city_address,
    data.barangay,
    data.source_of_referral,
    data.date_admitted,
    facilityReturnCount,
    data.case_category,
    data.educational_attainment,
    data.school_last_attended,
    data.grade_level,
    data.age_when_found,
    data.date_time_when_found,
    data.place_where_found,
    data.present_whereabouts
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to create client record.', error: err.message });
    }

    const reportHome = careHomeNames.includes(data.home_name) ? data.home_name : 'a care home';
    notifyAllUsers(req.auth.id, `A client was added in ${reportHome}.`);
    res.status(201).json({
      message: 'Client record created successfully.',
      id: result.insertId
    });
  });
});

app.put('/api/clients/:id', requireAuth, requireRoles(caseManagementRoles), uploadClientImages, (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const nameParts = getClientNameParts(data);
  if (!nameParts.firstName || !nameParts.lastName || nameParts.middleInitial.length > 30) {
    return res.status(400).json({ message: 'First name and last name are required; middle initial must be 30 characters or fewer.' });
  }
  const facilityReturnCount = Number(data.facility_return_count ?? 0);
  if (!Number.isInteger(facilityReturnCount) || facilityReturnCount < 0 || facilityReturnCount > 65535) {
    return res.status(400).json({ message: 'Facility return count must be a whole number from 0 to 65,535.' });
  }

  const sql = `
    UPDATE clients SET
      home_name = ?,
      past_picture = COALESCE(?, past_picture),
      present_picture = COALESCE(?, present_picture),
      name = ?,
      first_name = ?,
      middle_initial = ?,
      last_name = ?,
      age = ?,
      sex = ?,
      civil_status = ?,
      religion = ?,
      occupation_income = ?,
      birthdate = ?,
      birthplace = ?,
      city_address = ?,
      barangay = ?,
      source_of_referral = ?,
      date_admitted = ?,
      facility_return_count = ?,
      case_category = ?,
      educational_attainment = ?,
      school_last_attended = ?,
      grade_level = ?,
      age_when_found = ?,
      date_time_when_found = ?,
      place_where_found = ?,
      present_whereabouts = ?
    WHERE id = ?
  `;

  const values = [
    data.home_name,
    req.files?.past_picture?.[0] ? `/uploads/${req.files.past_picture[0].filename}` : null,
    req.files?.present_picture?.[0] ? `/uploads/${req.files.present_picture[0].filename}` : null,
    nameParts.fullName,
    nameParts.firstName,
    nameParts.middleInitial || null,
    nameParts.lastName,
    data.age,
    data.sex,
    data.civil_status,
    data.religion,
    data.occupation_income,
    data.birthdate,
    data.birthplace,
    data.city_address,
    data.barangay,
    data.source_of_referral,
    data.date_admitted,
    facilityReturnCount,
    data.case_category,
    data.educational_attainment,
    data.school_last_attended,
    data.grade_level,
    data.age_when_found,
    data.date_time_when_found,
    data.place_where_found,
    id
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to update client record.', error: err.message });
    }
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const reportHome = careHomeNames.includes(data.home_name) ? data.home_name : 'a care home';
    notifyAllUsers(req.auth.id, `A client record was updated in ${reportHome}.`);
    res.json({ message: 'Client updated successfully.' });
  });
});

app.delete('/api/clients/:id', requireAuth, requireRoles(caseManagementRoles), (req, res) => {
  const { id } = req.params;

  db.query('SELECT stored_name FROM client_documents WHERE client_id = ?', [id], (documentsError, documents) => {
    if (documentsError) {
      return res.status(500).json({ message: 'Failed to load client documents.', error: documentsError.message });
    }

    db.query('DELETE FROM clients WHERE id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to delete client.', error: err.message });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Client not found.' });
      }

      documents.forEach((document) => fs.promises.unlink(path.join(documentDirectory, document.stored_name)).catch(() => {}));
      notifyAllUsers(req.auth.id, 'A client record was deleted.');
      res.json({ message: 'Client deleted successfully.' });
    });
  });
});

app.post('/api/auth/register', requireAuth, requireSuperadmin, (req, res) => {
  const { first_name, middle_initial, last_name, age, email, password, role } = req.body;

  if (!first_name || !last_name || !age || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required: first_name, last_name, age, email, password, role.' });
  }

  const allowedRoles = ['social_worker', 'psychometrician'];
  const normalizedRole = String(role).trim().toLowerCase();

  if (!allowedRoles.includes(normalizedRole)) {
    return res.status(400).json({ message: 'Invalid role. Allowed roles: social_worker, psychometrician.' });
  }

  const parsedAge = Number(age);

  if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
    return res.status(400).json({ message: 'Age must be a valid number.' });
  }
  if (String(middle_initial || '').trim().length > 30) {
    return res.status(400).json({ message: 'Middle initial must be 30 characters or fewer.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password);
  const hashedPassword = bcrypt.hashSync(cleanPassword, 10);

  db.query(
    'INSERT INTO users (first_name, middle_initial, last_name, age, email, password, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [String(first_name).trim(), String(middle_initial || '').trim() || null, String(last_name).trim(), parsedAge, cleanEmail, hashedPassword, normalizedRole],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'Email already exists.' });
        }
        return res.status(500).json({ message: 'Registration failed.', error: err.message });
      }

      notifyAllUsers(req.auth.id, 'A staff account was created.');
      res.status(201).json({
        message: 'User registered successfully.',
        user: {
          id: result.insertId,
          first_name: String(first_name).trim(),
          middle_initial: String(middle_initial || '').trim() || null,
          last_name: String(last_name).trim(),
          age: parsedAge,
          email: cleanEmail,
          role: normalizedRole
        }
      });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  db.query('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Login failed.', error: err.message });
    }

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isPasswordMatch = bcrypt.compareSync(String(password), user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const { password: _, ...safeUser } = user;
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({
      message: 'Login successful.',
      user: safeUser,
      accessToken
    });
  });
});

const passwordResetResponse = {
  message: 'If an account exists for that email, a password reset code has been sent.'
};

const hashResetCode = (userId, code) => crypto
  .createHmac('sha256', jwtSecret)
  .update(`${userId}:${code}`)
  .digest('hex');

app.post('/api/auth/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!mailTransporter) {
    return res.status(503).json({ message: 'Password reset email is not configured. Contact the administrator.' });
  }

  db.query('SELECT id, first_name, email FROM users WHERE email = ?', [email], (userError, users) => {
    if (userError) {
      return res.status(500).json({ message: 'Could not request a password reset.' });
    }
    if (!users.length) return res.json(passwordResetResponse);

    const user = users[0];
    db.query('SELECT created_at FROM password_reset_codes WHERE user_id = ?', [user.id], (codeError, codes) => {
      if (codeError) {
        return res.status(500).json({ message: 'Could not request a password reset.' });
      }
      if (codes.length && Date.now() - new Date(codes[0].created_at).getTime() < 60_000) {
        return res.json(passwordResetResponse);
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = hashResetCode(user.id, code);
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      db.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts)
         VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, created_at = CURRENT_TIMESTAMP`,
        [user.id, codeHash, expiresAt],
        (saveError) => {
          if (saveError) {
            return res.status(500).json({ message: 'Could not request a password reset.' });
          }

          mailTransporter.sendMail({
            from: mailFrom,
            to: user.email,
            subject: 'Your KALAKBAY AI password reset code',
            text: `Hello ${user.first_name},\n\nYour password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.\n\nKALAKBAY AI`,
          }).then(() => {
            res.json(passwordResetResponse);
          }).catch((mailError) => {
            console.error('Password reset email delivery failed:', mailError.message);
            db.query('DELETE FROM password_reset_codes WHERE user_id = ? AND code_hash = ?', [user.id, codeHash], () => {});
            res.status(503).json({ message: 'Could not send the reset email. Check the mail configuration or try again later.' });
          });
        }
      );
    });
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const newPassword = String(req.body.new_password || '');
  const invalidCode = () => res.status(400).json({ message: 'The reset code is invalid or expired.' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return invalidCode();
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: 'The new password must be between 8 and 128 characters.' });
  }

  db.query(
    `SELECT users.id, password_reset_codes.code_hash, password_reset_codes.expires_at, password_reset_codes.attempts
     FROM users JOIN password_reset_codes ON password_reset_codes.user_id = users.id
     WHERE users.email = ?`,
    [email],
    (lookupError, rows) => {
      if (lookupError) return res.status(500).json({ message: 'Could not reset the password.' });
      if (!rows.length) return invalidCode();

      const reset = rows[0];
      if (Number(reset.attempts) >= 5 || new Date(reset.expires_at).getTime() <= Date.now()) {
        db.query('DELETE FROM password_reset_codes WHERE user_id = ?', [reset.id], () => {});
        return invalidCode();
      }

      const expectedHash = hashResetCode(reset.id, code);
      const actualHash = String(reset.code_hash);
      const isValid = /^[a-f0-9]{64}$/i.test(actualHash)
        && crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actualHash, 'hex'));
      db.query(
        'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ? AND attempts < 5 AND expires_at > NOW()',
        [reset.id],
        (attemptError, attemptResult) => {
          if (attemptError) return res.status(500).json({ message: 'Could not verify the reset code.' });
          if (!attemptResult.affectedRows || !isValid) return invalidCode();

          db.query(
            'DELETE FROM password_reset_codes WHERE user_id = ? AND code_hash = ? AND expires_at > NOW()',
            [reset.id, actualHash],
            (consumeError, consumed) => {
              if (consumeError) return res.status(500).json({ message: 'Could not reset the password.' });
              if (!consumed.affectedRows) return invalidCode();

              const passwordHash = bcrypt.hashSync(newPassword, 10);
              db.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, reset.id], (updateError) => {
                if (updateError) return res.status(500).json({ message: 'Could not reset the password. Request a new code.' });
                res.json({ message: 'Password reset successfully. Sign in with your new password.' });
              });
            }
          );
        }
      );
    }
  );
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  db.query(
    'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = ?',
    [req.auth.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Failed to load profile.', error: err.message });
      if (!rows.length) return res.status(404).json({ message: 'User account not found.' });
      res.json(rows[0]);
    }
  );
});

app.delete('/api/auth/me/profile-picture', requireAuth, (req, res) => {
  db.query('SELECT profile_picture FROM users WHERE id = ?', [req.auth.id], (lookupError, rows) => {
    if (lookupError) {
      return res.status(500).json({ message: 'Could not load the profile picture.', error: lookupError.message });
    }
    if (!rows.length) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    const photoPath = rows[0].profile_picture;
    db.query('UPDATE users SET profile_picture = NULL WHERE id = ?', [req.auth.id], (updateError) => {
      if (updateError) {
        return res.status(500).json({ message: 'Could not remove the profile picture.', error: updateError.message });
      }

      if (photoPath?.startsWith('/uploads/')) {
        fs.promises.unlink(path.join(uploadDirectory, path.basename(photoPath))).catch(() => {});
      }

      db.query(
        'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = ?',
        [req.auth.id],
        (profileError, profiles) => {
          if (profileError) {
            return res.status(500).json({ message: 'Profile picture removed, but could not reload the profile.' });
          }
          notifyAllUsers(req.auth.id, 'A user profile picture was removed.');
          res.json(profiles[0]);
        }
      );
    });
  });
});

app.put('/api/auth/me', requireAuth, imageUpload.single('profile_picture'), (req, res) => {
  const firstName = String(req.body.first_name || '').trim();
  const middleInitial = String(req.body.middle_initial || '').trim();
  const lastName = String(req.body.last_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const age = Number(req.body.age);
  const discardUploadedPhoto = () => {
    if (req.file) fs.unlink(req.file.path, () => {});
  };

  if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'First and last name are required and must be 100 characters or fewer.' });
  }
  if (middleInitial.length > 30) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Middle initial must be 30 characters or fewer.' });
  }
  if (!Number.isInteger(age) || age < 18 || age > 120) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Age must be a whole number between 18 and 120.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    discardUploadedPhoto();
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  const fields = [firstName, middleInitial || null, lastName, age, email];
  const photoSql = req.file ? ', profile_picture = ?' : '';
  if (req.file) fields.push(`/uploads/${req.file.filename}`);
  fields.push(req.auth.id);

  db.query(
    `UPDATE users SET first_name = ?, middle_initial = ?, last_name = ?, age = ?, email = ?${photoSql} WHERE id = ?`,
    fields,
    (err, result) => {
      if (err) {
        discardUploadedPhoto();
        const isDuplicateEmail = err.code === 'ER_DUP_ENTRY';
        return res.status(isDuplicateEmail ? 409 : 500).json({
          message: isDuplicateEmail ? 'That email address is already in use.' : 'Failed to update profile.',
          ...(!isDuplicateEmail && { error: err.message })
        });
      }
      if (!result.affectedRows) return res.status(404).json({ message: 'User account not found.' });

      db.query(
        'SELECT id, first_name, middle_initial, last_name, age, email, role, position, profile_picture FROM users WHERE id = ?',
        [req.auth.id],
        (profileError, rows) => {
          if (profileError) return res.status(500).json({ message: 'Profile updated, but could not reload it.' });
          notifyAllUsers(req.auth.id, 'A user profile was updated.');
          res.json(rows[0]);
        }
      );
    }
  );
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  const currentPassword = String(req.body.current_password || '');
  const newPassword = String(req.body.new_password || '');

  if (!currentPassword || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: 'Enter your current password and a new password between 8 and 128 characters.' });
  }

  db.query('SELECT password FROM users WHERE id = ?', [req.auth.id], (lookupError, rows) => {
    if (lookupError) {
      return res.status(500).json({ message: 'Could not verify your current password.' });
    }
    if (!rows.length) {
      return res.status(404).json({ message: 'User account not found.' });
    }
    if (!bcrypt.compareSync(currentPassword, rows[0].password)) {
      return res.status(400).json({ message: 'Your current password is incorrect.' });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    db.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, req.auth.id], (updateError) => {
      if (updateError) {
        return res.status(500).json({ message: 'Failed to update your password.' });
      }
      res.json({ message: 'Password updated successfully.' });
    });
  });
});

app.get('/api/users', requireAuth, requireSuperadmin, (req, res) => {
  db.query('SELECT id, first_name, middle_initial, last_name, age, email, role, created_at FROM users', (err, result) => {
    if (err) return res.status(500).json({ message: 'Error fetching users', error: err.message });
    res.json(result);
  });
});

app.delete('/api/users/:id', requireAuth, requireSuperadmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ message: 'Invalid user account ID.' });
  }
  if (targetId === Number(req.auth.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  db.query('SELECT profile_picture FROM users WHERE id = ?', [targetId], (lookupError, rows) => {
    if (lookupError) {
      return res.status(500).json({ message: 'Could not find the user account.', error: lookupError.message });
    }
    if (!rows.length) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    db.query('DELETE FROM users WHERE id = ?', [targetId], (deleteError, result) => {
      if (deleteError) {
        return res.status(500).json({ message: 'Failed to delete user account.', error: deleteError.message });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ message: 'User account not found.' });
      }

      notifyAllUsers(req.auth.id, 'A staff account was deleted.');
      const photoPath = rows[0].profile_picture;
      if (photoPath?.startsWith('/uploads/')) {
        fs.promises.unlink(path.join(uploadDirectory, path.basename(photoPath))).catch(() => {});
      }
      res.json({ message: 'User account deleted successfully.' });
    });
  });
});

const assistantRateLimits = new Map();
const createLocalModelPrompt = (question) => {
  return `You are Kalakbay AI, a helpful English and Filipino assistant. Answer the user's question clearly and directly. You may answer general questions, but do not diagnose a child or make clinical decisions. If you are unsure, say so instead of inventing facts.\n\nUser question: ${question}`;
};

const askLocalModel = async (question) => {
  if (process.env.LOCAL_LLM_ENABLED !== 'true') return null;
  const baseUrl = String(process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: createLocalModelPrompt(question),
        stream: false,
        options: { temperature: 0.2, num_ctx: 2048 }
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) return null;
    const result = await response.json();
    return String(result.response || '').trim() || null;
  } catch {
    return null;
  }
};

app.post('/api/assistant/chat', requireAuth, requireRoles(['superadmin', 'admin', 'social_worker', 'psychometrician', 'user']), async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (message.length < 2 || message.length > 1000) {
    return res.status(400).json({ message: 'Enter a question between 2 and 1,000 characters.' });
  }

  const now = Date.now();
  const accountId = Number(req.auth.id);
  const usage = assistantRateLimits.get(accountId);
  if (usage && usage.resetAt > now && usage.count >= 20) {
    return res.status(429).json({ message: 'Chat limit reached. Please wait a minute before sending another question.' });
  }
  assistantRateLimits.set(accountId, usage && usage.resetAt > now
    ? { count: usage.count + 1, resetAt: usage.resetAt }
    : { count: 1, resetAt: now + 60_000 });

  const localModelReply = await askLocalModel(message);
  if (localModelReply) {
    return res.json({
      reply: localModelReply,
      source: null,
      model: 'local'
    });
  }
  res.json({
    reply: 'Hindi makuha ang local AI model ngayon. Siguraduhing tumatakbo ang Ollama at naka-install ang napiling model.',
    source: null,
    model: 'unavailable'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});