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

app.use('/uploads', express.static(uploadDirectory));

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kalakbay__ai'
});

const notifyAllUsers = (actorId, message, behaviorRelated = false) => {
  db.query(
    "INSERT INTO notifications (recipient_id, actor_id, message, behavior_related) SELECT id, ?, ?, ? FROM users WHERE role NOT IN ('psychometrician', 'user') OR ? = 1",
    [actorId, message, behaviorRelated ? 1 : 0, behaviorRelated ? 1 : 0],
    (err) => {
      if (err) console.error('Failed to create system notification:', err.message);
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
      behavior_related TINYINT(1) NOT NULL DEFAULT 0,
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
    db.query("SHOW COLUMNS FROM notifications LIKE 'behavior_related'", (columnError, columns) => {
      if (columnError) {
        console.error('Failed to inspect notifications table:', columnError.message);
        process.exit(1);
      }
      if (columns.length) {
        console.log('Notifications table is ready.');
        return;
      }
      db.query('ALTER TABLE notifications ADD COLUMN behavior_related TINYINT(1) NOT NULL DEFAULT 0', (migrationError) => {
        if (migrationError) {
          console.error('Failed to add behavior filter to notifications:', migrationError.message);
          process.exit(1);
        }
        console.log('Notifications table is ready.');
      });
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
      case_category VARCHAR(255),
      educational_attainment VARCHAR(255),
      school_last_attended VARCHAR(255),
      grade_level VARCHAR(100),
      age_when_found INT,
      date_time_when_found DATETIME,
      place_where_found VARCHAR(255),
      present_whereabouts VARCHAR(255),
      behavior_notes TEXT,
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
        ['last_name', "VARCHAR(150) NOT NULL DEFAULT ''"]
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

    db.query("SHOW COLUMNS FROM clients LIKE 'behavior_notes'", (columnError, columns) => {
      if (columnError) {
        console.error('Failed to inspect clients table:', columnError.message);
        process.exit(1);
      }

      if (columns.length) {
        ensureClientNameColumns();
        return;
      }

      db.query('ALTER TABLE clients ADD COLUMN behavior_notes TEXT NULL', (migrationError) => {
        if (migrationError) {
          console.error('Failed to add clients.behavior_notes column:', migrationError.message);
          process.exit(1);
        }
        console.log('Added the missing clients.behavior_notes column.');
        ensureClientNameColumns();
      });
    });
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
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const behaviorOnly = ['psychometrician', 'user'].includes(req.auth.role);
  const behaviorFilter = behaviorOnly ? ' AND behavior_related = 1' : '';
  db.query(
    `SELECT id, message, created_at, read_at FROM notifications WHERE recipient_id = ?${behaviorFilter} ORDER BY created_at DESC LIMIT 50`,
    [req.auth.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to load notifications.', error: err.message });
      }
      db.query(
        `SELECT COUNT(*) AS unread_count FROM notifications WHERE recipient_id = ?${behaviorFilter} AND read_at IS NULL`,
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

app.put('/api/notifications/read', requireAuth, (req, res) => {
  const behaviorOnly = ['psychometrician', 'user'].includes(req.auth.role);
  const behaviorFilter = behaviorOnly ? ' AND behavior_related = 1' : '';
  db.query(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE recipient_id = ? AND read_at IS NULL${behaviorFilter}`,
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

  const behaviorFilter = ['psychometrician', 'user'].includes(req.auth.role)
    ? ' AND behavior_related = 1'
    : '';
  db.query(
    `DELETE FROM notifications WHERE id = ? AND recipient_id = ?${behaviorFilter}`,
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
    db.query('SELECT name, age, home_name, present_picture, behavior_notes FROM clients ORDER BY name', (clientError, rows) => {
      if (clientError) {
        return res.status(500).json({ message: 'Could not load behavior overview.', error: clientError.message });
      }

      const psychometricianClients = rows.map((row) => ({
        name: row.name,
        age: row.age === null ? null : Number(row.age),
        home_name: row.home_name,
        present_picture: row.present_picture,
        behavior_notes: row.behavior_notes
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
    ? 'SELECT name, age, behavior_notes FROM clients WHERE name LIKE ? ORDER BY name LIMIT 10'
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
  let query = 'SELECT * FROM clients';
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

  db.query('SELECT * FROM clients WHERE id = ?', [id], (err, rows) => {
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
      case_category,
      educational_attainment,
      school_last_attended,
      grade_level,
      age_when_found,
      date_time_when_found,
      place_where_found,
      present_whereabouts,
      behavior_notes
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
    data.case_category,
    data.educational_attainment,
    data.school_last_attended,
    data.grade_level,
    data.age_when_found,
    data.date_time_when_found,
    data.place_where_found,
    data.present_whereabouts,
    data.behavior_notes || null
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to create client record.', error: err.message });
    }

    const reportHome = careHomeNames.includes(data.home_name) ? data.home_name : 'a care home';
    const hasBehaviorNotes = Boolean(String(data.behavior_notes || "").trim());
    const message = hasBehaviorNotes
      ? `A client was added in ${reportHome}. Behavior notes were recorded.`
      : `A client was added in ${reportHome}.`;
    notifyAllUsers(req.auth.id, message, hasBehaviorNotes);
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
      case_category = ?,
      educational_attainment = ?,
      school_last_attended = ?,
      grade_level = ?,
      age_when_found = ?,
      date_time_when_found = ?,
      place_where_found = ?,
      present_whereabouts = ?,
      behavior_notes = ?
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
    data.case_category,
    data.educational_attainment,
    data.school_last_attended,
    data.grade_level,
    data.age_when_found,
    data.date_time_when_found,
    data.place_where_found,
    data.present_whereabouts,
    data.behavior_notes || null,
    id
  ];

  db.query('SELECT behavior_notes FROM clients WHERE id = ?', [id], (lookupError, existingClients) => {
    if (lookupError) {
      return res.status(500).json({ message: 'Could not check the existing client record.', error: lookupError.message });
    }
    if (!existingClients.length) {
      return res.status(404).json({ message: 'Client not found.' });
    }

    const previousBehaviorNotes = String(existingClients[0].behavior_notes || '').trim();
    db.query(sql, values, (err, result) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to update client record.', error: err.message });
      }

      const reportHome = careHomeNames.includes(data.home_name) ? data.home_name : 'a care home';
      const behaviorChanged = previousBehaviorNotes !== String(data.behavior_notes || '').trim();
      const message = behaviorChanged
        ? `Behavior notes were updated for a client in ${reportHome}.`
        : `A client record was updated in ${reportHome}.`;
      notifyAllUsers(req.auth.id, message, behaviorChanged);
      res.json({ message: 'Client updated successfully.' });
    });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});