const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

app.use('/uploads', express.static(uploadDirectory));

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kalakbay__ai'
});

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
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' });
});

app.get('/api/dashboard', requireAuth, requireRoles(['superadmin', 'admin', 'social_worker', 'psychometrician', 'user']), (req, res) => {
  if (['psychometrician', 'user'].includes(req.auth.role)) {
    db.query('SELECT name, age, behavior_notes FROM clients ORDER BY name', (clientError, rows) => {
      if (clientError) {
        return res.status(500).json({ message: 'Could not load behavior overview.', error: clientError.message });
      }

      const behaviorClients = rows.map((row) => ({
        name: row.name,
        age: row.age === null ? null : Number(row.age),
        behavior_notes: row.behavior_notes
      }));
      return res.json({
        role: req.auth.role,
        totals: {
          clients: behaviorClients.length,
          behaviorNotes: behaviorClients.filter((client) => Boolean(client.behavior_notes?.trim())).length
        },
        behaviorClients
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

  db.query(sql, values, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to update client record.', error: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Client not found.' });
    }

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