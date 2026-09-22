const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "..", "hero.db");

let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      playerId INTEGER PRIMARY KEY AUTOINCREMENT,
      platformId TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL DEFAULT 'oculus',
      displayName TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      lastLogin TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      refreshToken TEXT,
      playerId INTEGER NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      expiresAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      createdAt TEXT DEFAULT (datetime('now')),
      used INTEGER DEFAULT 0
    );
  `);
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}
function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

const generateNonce = () => crypto.randomBytes(16).toString("base64url");
const generateToken = () => crypto.randomBytes(32).toString("base64url");

// --- Match original: hide Express fingerprint ---
app.disable("x-powered-by");
app.disable("etag");

// --- Match original: 2-space pretty-print JSON ---
app.set("json spaces", 2);

// --- Body parser with original-matching error ---
app.use((req, res, next) => {
  bodyParser.json()(req, res, (err) => {
    if (err) {
      const msg = "Unable to parse HTTP body- error occurred :: '" + err.stack + "'";
      return res.status(400).send(msg);
    }
    next();
  });
});

// --- CORS matching original ---
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,PATCH");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).send("GET,HEAD,PUT,POST,DELETE,PATCH");
  }
  next();
});

// --- Test page ---
app.get("/test", (_req, res) => res.sendFile(path.join(__dirname, "test.html")));

// --- Auth routes (only these exist, everything else is 404) ---

app.get("/auth/challengeNonce", (_req, res) => {
  const nonce = generateNonce();
  runSql("INSERT INTO nonces (nonce) VALUES (?)", [nonce]);
  res.json({ nonce });
});

function handleAuth(req, res) {
  const { nonce, userId, accessToken: clientToken, platform, displayName, userNonce, attestationToken } = req.body || {};
  const uid = userId || req.body?.UserId || req.body?.userId || "100000001";
  const plat = platform || "oculus";
  const name = displayName || req.body?.DisplayName || "bytee";

  let player = queryOne("SELECT * FROM players WHERE platformId = ? AND platform = ?", [uid, plat]);
  if (!player) {
    runSql("INSERT INTO players (platformId, platform, displayName) VALUES (?, ?, ?)", [uid, plat, name]);
    player = queryOne("SELECT * FROM players WHERE platformId = ? AND platform = ?", [uid, plat]);
  }
  runSql("UPDATE players SET lastLogin = datetime('now') WHERE playerId = ?", [player.playerId]);

  const sessionToken = generateToken();
  const signatureSecret = generateToken();
  const bearerToken = "Bearer " + sessionToken;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  runSql("INSERT INTO sessions (token, playerId, expiresAt) VALUES (?, ?, ?)", [sessionToken, player.playerId, expiresAt]);

  console.log("[Auth] Player " + player.playerId + " (" + name + ") authenticated");

  res.json({
    Token: sessionToken,
    UserId: String(player.playerId),
    FailedReason: null,
    SignatureSecret: signatureSecret,
    TutorialCompleted: true,
    BearerToken: bearerToken
  });
}

app.post("/auth", handleAuth);
app.post("/v2/auth", handleAuth);
app.post("/auth/v2", handleAuth);

// --- Catch-all 404 (matches original exactly) ---
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Not Found", data: null });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal Server Error", data: null });
});

// --- Start ---
initDb().then(() => {
  app.listen(PORT, () => console.log(`hero-api listening on :${PORT}`));
}).catch(err => {
  console.error("Failed to init DB:", err);
  process.exit(1);
});
