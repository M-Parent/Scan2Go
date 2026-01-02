const logger = require("./logger");
const path = require("path");
const { Pool } = require("pg");

// Load environment from the repo's DB folder (s2g-DB/.env)
require("dotenv").config({
  path: path.join(__dirname, "..", "s2g-DB", ".env"),
});

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || "localhost",
  // Docker compose maps container 5432 -> host 5433 in this repo, default to 5433 when not set
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5433,
  user: process.env.POSTGRES_USER,
  password:
    process.env.POSTGRES_PASSWORD !== undefined
      ? String(process.env.POSTGRES_PASSWORD)
      : undefined,
  database: process.env.POSTGRES_DB,
});

pool.on("error", (err) => {
  logger.error("Unexpected error on idle Postgres client", err);
});

logger.info("Initialisation de la connexion PostgreSQL...");

// Try a quick test connection to make auth/port problems obvious early
(async () => {
  try {
    const client = await pool.connect();
    client.release();
    logger.info("Postgres connection OK");
  } catch (err) {
    logger.error("Postgres connection test failed:", err.message || err);
  }
})();

// Helper: convert ? placeholders to $1, $2, ...
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

// Promise-compatible wrapper that mimics mysql2's promise().query API used in the codebase
async function query(sql, params = []) {
  const converted = convertPlaceholders(sql);
  let finalSql = converted;
  if (
    /^\s*insert\s+into/i.test(converted) &&
    !/returning\s+/i.test(converted)
  ) {
    finalSql = `${converted} RETURNING id`;
  }

  const res = await pool.query(finalSql, params);

  if (res.command === "SELECT") {
    return [res.rows];
  }

  if (res.command === "INSERT") {
    const result = {
      insertId: res.rows && res.rows[0] ? res.rows[0].id : null,
      affectedRows: res.rowCount,
    };
    return [result];
  }

  const result = { affectedRows: res.rowCount };
  return [result];
}

// Expose a `db` object compatible with existing code that calls `db.promise().query(...)`
const db = {
  promise: () => ({ query }),
  pool,
};

// Callback-compatible query to mimic mysql2's connection.query(sql, params, cb)
db.query = function (sql, params, cb) {
  if (typeof params === "function") {
    cb = params;
    params = [];
  }
  const converted = convertPlaceholders(sql);
  let finalSql = converted;
  if (
    /^\s*insert\s+into/i.test(converted) &&
    !/returning\s+/i.test(converted)
  ) {
    finalSql = `${converted} RETURNING id`;
  }

  const run = (client) => {
    client.query(finalSql, params, (err, res) => {
      if (err) return cb(err);

      if (res.command === "SELECT") {
        return cb(null, res.rows);
      }

      if (res.command === "INSERT") {
        const result = Object.assign([], []);
        result.insertId = res.rows && res.rows[0] ? res.rows[0].id : null;
        result.affectedRows = res.rowCount;
        return cb(null, result);
      }

      const result = { affectedRows: res.rowCount };
      return cb(null, result);
    });
  };

  // Use transaction client if exists, otherwise use pool
  if (db._txClient) {
    run(db._txClient);
  } else {
    pool.query(finalSql, params, (err, res) => {
      if (err) return cb(err);

      if (res.command === "SELECT") {
        return cb(null, res.rows);
      }

      if (res.command === "INSERT") {
        const result = Object.assign([], []);
        result.insertId = res.rows && res.rows[0] ? res.rows[0].id : null;
        result.affectedRows = res.rowCount;
        return cb(null, result);
      }

      const result = { affectedRows: res.rowCount };
      return cb(null, result);
    });
  }
};

// Simple transaction helpers to mimic mysql connection.transaction API
db.beginTransaction = function (cb) {
  pool.connect((err, client, release) => {
    if (err) return cb(err);
    db._txClient = client;
    db._txRelease = release;
    client.query("BEGIN", (err) => cb(err));
  });
};

db.commit = function (cb) {
  if (!db._txClient) return cb(new Error("No active transaction"));
  db._txClient.query("COMMIT", (err) => {
    try {
      if (db._txRelease) db._txRelease();
    } catch (e) {}
    db._txClient = null;
    db._txRelease = null;
    cb(err);
  });
};

db.rollback = function (cb) {
  if (!db._txClient) return cb(new Error("No active transaction"));
  db._txClient.query("ROLLBACK", (err) => {
    try {
      if (db._txRelease) db._txRelease();
    } catch (e) {}
    db._txClient = null;
    db._txRelease = null;
    cb(err);
  });
};

// Create Table MYSQL
async function createProjectTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS project (
      id SERIAL PRIMARY KEY,
      project_name VARCHAR(255),
      project_image VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await db.promise().query(createTableQuery);
    logger.info('Table "project" created or already exists.');
  } catch (err) {
    console.error("Error creating project table:", err);
  }
}

async function createSectionTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS section (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      section_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
    );
  `;

  try {
    await db.promise().query(createTableQuery);
    logger.info('Table "section" created or already exists.');
  } catch (err) {
    console.error("Error creating section table:", err);
  }
}

async function createFileTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS file (
      id SERIAL PRIMARY KEY,
      section_id INTEGER,
      name VARCHAR(255),
      url_qr_code VARCHAR(255),
      path_file VARCHAR(255),
      path_pdf VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (section_id) REFERENCES section(id) ON DELETE CASCADE
    );
  `;

  try {
    await db.promise().query(createTableQuery);
    logger.info('Table "file" created or already exists.');
  } catch (err) {
    console.error("Error creating file table:", err);
  }
}

async function createTagTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tag (
      id SERIAL PRIMARY KEY,
      file_id INTEGER,
      tag_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES file(id) ON DELETE CASCADE
    );
  `;

  try {
    await db.promise().query(createTableQuery);
    logger.info('Table "tag" created or already exists.');
  } catch (err) {
    console.error("Error creating tag table:", err);
  }
}

// Fonction pour fermer la connexion (à utiliser plus tard)
function closeConnection() {
  pool.end((err) => {
    if (err) {
      console.error("Error closing database connection:", err);
    } else {
      logger.info("PostgreSQL database connection closed.");
    }
  });
}

// Attach closeConnection to exported db for compatibility
db.closeConnection = closeConnection;

// Ensure tables exist at startup
async function initTables() {
  try {
    await createProjectTable();
    await createSectionTable();
    await createFileTable();
    await createTagTable();
    logger.info("Database tables ensured (project, section, file, tag)");
  } catch (err) {
    logger.error("Error ensuring database tables:", err.message || err);
  }
}

// Call init after definitions
initTables();

module.exports = db; // Exportez l'objet de connexion pour l'utiliser dans d'autres fichiers
