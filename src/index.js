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
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  runSql("INSERT INTO sessions (token, playerId, expiresAt) VALUES (?, ?, ?)", [sessionToken, player.playerId, expiresAt]);

  console.log("[Auth] Player " + player.playerId + " (" + name + ") authenticated");

  res.json({
    Token: sessionToken,
    UserId: String(player.playerId),
    FailedReason: null,
    SignatureSecret: signatureSecret,
    TutorialCompleted: true
  });
}

app.post("/auth", handleAuth);
app.post("/v2/auth", handleAuth);
app.post("/auth/v2", handleAuth);

// --- Game API stubs (return valid empty responses) ---

app.get("/shop/skus", (_req, res) => {
  res.json({ skus: [] });
});

app.get("/server/joinInfo", (_req, res) => {
  res.json({ isJoinable: true, joinType: 0, serverName: "CustomServer", port: 7777, ipAddress: "127.0.0.1", mapName: "Default", region: "eu", maxPlayers: 4, currentPlayers: 0 });
});

app.get("/client/availableRoom", (_req, res) => {
  res.json({ isAvailable: true, roomId: "room_" + Date.now(), map: _req.query.map || "Default", region: _req.query.region || "eu" });
});

app.get("/client/player/rttInfo", (_req, res) => {
  res.json({ rtt: 30, jitter: 5 });
});

app.get("/level/data", (_req, res) => {
  res.json({ level: 1, exp: 0, maxExp: 100, expReward: 0, rewardAmount: 0, isMaxLevel: false });
});

app.get("/quest/data", (_req, res) => {
  res.json({ quests: [] });
});

app.get("/event-quest/data", (_req, res) => {
  res.json({ quests: [] });
});

app.get("/blockShop/catalog", (_req, res) => {
  res.json({ catalog: [] });
});

app.get("/cosmetic/list", (_req, res) => {
  res.json({ cosmetics: [] });
});

app.get("/mining/daily-state", (_req, res) => {
  res.json({ canMine: true, mineCount: 0, maxMines: 5, nextResetTime: new Date(Date.now() + 86400000).toISOString() });
});

app.post("/mining/sync-state", (_req, res) => {
  res.json({ success: true });
});

app.post("/level/claim", (_req, res) => {
  res.json({ success: true, reward: { type: "gold", amount: 100 } });
});

app.post("/level/unlock/purchase", (_req, res) => {
  res.json({ success: true });
});

app.get("/quest/progress", (_req, res) => {
  res.json({ quests: [] });
});

app.post("/quest/claim", (_req, res) => {
  res.json({ success: true });
});

app.post("/trade/commit", (_req, res) => {
  res.json({ success: true });
});

app.post("/trade/create", (_req, res) => {
  res.json({ success: true, tradeId: "trade_" + Date.now() });
});

app.get("/trade/eligibility", (_req, res) => {
  res.json({ isEligible: true });
});

app.post("/soul/claimFreeGachaItem", (_req, res) => {
  res.json({ success: true, item: { id: 1, name: "DefaultSoul", rarity: "common" } });
});

app.post("/loot/monsterDrop", (_req, res) => {
  res.json({ drops: [] });
});

app.get("/checkins/status", (_req, res) => {
  res.json({ checkedIn: false, streak: 0, lastCheckin: null });
});

app.post("/checkins/claim", (_req, res) => {
  res.json({ success: true });
});

app.post("/checkins/claimAll", (_req, res) => {
  res.json({ success: true });
});

app.get("/home/data", (_req, res) => {
  res.json({ seats: [], items: [] });
});

app.post("/home/seat/place", (_req, res) => {
  res.json({ success: true });
});

app.post("/home/seat/upgrade", (_req, res) => {
  res.json({ success: true });
});

app.get("/soulDex", (_req, res) => {
  res.json({ souls: [] });
});

app.post("/soulDex/claim/level", (_req, res) => {
  res.json({ success: true });
});

app.post("/soulDex/claim/set", (_req, res) => {
  res.json({ success: true });
});

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
