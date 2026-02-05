const authSection = document.getElementById('authSection');
const createSection = document.getElementById('createSection');
const gameSection = document.getElementById('gameSection');
const boardEl = document.getElementById('board');
const picker = document.getElementById('picker');
const playersEl = document.getElementById('players');
const gameTitle = document.getElementById('gameTitle');
const summaryEl = document.getElementById('summary');
const meEl = document.getElementById('me');

const pathParts = window.location.pathname.split('/');
const gameIdFromPath = pathParts[1] === 'game' ? pathParts[2] : null;

let profile = JSON.parse(localStorage.getItem('sudokuProfile') || 'null');
let stream;
let game;
let selectedCell;

function avatarFor(player) {
  if (player.avatar) return player.avatar;
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(player.name)}`;
}

function saveProfile() {
  const handle = document.getElementById('handle').value.trim();
  const avatar = document.getElementById('avatar').value.trim();
  if (!handle) return;
  profile = { id: crypto.randomUUID(), name: handle, avatar };
  localStorage.setItem('sudokuProfile', JSON.stringify(profile));
  initWithProfile();
}

function initWithProfile() {
  authSection.classList.remove('hidden');
  createSection.classList.remove('hidden');
  meEl.innerHTML = `<p>Logged in as <strong>${profile.name}</strong> via x.com</p>`;
  document.getElementById('profileForm').classList.add('hidden');

  if (gameIdFromPath) connect(gameIdFromPath);
}

function createPlayerChip(player, me = false) {
  return `<div class="player" style="border-color:${player.color}">
    <img class="avatar" style="border-color:${player.color}" src="${avatarFor(player)}" />
    <span>${player.name}${me ? ' (you)' : ''}</span>
  </div>`;
}

function render() {
  if (!game) return;
  gameSection.classList.remove('hidden');
  gameTitle.textContent = `Game ${game.id} (${game.players.length}/${game.maxPlayers})`;
  playersEl.className = 'players';
  playersEl.innerHTML = game.players.map((p) => createPlayerChip(p, p.id === profile.id)).join('');

  boardEl.innerHTML = '';
  game.board.flat().forEach((cell) => {
    const div = document.createElement('button');
    div.className = 'cell';
    if (cell.fixed) div.classList.add('fixed');
    const lock = game.locks[`${cell.r}-${cell.c}`];
    if (lock) div.classList.add('locked');
    div.style.color = cell.color || '#e2e8f0';
    div.textContent = cell.value || '';
    div.onclick = () => {
      if (cell.fixed) return;
      if (lock && lock.playerId !== profile.id) return;
      const rect = div.getBoundingClientRect();
      openPicker(cell.r, cell.c, rect.left + window.scrollX + rect.width / 2, rect.top + window.scrollY + rect.height / 2);
    };
    boardEl.appendChild(div);
  });

  if (game.winner) {
    const rows = game.players.map((p) => `<li style="color:${p.color}">${p.name}: ${game.stats[p.id] || 0} numbers</li>`).join('');
    summaryEl.classList.remove('hidden');
    summaryEl.innerHTML = `<h3>🎉 Sudoku solved!</h3><p>Numbers placed by each player:</p><ul>${rows}</ul>`;
  }
}

async function send(type, payload) {
  if (!game || !profile) return;
  await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: game.id, playerId: profile.id, type, ...payload })
  });
}

function openPicker(r, c, x, y) {
  selectedCell = { r, c };
  send('lock', { r, c });

  picker.innerHTML = '';
  picker.classList.remove('hidden');
  picker.style.left = `${x - 115}px`;
  picker.style.top = `${y - 115}px`;

  const radius = 90;
  for (let n = 1; n <= 9; n += 1) {
    const angle = ((n - 1) / 9) * Math.PI * 2 - Math.PI / 2;
    const px = 115 + Math.cos(angle) * radius - 26;
    const py = 115 + Math.sin(angle) * radius - 26;
    const item = document.createElement('button');
    item.className = 'item';
    item.textContent = n;
    item.style.left = `${px}px`;
    item.style.top = `${py}px`;
    item.style.setProperty('--x', `${Math.cos(angle) * 12}px`);
    item.style.setProperty('--y', `${Math.sin(angle) * 12}px`);
    item.onclick = () => {
      send('set', { r, c, value: n });
      closePicker();
    };
    picker.appendChild(item);
  }

  const reset = document.createElement('button');
  reset.className = 'reset';
  reset.textContent = 'Reset';
  reset.onclick = () => {
    send('set', { r, c, value: 0 });
    closePicker();
  };
  picker.appendChild(reset);
}

function closePicker() {
  if (selectedCell) send('unlock', selectedCell);
  picker.classList.add('hidden');
  selectedCell = null;
}

window.addEventListener('click', (e) => {
  if (!picker.contains(e.target) && !e.target.classList.contains('cell')) closePicker();
});

async function connect(gameId) {
  const join = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerId: profile.id, name: profile.name, avatar: profile.avatar || '' })
  });
  const joinData = await join.json();
  if (!join.ok) {
    alert(joinData.error || 'Unable to join game');
    return;
  }
  game = joinData.game;
  render();

  if (stream) stream.close();
  stream = new EventSource(`/api/stream?gameId=${gameId}`);
  stream.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'state') {
      game = data.game;
      render();
    }
  };
}

document.getElementById('xLogin').onclick = () => {
  document.getElementById('profileForm').classList.remove('hidden');
};

document.getElementById('saveProfile').onclick = saveProfile;

document.getElementById('createGame').onclick = async () => {
  if (!profile) return;
  const maxPlayers = Number(document.getElementById('maxPlayers').value);
  const response = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxPlayers })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Error');
  const url = `${window.location.origin}${data.link}`;
  document.getElementById('shareLink').innerHTML = `Share: <a href="${url}">${url}</a>`;
  history.pushState({}, '', data.link);
  connect(data.gameId);
};

if (profile) {
  initWithProfile();
}
