const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const PUZZLE = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9]
];
const SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9]
];

const games = new Map();

function createBoardState() {
  return PUZZLE.map((row, r) => row.map((value, c) => ({ value, fixed: value !== 0, by: null, color: null, r, c })));
}
function isSolved(board) {
  return board.every((row, r) => row.every((cell, c) => cell.value === SOLUTION[r][c]));
}
function gameView(game) {
  return {
    id: game.id,
    maxPlayers: game.maxPlayers,
    board: game.board,
    locks: game.locks,
    players: [...game.players.values()],
    winner: game.winner,
    stats: Object.fromEntries(game.stats)
  };
}
function broadcast(game) {
  const payload = `data: ${JSON.stringify({ type: 'state', game: gameView(game) })}\n\n`;
  game.streams.forEach((res) => res.write(payload));
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/games') {
    const { maxPlayers } = await parseBody(req);
    const n = Number(maxPlayers);
    if (!Number.isInteger(n) || n < 2 || n > 8) return sendJson(res, 400, { error: 'maxPlayers must be between 2 and 8' });
    const id = randomUUID().slice(0, 8);
    games.set(id, { id, maxPlayers: n, board: createBoardState(), locks: {}, players: new Map(), stats: new Map(), winner: null, streams: new Set() });
    return sendJson(res, 200, { gameId: id, link: `/game/${id}` });
  }

  if (req.method === 'POST' && url.pathname === '/api/join') {
    const { gameId, playerId, name, avatar } = await parseBody(req);
    const game = games.get(gameId);
    if (!game) return sendJson(res, 404, { error: 'Game not found' });
    if (!game.players.has(playerId) && game.players.size >= game.maxPlayers) return sendJson(res, 403, { error: 'Game full' });
    if (!game.players.has(playerId)) {
      const color = COLORS[game.players.size % COLORS.length];
      game.players.set(playerId, { id: playerId, name, avatar: avatar || '', color, provider: 'x.com' });
      game.stats.set(playerId, 0);
    }
    broadcast(game);
    return sendJson(res, 200, { game: gameView(game), me: game.players.get(playerId) });
  }

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    const gameId = url.searchParams.get('gameId');
    const game = games.get(gameId);
    if (!game) return sendJson(res, 404, { error: 'Game not found' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    game.streams.add(res);
    res.write(`data: ${JSON.stringify({ type: 'state', game: gameView(game) })}\n\n`);
    req.on('close', () => game.streams.delete(res));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/action') {
    const { gameId, playerId, type, r, c, value } = await parseBody(req);
    const game = games.get(gameId);
    if (!game || !game.players.has(playerId)) return sendJson(res, 404, { error: 'Game or player not found' });
    const key = `${r}-${c}`;

    if (type === 'lock') {
      const current = game.locks[key];
      if (!current || current.playerId === playerId) game.locks[key] = { playerId, expiresAt: Date.now() + 15000 };
    }

    if (type === 'unlock') {
      if (game.locks[key] && game.locks[key].playerId === playerId) delete game.locks[key];
    }

    if (type === 'set') {
      const cell = game.board[r]?.[c];
      const lock = game.locks[key];
      if (cell && !cell.fixed && lock && lock.playerId === playerId) {
        cell.value = value;
        if (value === 0) {
          cell.by = null;
          cell.color = null;
        } else {
          const player = game.players.get(playerId);
          cell.by = playerId;
          cell.color = player.color;
          game.stats.set(playerId, (game.stats.get(playerId) || 0) + 1);
        }
        delete game.locks[key];
        if (isSolved(game.board)) game.winner = { at: new Date().toISOString(), stats: Object.fromEntries(game.stats) };
      }
    }

    broadcast(game);
    return sendJson(res, 200, { ok: true });
  }

  let filePath = path.join(__dirname, 'public', url.pathname === '/' || url.pathname.startsWith('/game/') ? 'index.html' : url.pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const typeMap = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': typeMap[ext] || 'text/plain' });
    res.end(data);
  });
});

setInterval(() => {
  const now = Date.now();
  games.forEach((game) => {
    let changed = false;
    Object.entries(game.locks).forEach(([key, lock]) => {
      if (lock.expiresAt < now) {
        delete game.locks[key];
        changed = true;
      }
    });
    if (changed) broadcast(game);
  });
}, 2000);

server.listen(3000, () => console.log('Server on http://localhost:3000'));
