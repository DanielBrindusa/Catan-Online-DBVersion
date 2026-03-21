import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, remove, onValue, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkMVO3-dpYpjsl4h5pP7QvDQ5ZbKr_Qus",
  authDomain: "catan-online-ec090.firebaseapp.com",
  databaseURL: "https://catan-online-ec090-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "catan-online-ec090",
  storageBucket: "catan-online-ec090.firebasestorage.app",
  messagingSenderId: "375498763602",
  appId: "1:375498763602:web:ec536ac1844f07c71f5e8b",
  measurementId: "G-BJZFKFGSR8"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

let firebaseUser = null;
let currentRoomCode = null;
let currentRoomUnsubscribe = null;

async function initFirebaseAuth() {
  await signInAnonymously(auth);

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        firebaseUser = user;
        console.log("Firebase anonymous login successful:", user.uid);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

async function bootstrapFirebase() {
  try {
    await initFirebaseAuth();
    loadNicknameFromStorage();
    updateRoomPanel();

    const savedRoomCode = localStorage.getItem("catanCurrentRoomCode");
    if (savedRoomCode) {
      const roomSnapshot = await get(getRoomRef(savedRoomCode));
      if (roomSnapshot.exists() && roomSnapshot.val()?.players?.[auth.currentUser.uid]) {
        await subscribeToRoom(savedRoomCode);
        await markPresenceConnected(savedRoomCode);
      } else {
        localStorage.removeItem("catanCurrentRoomCode");
      }
    }

    console.log("Firebase is ready");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    alert("Firebase failed to initialize. Open the browser console with F12 and check the error.");
  }
}





//GAME CODE
const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];
const RESOURCE_COLORS = {
  wood: "#16a34a",
  brick: "#dc2626",
  sheep: "#84cc16",
  wheat: "#fbbf24",
  ore: "#94a3b8",
  desert: "#d4a373"
};
const PLAYER_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];
const DEV_DECK_TEMPLATE = [
  ...Array(14).fill("knight"),
  ...Array(5).fill("victoryPoint"),
  ...Array(2).fill("roadBuilding"),
  ...Array(2).fill("yearOfPlenty"),
  ...Array(2).fill("monopoly")
];
const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 }
};
const PORT_TYPES = ["3:1","3:1","3:1","3:1","wood","brick","sheep","wheat","ore"];

const state = {
  gameStarted: false,
  phase: "idle",
  board: null,
  players: [],
  currentPlayer: 0,
  startPlayer: 0,
  setupRound: 1,
  setupDirection: 1,
  setupOrderIndex: 0,
  diceRolled: false,
  dice: null,
  log: [],
  pendingAction: null,
  robberNeedsDiscard: null,
  robberMoveReason: null,
  devDeck: [],
  longestRoadOwner: null,
  largestArmyOwner: null,
  winner: null,
  tradeLock: false
};

const els = {
  board: document.getElementById("board"),
  modalRoot: document.getElementById("modalRoot"),
  modalTemplate: document.getElementById("modalTemplate"),
  statusMessage: document.getElementById("statusMessage"),
  log: document.getElementById("log"),
  phaseLabel: document.getElementById("phaseLabel"),
  turnLabel: document.getElementById("turnLabel"),
  currentPlayerCard: document.getElementById("currentPlayerCard"),
  vpSummary: document.getElementById("vpSummary"),
  diceResult: document.getElementById("diceResult"),
  rollBtn: document.getElementById("rollBtn"),
  endTurnBtn: document.getElementById("endTurnBtn"),
  finishActionBtn: document.getElementById("finishActionBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  helpBtn: document.getElementById("helpBtn"),
  devSummary: document.getElementById("devSummary"),

  nicknameInput: document.getElementById("nicknameInput"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  joinRoomCodeInput: document.getElementById("joinRoomCodeInput"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  roomCodeDisplay: document.getElementById("roomCodeDisplay"),
  roomStatusDisplay: document.getElementById("roomStatusDisplay"),
  startOnlineMatchBtn: document.getElementById("startOnlineMatchBtn"),
  onlinePlayersList: document.getElementById("onlinePlayersList")
};



//Multiplayer Room Code
const MAX_ACTIVE_ROOMS = 10;
let currentRoomData = null;
let suppressRoomSync = false;
let roomSyncTimer = null;

function generateRoomCode(length = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getNickname() {
  const name = (els.nicknameInput?.value || "").trim();
  if (!name) {
    alertMsg("Please enter your name first.");
    return null;
  }
  if (name.length > 20) {
    alertMsg("Name must be 20 characters or less.");
    return null;
  }
  localStorage.setItem("catanNickname", name);
  return name;
}

function loadNicknameFromStorage() {
  const saved = localStorage.getItem("catanNickname");
  if (saved && els.nicknameInput) {
    els.nicknameInput.value = saved;
  }
}

function getRoomRef(roomCode) {
  return ref(db, `rooms/${roomCode}`);
}

function getSystemCountRef() {
  return ref(db, "system/activeRoomCount");
}

function serializeBoard(board) {
  if (!board) return null;

  return {
    ...board,
    neighborsByVertex: Object.fromEntries(
      [...board.neighborsByVertex.entries()].map(([key, value]) => [String(key), [...value]])
    )
  };
}

function deserializeBoard(board) {
  if (!board) return null;

  return {
    ...board,
    neighborsByVertex: new Map(
      Object.entries(board.neighborsByVertex || {}).map(([key, value]) => [Number(key), new Set(value)])
    )
  };
}

function serializePlayers(players) {
  return players.map(player => ({
    ...player,
    ports: [...player.ports]
  }));
}

function deserializePlayers(players) {
  return (players || []).map(player => ({
    ...player,
    ports: new Set(player.ports || [])
  }));
}

function serializeStateForRoom() {
  return {
    gameStarted: state.gameStarted,
    phase: state.phase,
    board: serializeBoard(state.board),
    players: serializePlayers(state.players),
    currentPlayer: state.currentPlayer,
    startPlayer: state.startPlayer,
    setupRound: state.setupRound,
    setupDirection: state.setupDirection,
    setupOrderIndex: state.setupOrderIndex,
    diceRolled: state.diceRolled,
    dice: state.dice,
    log: [...state.log],
    pendingAction: state.pendingAction ? deepClone(state.pendingAction) : null,
    robberNeedsDiscard: state.robberNeedsDiscard ? deepClone(state.robberNeedsDiscard) : null,
    robberMoveReason: state.robberMoveReason,
    devDeck: [...state.devDeck],
    longestRoadOwner: state.longestRoadOwner,
    largestArmyOwner: state.largestArmyOwner,
    winner: state.winner,
    tradeLock: state.tradeLock
  };
}

function applySerializedStateFromRoom(remoteState) {
  if (!remoteState) return;

  state.gameStarted = !!remoteState.gameStarted;
  state.phase = remoteState.phase || "idle";
  state.board = deserializeBoard(remoteState.board);
  state.players = deserializePlayers(remoteState.players);
  state.currentPlayer = remoteState.currentPlayer ?? 0;
  state.startPlayer = remoteState.startPlayer ?? 0;
  state.setupRound = remoteState.setupRound ?? 1;
  state.setupDirection = remoteState.setupDirection ?? 1;
  state.setupOrderIndex = remoteState.setupOrderIndex ?? 0;
  state.diceRolled = !!remoteState.diceRolled;
  state.dice = remoteState.dice ?? null;
  state.log = Array.isArray(remoteState.log) ? [...remoteState.log] : [];
  state.pendingAction = remoteState.pendingAction ? deepClone(remoteState.pendingAction) : null;
  state.robberNeedsDiscard = remoteState.robberNeedsDiscard ? deepClone(remoteState.robberNeedsDiscard) : null;
  state.robberMoveReason = remoteState.robberMoveReason ?? null;
  state.devDeck = Array.isArray(remoteState.devDeck) ? [...remoteState.devDeck] : [];
  state.longestRoadOwner = remoteState.longestRoadOwner ?? null;
  state.largestArmyOwner = remoteState.largestArmyOwner ?? null;
  state.winner = remoteState.winner ?? null;
  state.tradeLock = !!remoteState.tradeLock;
}

function getOrderedRoomPlayers(roomData) {
  return Object.values(roomData?.players || {}).sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
}

function getCurrentTurnUid() {
  return currentRoomData?.meta?.seatUidOrder?.[state.currentPlayer] || null;
}

function isMyTurnOnline() {
  if (!currentRoomCode) return true;
  if (!firebaseUser) return false;
  return getCurrentTurnUid() === firebaseUser.uid;
}

function isRoomHost() {
  return !!(currentRoomData?.meta?.hostUid && firebaseUser && currentRoomData.meta.hostUid === firebaseUser.uid);
}

function updateRoomPanel() {
  els.roomCodeDisplay.textContent = currentRoomCode || "-";
  els.roomStatusDisplay.textContent = currentRoomData?.meta?.status || "Offline";
  els.leaveRoomBtn.disabled = !currentRoomCode;

  const canStart =
    !!currentRoomCode &&
    isRoomHost() &&
    currentRoomData?.meta?.status === "lobby" &&
    getOrderedRoomPlayers(currentRoomData).length >= 2;

  els.startOnlineMatchBtn.disabled = !canStart;

  const players = getOrderedRoomPlayers(currentRoomData);

  if (!players.length) {
    els.onlinePlayersList.innerHTML = `<div class="small-note">No players connected.</div>`;
    return;
  }

  els.onlinePlayersList.innerHTML = players.map(player => {
    const isYou = firebaseUser && player.uid === firebaseUser.uid;
    const connectionClass = player.connected ? "connected" : "disconnected";
    const connectionText = player.connected ? "Connected" : "Offline";

    return `
      <div class="online-player-row">
        <div class="online-player-dot" style="background:${player.color}"></div>
        <div>
          <div><strong>${escapeHtml(player.name)}</strong> ${isYou ? `<span class="online-player-you">(You)</span>` : ""}</div>
          <div class="online-player-tag">Seat ${player.seat + 1}</div>
        </div>
        <div class="room-pill ${connectionClass}">${connectionText}</div>
      </div>
    `;
  }).join("");
}

function setLobbyStatusMessage(roomData) {
  if (!roomData) return;

  if (roomData.meta?.status === "lobby") {
    setStatus("Online room ready. Wait for players, then the host starts the match.");
    return;
  }

  if (roomData.meta?.status === "playing" && state.gameStarted) {
    if (isMyTurnOnline()) {
      setStatus(`${playerName(state.currentPlayer)}: it is your turn.`);
    } else {
      setStatus(`${playerName(state.currentPlayer)}: waiting for that player to act.`);
    }
  }
}

async function subscribeToRoom(roomCode) {
  if (currentRoomUnsubscribe) {
    currentRoomUnsubscribe();
    currentRoomUnsubscribe = null;
  }

  currentRoomCode = roomCode;
  localStorage.setItem("catanCurrentRoomCode", roomCode);

  const roomRef = getRoomRef(roomCode);

  currentRoomUnsubscribe = onValue(roomRef, (snapshot) => {
    const roomData = snapshot.val();

    if (!roomData) {
      currentRoomData = null;
      currentRoomCode = null;
      localStorage.removeItem("catanCurrentRoomCode");
      updateRoomPanel();
      return;
    }

    currentRoomData = roomData;
    updateRoomPanel();

    if (roomData.gameState) {
      suppressRoomSync = true;
      applySerializedStateFromRoom(roomData.gameState);
      render();
      suppressRoomSync = false;
    }

    setLobbyStatusMessage(roomData);
  });

  updateRoomPanel();
}

async function markPresenceConnected(roomCode) {
  if (!firebaseUser) return;

  const connectedRef = ref(db, `rooms/${roomCode}/players/${firebaseUser.uid}/connected`);
  await set(connectedRef, true);
  onDisconnect(connectedRef).set(false);
}

async function createRoom() {
  const nickname = getNickname();
  if (!nickname) return;
  if (!firebaseUser) {
    alertMsg("Firebase user is not ready yet.");
    return;
  }
  if (currentRoomCode) {
    alertMsg("Leave the current room first.");
    return;
  }

  const countResult = await runTransaction(getSystemCountRef(), (current) => {
    const safeCurrent = typeof current === "number" ? current : 0;
    if (safeCurrent >= MAX_ACTIVE_ROOMS) return;
    return safeCurrent + 1;
  });

  if (!countResult.committed) {
    alertMsg("The server already has 10 active rooms. Try again later.");
    return;
  }

  let roomCode = null;
  let created = false;

  for (let attempt = 0; attempt < 15; attempt++) {
    const candidate = generateRoomCode();
    const roomRef = getRoomRef(candidate);
    const existing = await get(roomRef);

    if (!existing.exists()) {
      roomCode = candidate;
      const playerData = {
        uid: firebaseUser.uid,
        name: nickname,
        seat: 0,
        color: PLAYER_COLORS[0],
        connected: true,
        joinedAt: Date.now()
      };

      await set(roomRef, {
        meta: {
          roomCode,
          hostUid: firebaseUser.uid,
          status: "lobby",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          maxPlayers: 4,
          seatUidOrder: []
        },
        players: {
          [firebaseUser.uid]: playerData
        },
        gameState: null
      });

      created = true;
      break;
    }
  }

  if (!created || !roomCode) {
    await runTransaction(getSystemCountRef(), (current) => Math.max((current || 1) - 1, 0));
    alertMsg("Could not create a unique room code. Please try again.");
    return;
  }

  await subscribeToRoom(roomCode);
  await markPresenceConnected(roomCode);
}

async function joinRoom() {
  const nickname = getNickname();
  if (!nickname) return;
  if (!firebaseUser) {
    alertMsg("Firebase user is not ready yet.");
    return;
  }
  if (currentRoomCode) {
    alertMsg("Leave the current room first.");
    return;
  }

  const roomCode = (els.joinRoomCodeInput.value || "").trim().toUpperCase();
  if (!roomCode) {
    alertMsg("Enter a room code first.");
    return;
  }

  const roomRef = getRoomRef(roomCode);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    alertMsg("Room not found.");
    return;
  }

  const roomData = snapshot.val();

  if (roomData.meta?.status !== "lobby") {
    alertMsg("That room is no longer in the lobby.");
    return;
  }

  const players = getOrderedRoomPlayers(roomData);
  const existingPlayer = roomData.players?.[firebaseUser.uid];

  if (!existingPlayer && players.length >= 4) {
    alertMsg("That room already has 4 players.");
    return;
  }

  if (existingPlayer) {
    await update(ref(db, `rooms/${roomCode}/players/${firebaseUser.uid}`), {
      name: nickname,
      connected: true
    });
  } else {
    const nextSeat = players.length;
    await set(ref(db, `rooms/${roomCode}/players/${firebaseUser.uid}`), {
      uid: firebaseUser.uid,
      name: nickname,
      seat: nextSeat,
      color: PLAYER_COLORS[nextSeat],
      connected: true,
      joinedAt: Date.now()
    });
  }

  await subscribeToRoom(roomCode);
  await markPresenceConnected(roomCode);
}

async function leaveRoom() {
  if (!currentRoomCode || !firebaseUser) return;

  const roomCode = currentRoomCode;
  const wasHost = isRoomHost();

  if (currentRoomUnsubscribe) {
    currentRoomUnsubscribe();
    currentRoomUnsubscribe = null;
  }

  if (wasHost) {
    await remove(getRoomRef(roomCode));
    await runTransaction(getSystemCountRef(), (current) => Math.max((current || 1) - 1, 0));
  } else {
    await remove(ref(db, `rooms/${roomCode}/players/${firebaseUser.uid}`));
  }

  currentRoomCode = null;
  currentRoomData = null;
  localStorage.removeItem("catanCurrentRoomCode");
  updateRoomPanel();
  setStatus("You left the online room.");
}

async function startOnlineMatch() {
  if (!currentRoomCode || !currentRoomData) {
    alertMsg("Create or join a room first.");
    return;
  }

  if (!isRoomHost()) {
    alertMsg("Only the host can start the online match.");
    return;
  }

  const orderedPlayers = getOrderedRoomPlayers(currentRoomData);

  if (orderedPlayers.length < 2) {
    alertMsg("You need at least 2 players to start.");
    return;
  }

  startNewGame({
    players: orderedPlayers.map(player => ({ name: player.name }))
  });

  const seatUidOrder = orderedPlayers.map(player => player.uid);

  await update(getRoomRef(currentRoomCode), {
    "meta/status": "playing",
    "meta/updatedAt": Date.now(),
    "meta/seatUidOrder": seatUidOrder,
    gameState: serializeStateForRoom()
  });
}

async function syncRoomStateNow() {
  if (suppressRoomSync) return;
  if (!currentRoomCode) return;
  if (!currentRoomData) return;
  if (currentRoomData.meta?.status !== "playing") return;
  if (!firebaseUser) return;
  if (!isMyTurnOnline()) return;

  await update(getRoomRef(currentRoomCode), {
    "meta/updatedAt": Date.now(),
    gameState: serializeStateForRoom()
  });
}

function scheduleRoomStateSync() {
  if (suppressRoomSync) return;
  if (!currentRoomCode) return;
  if (!currentRoomData) return;
  if (currentRoomData.meta?.status !== "playing") return;
  if (!firebaseUser) return;
  if (!isMyTurnOnline()) return;

  clearTimeout(roomSyncTimer);
  roomSyncTimer = setTimeout(() => {
    syncRoomStateNow().catch((error) => {
      console.error("Failed to sync room state:", error);
    });
  }, 60);
}






function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function makeResourceBank() {
  return { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 };
}
function resourceCountsEmpty() {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}
function sumResources(resources) {
  return Object.values(resources).reduce((a,b)=>a+b,0);
}
function canAfford(player, cost) {
  return Object.entries(cost).every(([r, n]) => player.resources[r] >= n);
}
function payCost(player, cost) {
  for (const [r, n] of Object.entries(cost)) {
    player.resources[r] -= n;
    state.board.bank[r] += n;
  }
}
function gainResource(player, resource, amount = 1) {
  const bank = state.board.bank;
  const actual = Math.min(amount, bank[resource]);
  player.resources[resource] += actual;
  bank[resource] -= actual;
  return actual;
}
function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 100);
  renderLog();
}
function setStatus(msg) {
  els.statusMessage.textContent = msg;
}
function currentPlayer() {
  return state.players[state.currentPlayer];
}
function playerName(idx) {
  return state.players[idx]?.name || `Player ${idx + 1}`;
}

function axialToPixel(q, r) {
  const size = 85;
  const x = 500 + size * Math.sqrt(3) * (q + r / 2);
  const y = 385 + size * 1.5 * r;
  return { x, y };
}
function hexCorners(center, size=85) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push({ x: center.x + size * Math.cos(angle), y: center.y + size * Math.sin(angle) });
  }
  return points;
}
function pointKey(p) { return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }
function midpoint(a,b) { return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }; }
function dist(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }

function generateBoard() {
  const coords = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      const s = -q-r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) coords.push({ q, r });
    }
  }
  coords.sort((a,b)=> a.r - b.r || a.q - b.q);

  const terrains = shuffle([
    "wood","wood","wood","wood",
    "brick","brick","brick",
    "sheep","sheep","sheep","sheep",
    "wheat","wheat","wheat","wheat",
    "ore","ore","ore",
    "desert"
  ]);

  const hexes = coords.map((c, idx) => {
    const center = axialToPixel(c.q, c.r);
    const corners = hexCorners(center);
    return { id: idx, q: c.q, r: c.r, center, corners, terrain: terrains[idx], number: null, robber: false };
  });

  const redNums = new Set([6,8]);
  let assigned = false;
  const nonDesertHexes = hexes.filter(h => h.terrain !== "desert");
  const numberPoolBase = [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];
  for (let attempt = 0; attempt < 400 && !assigned; attempt++) {
    const pool = shuffle(numberPoolBase);
    nonDesertHexes.forEach((h, i) => h.number = pool[i]);
    const okay = nonDesertHexes.every(h => {
      if (!redNums.has(h.number)) return true;
      return nonDesertHexes.filter(o => o.id !== h.id && redNums.has(o.number)).every(o => !areHexesAdjacent(h,o));
    });
    if (okay) assigned = true;
  }
  const desert = hexes.find(h => h.terrain === "desert");
  desert.robber = true;

  const verticesMap = new Map();
  const edgesMap = new Map();
  const vertexHexes = new Map();

  hexes.forEach(hex => {
    hex.corners.forEach((p, idx) => {
      const key = pointKey(p);
      if (!verticesMap.has(key)) {
        verticesMap.set(key, { id: verticesMap.size, x: p.x, y: p.y, building: null, port: null, adjacentHexes: [] });
      }
      vertexHexes.set(key, (vertexHexes.get(key) || []).concat(hex.id));
    });
    for (let i = 0; i < 6; i++) {
      const a = hex.corners[i], b = hex.corners[(i+1)%6];
      const ak = pointKey(a), bk = pointKey(b);
      const key = [ak,bk].sort().join("|");
      if (!edgesMap.has(key)) {
        edgesMap.set(key, { id: edgesMap.size, aKey: ak, bKey: bk, owner: null, hexes: [] });
      }
      edgesMap.get(key).hexes.push(hex.id);
    }
  });

  const vertices = Array.from(verticesMap.values());
  vertices.forEach(v => { v.adjacentHexes = vertexHexes.get(pointKey(v)) || []; });
  const edges = Array.from(edgesMap.values()).map(e => ({
    ...e,
    a: verticesMap.get(e.aKey).id,
    b: verticesMap.get(e.bKey).id
  }));

  const neighborsByVertex = new Map(vertices.map(v => [v.id, new Set()]));
  edges.forEach(e => {
    neighborsByVertex.get(e.a).add(e.b);
    neighborsByVertex.get(e.b).add(e.a);
  });

  const perimeterEdges = edges.filter(e => e.hexes.length === 1)
    .sort((ea, eb) => {
      const ma = midpoint(vertices[ea.a], vertices[ea.b]);
      const mb = midpoint(vertices[eb.a], vertices[eb.b]);
      return Math.atan2(ma.y-385, ma.x-500) - Math.atan2(mb.y-385, mb.x-500);
    });
  PORT_TYPES.forEach((type, idx) => {
    const edge = perimeterEdges[Math.floor(idx * perimeterEdges.length / PORT_TYPES.length)];
    if (!edge) return;
    vertices[edge.a].port = type;
    vertices[edge.b].port = type;
  });

  return {
    hexes,
    vertices,
    edges,
    neighborsByVertex,
    bank: makeResourceBank(),
    discardQueue: [],
    pendingStealVictims: []
  };
}

function areHexesAdjacent(a,b) {
  const dq = a.q - b.q, dr = a.r - b.r, ds = (-a.q-a.r) - (-b.q-b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) === 1;
}

function setupPlayers(configs) {
  return configs.map((cfg, i) => ({
    id: i,
    name: cfg.name || `Player ${i+1}`,
    color: PLAYER_COLORS[i],
    resources: resourceCountsEmpty(),
    roadsLeft: 15,
    settlementsLeft: 5,
    citiesLeft: 4,
    roads: [],
    settlements: [],
    cities: [],
    devCards: [],
    newDevCards: [],
    knightsPlayed: 0,
    ports: new Set()
  }));
}

function startNewGame(config) {
  state.board = generateBoard();
  state.players = setupPlayers(config.players);
  state.devDeck = shuffle(DEV_DECK_TEMPLATE);
  state.gameStarted = true;
  state.phase = "setup";
  state.startPlayer = randInt(0, state.players.length - 1);
  state.currentPlayer = state.startPlayer;
  state.setupRound = 1;
  state.setupDirection = 1;
  state.setupOrderIndex = 0;
  state.diceRolled = false;
  state.dice = null;
  state.pendingAction = { type: "buildSettlement", free: true, source: "setup" };
  state.robberNeedsDiscard = null;
  state.robberMoveReason = null;
  state.longestRoadOwner = null;
  state.largestArmyOwner = null;
  state.log = [];
  state.winner = null;
  addLog(`${playerName(state.startPlayer)} starts the setup phase.`);
  setStatus(`${playerName(state.currentPlayer)}: place your first settlement.`);
  render();
}

function render() {
  renderBoard();
  renderSidebar();
  renderLog();
  renderControls();
  updateRoomPanel();
  scheduleRoomStateSync();
}


function terrainAssetPath(terrain) {
  return `assets/hexes/${terrain}.png`; // use uploaded PNG terrain tiles
}


function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const pieceAssetCache = new Map();

function shadeColor(hex, amt) {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `#${[r,g,b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function getPieceAsset(type, color) {
  const key = `${type}-${color}`;
  if (pieceAssetCache.has(key)) return pieceAssetCache.get(key);

  const roof = shadeColor(color, -18);
  const roofLight = shadeColor(color, 34);
  const trim = shadeColor(color, -54);
  const windowLight = "#d9f2ff";
  const wall = "#dec7a4";
  const wallDark = "#ae8f6e";
  const wood = "#6d4b31";
  const svgMap = {
    road: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 64">
        <defs>
          <linearGradient id="roadBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#9b6a3c"/>
            <stop offset="52%" stop-color="#7b4f2a"/>
            <stop offset="100%" stop-color="#5e3c1d"/>
          </linearGradient>
          <linearGradient id="roadStripe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${roofLight}"/>
            <stop offset="100%" stop-color="${roof}"/>
          </linearGradient>
          <filter id="shadow" x="-30%" y="-80%" width="160%" height="240%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="rgba(0,0,0,.45)"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <rect x="10" y="12" width="160" height="40" rx="16" fill="url(#roadBody)" stroke="#3f2814" stroke-width="3"/>
          <rect x="24" y="21" width="132" height="22" rx="10" fill="url(#roadStripe)" opacity=".96"/>
          <g opacity=".28" stroke="#3a2514" stroke-width="2">
            <line x1="38" y1="16" x2="28" y2="48"/>
            <line x1="66" y1="14" x2="56" y2="50"/>
            <line x1="95" y1="14" x2="85" y2="50"/>
            <line x1="124" y1="14" x2="114" y2="50"/>
            <line x1="151" y1="15" x2="141" y2="49"/>
          </g>
          <rect x="18" y="17" width="144" height="7" rx="3.5" fill="rgba(255,255,255,.22)"/>
        </g>
      </svg>`,
    settlement: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 102">
        <defs>
          <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${roofLight}"/>
            <stop offset="100%" stop-color="${roof}"/>
          </linearGradient>
          <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f4e4c5"/>
            <stop offset="100%" stop-color="${wall}"/>
          </linearGradient>
          <filter id="shadow" x="-25%" y="-25%" width="160%" height="180%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="rgba(0,0,0,.45)"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <path d="M16 92 L16 48 L46 24 L76 48 L76 92 Z" fill="url(#wallGrad)" stroke="${trim}" stroke-width="3" />
          <path d="M9 49 L46 16 L83 49 L72 55 L46 32 L20 55 Z" fill="url(#roofGrad)" stroke="${trim}" stroke-width="3"/>
          <rect x="38" y="60" width="16" height="32" rx="3" fill="${wood}" />
          <rect x="22" y="58" width="12" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <rect x="58" y="58" width="12" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <path d="M61 23 h9 v15 h-9 z" fill="${wallDark}" stroke="${trim}" stroke-width="2"/>
          <path d="M17 93 h58" stroke="rgba(0,0,0,.22)" stroke-width="5" stroke-linecap="round"/>
          <path d="M19 51 h54" stroke="rgba(255,255,255,.25)" stroke-width="4" stroke-linecap="round"/>
        </g>
      </svg>`,
    city: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 114">
        <defs>
          <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${roofLight}"/>
            <stop offset="100%" stop-color="${roof}"/>
          </linearGradient>
          <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f4e4c5"/>
            <stop offset="100%" stop-color="${wall}"/>
          </linearGradient>
          <filter id="shadow" x="-25%" y="-25%" width="160%" height="180%">
            <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="rgba(0,0,0,.45)"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <rect x="20" y="47" width="80" height="54" rx="6" fill="url(#wallGrad)" stroke="${trim}" stroke-width="3"/>
          <path d="M12 51 L60 17 L108 51 L97 58 L60 32 L23 58 Z" fill="url(#roofGrad)" stroke="${trim}" stroke-width="3"/>
          <rect x="30" y="33" width="18" height="68" rx="4" fill="url(#wallGrad)" stroke="${trim}" stroke-width="3"/>
          <rect x="72" y="33" width="18" height="68" rx="4" fill="url(#wallGrad)" stroke="${trim}" stroke-width="3"/>
          <path d="M24 38 L39 24 L54 38 Z" fill="url(#roofGrad)" stroke="${trim}" stroke-width="3"/>
          <path d="M66 38 L81 24 L96 38 Z" fill="url(#roofGrad)" stroke="${trim}" stroke-width="3"/>
          <rect x="52" y="66" width="16" height="35" rx="3" fill="${wood}" />
          <rect x="33" y="57" width="11" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <rect x="76" y="57" width="11" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <rect x="33" y="75" width="11" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <rect x="76" y="75" width="11" height="12" rx="2" fill="${windowLight}" stroke="${trim}" stroke-width="2"/>
          <path d="M23 102 h74" stroke="rgba(0,0,0,.22)" stroke-width="6" stroke-linecap="round"/>
          <path d="M25 54 h70" stroke="rgba(255,255,255,.22)" stroke-width="4" stroke-linecap="round"/>
        </g>
      </svg>`
  };
  const uri = svgToDataUri(svgMap[type]);
  pieceAssetCache.set(key, uri);
  return uri;
}

function drawRoadPiece(svg, edge, player) {
  const a = state.board.vertices[edge.a];
  const b = state.board.vertices[edge.b];
  const mid = midpoint(a, b);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const road = document.createElementNS("http://www.w3.org/2000/svg", "image");
  road.setAttribute("href", getPieceAsset("road", player.color));
  road.setAttribute("x", mid.x - 46);
  road.setAttribute("y", mid.y - 18);
  road.setAttribute("width", 92);
  road.setAttribute("height", 36);
  road.setAttribute("preserveAspectRatio", "xMidYMid meet");
  road.setAttribute("transform", `rotate(${angle} ${mid.x} ${mid.y})`);
  road.setAttribute("class", "road-piece");
  svg.appendChild(road);
}

function drawSettlementPiece(svg, vertex, player) {
  const settlement = document.createElementNS("http://www.w3.org/2000/svg", "image");
  settlement.setAttribute("href", getPieceAsset("settlement", player.color));
  settlement.setAttribute("x", vertex.x - 24);
  settlement.setAttribute("y", vertex.y - 50);
  settlement.setAttribute("width", 48);
  settlement.setAttribute("height", 54);
  settlement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  settlement.setAttribute("class", "settlement-piece");
  svg.appendChild(settlement);
}

function drawCityPiece(svg, vertex, player) {
  const city = document.createElementNS("http://www.w3.org/2000/svg", "image");
  city.setAttribute("href", getPieceAsset("city", player.color));
  city.setAttribute("x", vertex.x - 32);
  city.setAttribute("y", vertex.y - 58);
  city.setAttribute("width", 64);
  city.setAttribute("height", 62);
  city.setAttribute("preserveAspectRatio", "xMidYMid meet");
  city.setAttribute("class", "city-piece");
  svg.appendChild(city);
}

function renderBoard() {
  const svg = els.board;
  svg.innerHTML = "";
  if (!state.board) return;

  const canInteractOnline = !currentRoomCode || isMyTurnOnline();

  state.board.hexes.forEach(hex => {
    const points = hex.corners.map(p => `${p.x},${p.y}`).join(" ");
    const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clip.setAttribute("id", `hex-clip-${hex.id}`);
    const clipPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    clipPoly.setAttribute("points", points);
    clip.appendChild(clipPoly);
    svg.appendChild(clip);

    const border = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    border.setAttribute("points", points);
    border.setAttribute("fill", RESOURCE_COLORS[hex.terrain]);
    border.setAttribute("class", "hex-base");
    border.dataset.hexId = hex.id;
    if (canInteractOnline && state.pendingAction?.type === "moveRobber" && !hex.robber) {
      border.style.cursor = "pointer";
      border.addEventListener("click", () => attemptMoveRobber(hex.id));
    }
    svg.appendChild(border);

    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("href", terrainAssetPath(hex.terrain));
    img.setAttribute("x", hex.center.x - 94);
    img.setAttribute("y", hex.center.y - 94);
    img.setAttribute("width", 188);
    img.setAttribute("height", 188);
    img.setAttribute("clip-path", `url(#hex-clip-${hex.id})`);
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    img.setAttribute("class", "hex-image");
    if (canInteractOnline && state.pendingAction?.type === "moveRobber" && !hex.robber) {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => attemptMoveRobber(hex.id));
    }
    svg.appendChild(img);

    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    overlay.setAttribute("points", points);
    overlay.setAttribute("class", "hex-overlay");
    svg.appendChild(overlay);

    const labelBackdrop = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    labelBackdrop.setAttribute("x", hex.center.x - 44);
    labelBackdrop.setAttribute("y", hex.center.y - 34);
    labelBackdrop.setAttribute("width", 88);
    labelBackdrop.setAttribute("height", 24);
    labelBackdrop.setAttribute("rx", 12);
    labelBackdrop.setAttribute("class", "hex-label-backdrop");
    svg.appendChild(labelBackdrop);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", hex.center.x);
    label.setAttribute("y", hex.center.y - 22);
    label.setAttribute("class", "hex-label terrain-name");
    label.textContent = hex.terrain === "desert" ? "Desert" : capitalize(hex.terrain);
    label.setAttribute("font-size", "15");
    svg.appendChild(label);

    if (hex.number) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", hex.center.x);
      c.setAttribute("cy", hex.center.y + 24);
      c.setAttribute("r", 24);
      c.setAttribute("class", `hex-token ${[6,8].includes(hex.number) ? 'red' : ''}`);
      svg.appendChild(c);

      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", hex.center.x);
      t.setAttribute("y", hex.center.y + 26);
      t.setAttribute("class", "hex-label token-text");
      t.textContent = hex.number;
      svg.appendChild(t);
    }

    if (hex.robber) {
      const robber = document.createElementNS("http://www.w3.org/2000/svg", "image");
      robber.setAttribute("href", "assets/robber.png");
      robber.setAttribute("x", hex.center.x - 42);
      robber.setAttribute("y", hex.center.y - 78);
      robber.setAttribute("width", 84);
      robber.setAttribute("height", 84);
      robber.setAttribute("preserveAspectRatio", "xMidYMid meet");
      robber.setAttribute("class", "robber robber-image");
      svg.appendChild(robber);
    }
  });

  state.board.edges.forEach(edge => {
    const a = state.board.vertices[edge.a], b = state.board.vertices[edge.b];
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", a.x); hit.setAttribute("y1", a.y);
    hit.setAttribute("x2", b.x); hit.setAttribute("y2", b.y);
    let edgeClass = "edge-hit";
    if (canInteractOnline && state.pendingAction?.type === "buildRoad") {
      edgeClass += validRoadSpot(edge.id, state.currentPlayer) ? " edge-hit-active" : " edge-hit-disabled";
      hit.addEventListener("click", () => attemptBuildRoad(edge.id));
    }
    hit.setAttribute("class", edgeClass);
    svg.appendChild(hit);

    if (edge.owner !== null) {
      drawRoadPiece(svg, edge, state.players[edge.owner]);
    }
  });

  state.board.vertices.forEach(v => {
    if (v.port) {
      const angle = Math.atan2(v.y - 385, v.x - 500);
      const tx = v.x + Math.cos(angle) * 38;
      const ty = v.y + Math.sin(angle) * 38;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", tx); text.setAttribute("y", ty);
      text.setAttribute("class", "port-label");
      text.textContent = v.port === "3:1" ? "3:1" : `${v.port[0].toUpperCase()}:2`;
      svg.appendChild(text);
    }

    const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hit.setAttribute("cx", v.x); hit.setAttribute("cy", v.y); hit.setAttribute("r", 12);
    let vertexClass = "vertex";
    if (canInteractOnline && state.pendingAction?.type === "buildSettlement") {
      vertexClass += validSettlementSpot(v.id, state.currentPlayer, state.phase === "setup") ? " vertex-active" : " vertex-disabled";
      hit.addEventListener("click", () => attemptBuildSettlement(v.id));
    } else if (canInteractOnline && state.pendingAction?.type === "buildCity") {
      const canUpgrade = !!(v.building && v.building.owner === state.currentPlayer && v.building.type === "settlement");
      vertexClass += canUpgrade ? " vertex-active" : " vertex-disabled";
      hit.addEventListener("click", () => attemptBuildCity(v.id));
    }
    hit.setAttribute("class", vertexClass);
    svg.appendChild(hit);

    if (v.building) {
      const player = state.players[v.building.owner];
      if (v.building.type === "settlement") {
        drawSettlementPiece(svg, v, player);
      } else {
        drawCityPiece(svg, v, player);
      }
    }
  });
}

function renderSidebar() {
  const p = currentPlayer();
  els.phaseLabel.textContent = state.phase === "setup" ? `Setup Round ${state.setupRound}` : capitalize(state.phase);
  els.turnLabel.textContent = state.gameStarted ? `• ${p.name}` : "";
  els.diceResult.textContent = state.dice ? `${state.dice[0]} + ${state.dice[1]} = ${state.dice[0] + state.dice[1]}` : "-";

  if (!p) {
    els.currentPlayerCard.innerHTML = "";
    els.vpSummary.innerHTML = "";
    els.devSummary.innerHTML = "";
    return;
  }

  els.currentPlayerCard.innerHTML = `
    <div class="player-card">
      <div class="player-dot" style="background:${p.color}"></div>
      <div>
        <div><strong>${escapeHtml(p.name)}</strong></div>
        <div class="resource-row">
          ${RESOURCES.map(r => `<span class="badge">${capitalize(r)}: ${p.resources[r]}</span>`).join("")}
        </div>
        <div class="cost-row">
          <span class="badge">Roads left: ${p.roadsLeft}</span>
          <span class="badge">Settlements left: ${p.settlementsLeft}</span>
          <span class="badge">Cities left: ${p.citiesLeft}</span>
        </div>
      </div>
    </div>`;

  const stats = state.players.map((pl, idx) => {
    const vps = computeVictoryPoints(idx);
    return `<div class="mini-stat"><strong>${escapeHtml(pl.name)}</strong><br>VP: ${vps}<br>Knights: ${pl.knightsPlayed}<br>Road: ${computeLongestRoadForPlayer(idx)}</div>`;
  }).join("");
  els.vpSummary.innerHTML = stats;

  const allDev = countDevCards(p.devCards.concat(p.newDevCards));
  els.devSummary.innerHTML = `
    <div class="resource-row">
      <span class="badge">Knight: ${allDev.knight}</span>
      <span class="badge">Road Building: ${allDev.roadBuilding}</span>
      <span class="badge">Year of Plenty: ${allDev.yearOfPlenty}</span>
      <span class="badge">Monopoly: ${allDev.monopoly}</span>
      <span class="badge">Victory Point: ${allDev.victoryPoint}</span>
      <span class="badge">Deck left: ${state.devDeck.length}</span>
    </div>
    <p class="small-note">Cards bought this turn cannot be played until your next turn, except victory point cards, which count immediately.</p>
  `;
}

function renderLog() {
  els.log.innerHTML = state.log.map(msg => `<div class="log-entry">${escapeHtml(msg)}</div>`).join("");
}

function renderControls() {
  const isActive = state.gameStarted && !state.winner;
  const onlineTurnBlocked = !!currentRoomCode && !isMyTurnOnline();

  els.rollBtn.disabled =
    !isActive || state.phase !== "play" || state.diceRolled || !!state.pendingAction || state.tradeLock || onlineTurnBlocked;

  els.endTurnBtn.disabled =
    !isActive || state.phase !== "play" || !state.diceRolled || !!state.pendingAction || !!state.robberNeedsDiscard || state.tradeLock || onlineTurnBlocked;

  els.finishActionBtn.disabled = !state.pendingAction || onlineTurnBlocked;

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.disabled = !isActive || onlineTurnBlocked;
  });

  els.newGameBtn.disabled = !!currentRoomCode;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
function countDevCards(cards) {
  const count = { knight:0, roadBuilding:0, yearOfPlenty:0, monopoly:0, victoryPoint:0 };
  cards.forEach(c => count[c]++);
  return count;
}

function getVertexNeighbors(vertexId) {
  return Array.from(state.board.neighborsByVertex.get(vertexId) || []);
}
function getEdgesForVertex(vertexId) {
  return state.board.edges.filter(e => e.a === vertexId || e.b === vertexId);
}
function getRoadBetween(a,b) {
  return state.board.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

function validSettlementSpot(vertexId, playerId, setup = false) {
  const vertex = state.board.vertices[vertexId];
  if (vertex.building) return false;
  const near = getVertexNeighbors(vertexId);
  if (near.some(id => state.board.vertices[id].building)) return false;
  if (setup) return true;
  return getEdgesForVertex(vertexId).some(e => e.owner === playerId);
}

function attemptBuildSettlement(vertexId) {
  const player = currentPlayer();
  const free = !!state.pendingAction?.free;
  const setup = state.phase === "setup";
  if (player.settlementsLeft <= 0) return alertMsg("No settlements left.");
  if (!validSettlementSpot(vertexId, player.id, setup)) return alertMsg("Settlement cannot be built there. Check the distance rule and connection rule.");
  if (!free && !canAfford(player, BUILD_COSTS.settlement)) return alertMsg("Not enough resources for a settlement.");

  if (!free) payCost(player, BUILD_COSTS.settlement);
  placeSettlement(player.id, vertexId);

  if (setup) {
    state.pendingAction = { type: "buildRoad", free: true, source: "setupRoad", anchorVertex: vertexId };
    setStatus(`${player.name}: place the road connected to your new settlement.`);
  } else {
    state.pendingAction = null;
    setStatus(`${player.name} built a settlement.`);
  }
  finishAfterAction();
}

function placeSettlement(playerId, vertexId) {
  const player = state.players[playerId];
  const vertex = state.board.vertices[vertexId];
  vertex.building = { type: "settlement", owner: playerId };
  player.settlements.push(vertexId);
  player.settlementsLeft--;
  if (vertex.port) player.ports.add(vertex.port);
  addLog(`${player.name} built a settlement.`);
}

function attemptBuildCity(vertexId) {
  const player = currentPlayer();
  const vertex = state.board.vertices[vertexId];
  if (!vertex.building || vertex.building.owner !== player.id || vertex.building.type !== "settlement") return alertMsg("You can only upgrade your own settlement to a city.");
  if (player.citiesLeft <= 0) return alertMsg("No cities left.");
  if (!canAfford(player, BUILD_COSTS.city)) return alertMsg("Not enough resources for a city.");
  payCost(player, BUILD_COSTS.city);
  vertex.building.type = "city";
  player.cities.push(vertexId);
  player.settlements = player.settlements.filter(v => v !== vertexId);
  player.citiesLeft--;
  player.settlementsLeft++;
  addLog(`${player.name} upgraded a settlement to a city.`);
  state.pendingAction = null;
  finishAfterAction();
}

function validRoadSpot(edgeId, playerId) {
  const edge = state.board.edges[edgeId];
  if (edge.owner !== null) return false;
  const a = state.board.vertices[edge.a], b = state.board.vertices[edge.b];
  const anchor = state.pendingAction?.anchorVertex;
  if (anchor !== undefined && edge.a !== anchor && edge.b !== anchor) return false;
  const ownBuildingTouch = [edge.a, edge.b].some(vId => {
    const bld = state.board.vertices[vId].building;
    return bld && bld.owner === playerId;
  });
  const ownRoadTouch = state.board.edges.some(e => e.owner === playerId && [e.a,e.b].some(v => [edge.a,edge.b].includes(v)));
  return ownBuildingTouch || ownRoadTouch || state.phase === "setup";
}

function attemptBuildRoad(edgeId) {
  const player = currentPlayer();
  const free = !!state.pendingAction?.free;
  if (player.roadsLeft <= 0) return alertMsg("No roads left.");
  if (!validRoadSpot(edgeId, player.id)) return alertMsg("Road must connect to your network or the setup settlement.");
  if (!free && !canAfford(player, BUILD_COSTS.road)) return alertMsg("Not enough resources for a road.");
  if (!free) payCost(player, BUILD_COSTS.road);
  const edge = state.board.edges[edgeId];
  edge.owner = player.id;
  player.roads.push(edgeId);
  player.roadsLeft--;
  addLog(`${player.name} built a road.`);

  if (state.phase === "setup") {
    handleSetupAdvance(edgeId);
  } else if (state.pendingAction?.source === "roadBuildingCard") {
    state.pendingAction.remaining--;
    if (state.pendingAction.remaining > 0) {
      setStatus(`${player.name}: place 1 more free road.`);
    } else {
      state.pendingAction = null;
      setStatus(`${player.name} finished Road Building.`);
    }
  } else {
    state.pendingAction = null;
  }
  updateSpecialAwards();
  finishAfterAction();
}

function handleSetupAdvance() {
  const cp = state.currentPlayer;
  const player = state.players[cp];
  if (state.setupRound === 2) {
    const latestSettlement = [...player.settlements].slice(-1)[0];
    grantStartingResources(player.id, latestSettlement);
  }

  state.setupOrderIndex++;
  const orderRound1 = playerOrderForward();
  const orderRound2 = [...orderRound1].reverse();
  const activeOrder = state.setupRound === 1 ? orderRound1 : orderRound2;

  if (state.setupOrderIndex >= activeOrder.length) {
    if (state.setupRound === 1) {
      state.setupRound = 2;
      state.setupOrderIndex = 0;
      state.currentPlayer = orderRound2[0];
      state.pendingAction = { type: "buildSettlement", free: true, source: "setup" };
      setStatus(`${playerName(state.currentPlayer)}: place your second settlement.`);
    } else {
      state.phase = "play";
      state.currentPlayer = state.startPlayer;
      state.pendingAction = null;
      state.diceRolled = false;
      setStatus(`${playerName(state.currentPlayer)}: roll the dice to begin the game.`);
      addLog(`Setup complete. ${playerName(state.currentPlayer)} begins play.`);
    }
  } else {
    state.currentPlayer = activeOrder[state.setupOrderIndex];
    state.pendingAction = { type: "buildSettlement", free: true, source: "setup" };
    setStatus(`${playerName(state.currentPlayer)}: place ${state.setupRound === 1 ? 'your first' : 'your second'} settlement.`);
  }
}

function playerOrderForward() {
  const arr = [];
  for (let i = 0; i < state.players.length; i++) arr.push((state.startPlayer + i) % state.players.length);
  return arr;
}

function grantStartingResources(playerId, settlementVertexId) {
  const player = state.players[playerId];
  const vertex = state.board.vertices[settlementVertexId];
  let gained = [];
  vertex.adjacentHexes.forEach(hexId => {
    const hex = state.board.hexes[hexId];
    if (hex.terrain !== "desert") {
      const amount = gainResource(player, hex.terrain, 1);
      if (amount) gained.push(hex.terrain);
    }
  });
  addLog(`${player.name} received starting resources: ${gained.join(", ") || 'none (bank empty)'}.`);
}

function finishAfterAction() {
  updateSpecialAwards();
  checkWinner();
  render();
}

function attemptRollDice() {
  if (state.phase !== "play" || state.diceRolled || state.pendingAction) return;
  const d1 = randInt(1,6), d2 = randInt(1,6);
  state.dice = [d1,d2];
  state.diceRolled = true;
  const total = d1 + d2;
  addLog(`${currentPlayer().name} rolled ${total}.`);
  if (total === 7) {
    handleSevenRolled();
  } else {
    distributeResources(total);
    setStatus(`${currentPlayer().name}: you may trade, build, play 1 development card, or end your turn.`);
  }
  render();
}

function distributeResources(total) {
  const gains = [];
  state.board.hexes.forEach(hex => {
    if (hex.number !== total || hex.robber || hex.terrain === "desert") return;
    state.board.vertices.forEach(v => {
      if (v.adjacentHexes.includes(hex.id) && v.building) {
        const player = state.players[v.building.owner];
        const amountNeeded = v.building.type === "city" ? 2 : 1;
        const amountGot = gainResource(player, hex.terrain, amountNeeded);
        if (amountGot > 0) gains.push(`${player.name} +${amountGot} ${hex.terrain}`);
      }
    });
  });
  addLog(gains.length ? `Resources distributed: ${gains.join("; ")}.` : `No resources were distributed for ${total}.`);
}

function handleSevenRolled() {
  const toDiscard = [];
  state.players.forEach((p, idx) => {
    const total = sumResources(p.resources);
    if (total > 7) toDiscard.push({ playerId: idx, amount: Math.floor(total / 2) });
  });
  if (toDiscard.length) {
    state.robberNeedsDiscard = toDiscard;
    addLog(`A 7 was rolled. Players with more than 7 resources must discard half.`);
    processNextDiscard();
  } else {
    state.pendingAction = { type: "moveRobber", free: true };
    state.robberMoveReason = "seven";
    setStatus(`${currentPlayer().name}: move the robber.`);
  }
}

function processNextDiscard() {
  if (!state.robberNeedsDiscard?.length) {
    state.robberNeedsDiscard = null;
    state.pendingAction = { type: "moveRobber", free: true };
    state.robberMoveReason = "seven";
    setStatus(`${currentPlayer().name}: move the robber.`);
    render();
    return;
  }
  const next = state.robberNeedsDiscard.shift();
  openDiscardModal(next.playerId, next.amount, () => processNextDiscard());
}

function attemptMoveRobber(hexId) {
  if (state.pendingAction?.type !== "moveRobber") return;
  state.board.hexes.forEach(h => h.robber = false);
  const target = state.board.hexes[hexId];
  target.robber = true;
  addLog(`${currentPlayer().name} moved the robber to ${capitalize(target.terrain)} (${target.number || 'desert'}).`);
  const victims = getRobberVictims(hexId).filter(id => id !== state.currentPlayer);
  if (victims.length) {
    chooseRobberVictim(victims);
  } else {
    state.pendingAction = null;
    state.robberMoveReason = null;
    setStatus(`${currentPlayer().name}: no one could be robbed. Continue your turn.`);
    finishAfterAction();
  }
}

function getRobberVictims(hexId) {
  const owners = new Set();
  state.board.vertices.forEach(v => {
    if (v.building && v.adjacentHexes.includes(hexId)) owners.add(v.building.owner);
  });
  return Array.from(owners).filter(id => sumResources(state.players[id].resources) > 0);
}

function chooseRobberVictim(victims) {
  openModal({
    title: "Choose player to rob",
    body: `<div class="form-grid single">${victims.map(id => `<button data-victim="${id}">${escapeHtml(playerName(id))}</button>`).join("")}</div>`,
    actions: [{ label: "Cancel", className: "secondary", onClick: closeModal }],
    onRender(modal) {
      modal.querySelectorAll("[data-victim]").forEach(btn => {
        btn.addEventListener("click", () => {
          stealRandomResource(state.currentPlayer, Number(btn.dataset.victim));
          closeModal();
          state.pendingAction = null;
          state.robberMoveReason = null;
          setStatus(`${currentPlayer().name}: continue your turn.`);
          finishAfterAction();
        });
      });
    }
  });
}

function stealRandomResource(fromId, victimId) {
  const victim = state.players[victimId];
  const options = RESOURCES.filter(r => victim.resources[r] > 0);
  if (!options.length) return;
  const res = options[randInt(0, options.length - 1)];
  victim.resources[res]--;
  state.players[fromId].resources[res]++;
  addLog(`${playerName(fromId)} stole 1 ${res} from ${playerName(victimId)}.`);
}

function buyDevelopmentCard() {
  const player = currentPlayer();
  if (!state.diceRolled) return alertMsg("Roll the dice first.");
  if (!state.devDeck.length) return alertMsg("No development cards left.");
  if (!canAfford(player, BUILD_COSTS.dev)) return alertMsg("Not enough resources to buy a development card.");
  payCost(player, BUILD_COSTS.dev);
  const card = state.devDeck.pop();
  player.newDevCards.push(card);
  addLog(`${player.name} bought a development card.`);
  if (card === "victoryPoint") addLog(`${player.name} received a hidden Victory Point card.`);
  finishAfterAction();
}

function openPlayDevCardModal() {
  const player = currentPlayer();
  if (!state.diceRolled) return alertMsg("Roll the dice first.");
  if (state.pendingAction) return alertMsg("Finish the current action first.");
  if (player.playedDevThisTurn) return alertMsg("You may play only 1 development card per turn.");
  const playable = countDevCards(player.devCards);
  const choices = ["knight","roadBuilding","yearOfPlenty","monopoly"].filter(c => playable[c] > 0);
  if (!choices.length) return alertMsg("No playable development cards available.");

  openModal({
    title: "Play Development Card",
    body: `<div class="form-grid single">${choices.map(c => `<button data-card="${c}">${formatDev(c)} (${playable[c]})</button>`).join("")}</div>`,
    actions: [{ label: "Close", className: "secondary", onClick: closeModal }],
    onRender(modal) {
      modal.querySelectorAll("[data-card]").forEach(btn => btn.addEventListener("click", () => {
        playDevelopmentCard(btn.dataset.card);
        closeModal();
      }));
    }
  });
}

function playDevelopmentCard(card) {
  const player = currentPlayer();
  const idx = player.devCards.indexOf(card);
  if (idx === -1) return;
  player.devCards.splice(idx,1);
  player.playedDevThisTurn = true;
  addLog(`${player.name} played ${formatDev(card)}.`);

  if (card === "knight") {
    player.knightsPlayed++;
    updateSpecialAwards();
    state.pendingAction = { type: "moveRobber", free: true };
    state.robberMoveReason = "knight";
    setStatus(`${player.name}: move the robber.`);
  } else if (card === "roadBuilding") {
    state.pendingAction = { type: "buildRoad", free: true, source: "roadBuildingCard", remaining: 2 };
    setStatus(`${player.name}: place 2 free roads.`);
  } else if (card === "yearOfPlenty") {
    openYearOfPlentyModal();
  } else if (card === "monopoly") {
    openMonopolyModal();
  }
  finishAfterAction();
}

function openYearOfPlentyModal() {
  const options = RESOURCES.map(r => `<option value="${r}">${capitalize(r)}</option>`).join("");
  openModal({
    title: "Year of Plenty",
    body: `
      <div class="form-grid">
        <label>First resource<select id="yop1">${options}</select></label>
        <label>Second resource<select id="yop2">${options}</select></label>
      </div>
      <p class="small-note">You gain up to 2 resources from the bank, subject to bank availability.</p>`,
    actions: [
      { label: "Take Resources", onClick: (modal) => {
        const r1 = modal.querySelector("#yop1").value;
        const r2 = modal.querySelector("#yop2").value;
        const p = currentPlayer();
        const got1 = gainResource(p, r1, 1);
        const got2 = gainResource(p, r2, 1);
        addLog(`${p.name} used Year of Plenty and gained ${got1 ? r1 : 'nothing'}${got2 ? ` and ${r2}` : ''}.`);
        closeModal();
        render();
      }}
    ]
  });
}

function openMonopolyModal() {
  const options = RESOURCES.map(r => `<option value="${r}">${capitalize(r)}</option>`).join("");
  openModal({
    title: "Monopoly",
    body: `<label>Choose resource<select id="monoRes">${options}</select></label>`,
    actions: [{ label: "Collect", onClick: (modal) => {
      const r = modal.querySelector("#monoRes").value;
      let total = 0;
      state.players.forEach((pl, idx) => {
        if (idx === state.currentPlayer) return;
        total += pl.resources[r];
        pl.resources[r] = 0;
      });
      currentPlayer().resources[r] += total;
      addLog(`${currentPlayer().name} used Monopoly and collected ${total} ${r}.`);
      closeModal();
      render();
    }}]
  });
}

function updateSpecialAwards() {
  let bestRoad = { owner: null, len: 4 };
  state.players.forEach((p, idx) => {
    const len = computeLongestRoadForPlayer(idx);
    if (len > bestRoad.len) bestRoad = { owner: idx, len };
  });
  state.longestRoadOwner = bestRoad.owner;

  let bestArmy = { owner: null, size: 2 };
  state.players.forEach((p, idx) => {
    if (p.knightsPlayed > bestArmy.size) bestArmy = { owner: idx, size: p.knightsPlayed };
  });
  state.largestArmyOwner = bestArmy.owner;
}

function computeLongestRoadForPlayer(playerId) {
  const roadEdges = state.board.edges.filter(e => e.owner === playerId);
  if (!roadEdges.length) return 0;
  const blocked = new Set(
    state.board.vertices
      .filter(v => v.building && v.building.owner !== playerId)
      .map(v => v.id)
  );
  const adj = new Map();
  roadEdges.forEach(e => {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push({ edgeId: e.id, to: e.b });
    adj.get(e.b).push({ edgeId: e.id, to: e.a });
  });

  let best = 0;
  function dfs(vertex, usedEdges, length) {
    best = Math.max(best, length);
    for (const link of adj.get(vertex) || []) {
      if (usedEdges.has(link.edgeId)) continue;
      if (blocked.has(vertex) && length > 0) continue;
      usedEdges.add(link.edgeId);
      dfs(link.to, usedEdges, length + 1);
      usedEdges.delete(link.edgeId);
    }
  }
  for (const v of adj.keys()) dfs(v, new Set(), 0);
  return best;
}

function computeVictoryPoints(playerId) {
  const p = state.players[playerId];
  let vp = p.settlements.length + p.cities.length * 2;
  vp += p.devCards.filter(c => c === "victoryPoint").length + p.newDevCards.filter(c => c === "victoryPoint").length;
  if (state.longestRoadOwner === playerId) vp += 2;
  if (state.largestArmyOwner === playerId) vp += 2;
  return vp;
}

function checkWinner() {
  for (let i = 0; i < state.players.length; i++) {
    const vp = computeVictoryPoints(i);
    if (vp >= 10) {
      state.winner = i;
      addLog(`${playerName(i)} wins with ${vp} victory points!`);
      setStatus(`${playerName(i)} wins the game.`);
      break;
    }
  }
}

function openBankTradeModal() {
  const player = currentPlayer();
  if (!state.diceRolled) return alertMsg("Roll the dice first.");
  const options = RESOURCES.map(r => `<option value="${r}">${capitalize(r)}</option>`).join("");
  openModal({
    title: "Bank / Port Trade",
    body: `
      <div class="notice">4:1 by default. If you have a 3:1 port or matching 2:1 resource port through one of your settlements or cities, the better rate is used automatically.</div>
      <div class="form-grid">
        <label>Give<select id="tradeGive">${options}</select></label>
        <label>Receive<select id="tradeGet">${options}</select></label>
      </div>
      <div id="tradeRateInfo" class="small-note"></div>
    `,
    actions: [{ label: "Trade", onClick: (modal) => {
      const give = modal.querySelector("#tradeGive").value;
      const get = modal.querySelector("#tradeGet").value;
      if (give === get) return alertMsg("Choose different resources.");
      const rate = getBestTradeRate(player, give);
      if (player.resources[give] < rate) return alertMsg(`You need ${rate} ${give}.`);
      if (state.board.bank[get] < 1) return alertMsg(`The bank has no ${get} left.`);
      player.resources[give] -= rate;
      state.board.bank[give] += rate;
      player.resources[get] += 1;
      state.board.bank[get] -= 1;
      addLog(`${player.name} traded ${rate} ${give} for 1 ${get}.`);
      closeModal();
      render();
    }}],
    onRender(modal) {
      const update = () => {
        const give = modal.querySelector("#tradeGive").value;
        modal.querySelector("#tradeRateInfo").textContent = `Current rate for ${give}: ${getBestTradeRate(player, give)}:1`;
      };
      modal.querySelector("#tradeGive").addEventListener("change", update);
      update();
    }
  });
}

function getBestTradeRate(player, resource) {
  if (player.ports.has(resource)) return 2;
  if (player.ports.has("3:1")) return 3;
  return 4;
}

function openPlayerTradeModal() {
  if (!state.diceRolled) return alertMsg("Roll the dice first.");
  const others = state.players.filter((_, idx) => idx !== state.currentPlayer);
  const options = RESOURCES.map(r => `<option value="${r}">${capitalize(r)}</option>`).join("");
  openModal({
    title: "Offer Trade to Another Player",
    body: `
      <div class="form-grid">
        <label>Trade with
          <select id="tradeTarget">${others.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>
        </label>
        <label>Give resource<select id="offerGive">${options}</select></label>
        <label>Give amount<input id="offerGiveAmt" type="number" min="1" value="1"></label>
        <label>Receive resource<select id="offerGet">${options}</select></label>
        <label>Receive amount<input id="offerGetAmt" type="number" min="1" value="1"></label>
      </div>`,
    actions: [{ label: "Send Offer", onClick: (modal) => {
      const targetId = Number(modal.querySelector("#tradeTarget").value);
      const give = modal.querySelector("#offerGive").value;
      const get = modal.querySelector("#offerGet").value;
      const giveAmt = Number(modal.querySelector("#offerGiveAmt").value);
      const getAmt = Number(modal.querySelector("#offerGetAmt").value);
      const me = currentPlayer();
      if (give === get) return alertMsg("Resources must be different.");
      if (giveAmt < 1 || getAmt < 1) return alertMsg("Amounts must be at least 1.");
      if (me.resources[give] < giveAmt) return alertMsg(`You do not have ${giveAmt} ${give}.`);
      closeModal();
      openTradeAcceptanceModal(targetId, { give, get, giveAmt, getAmt });
    }}]
  });
}

function openTradeAcceptanceModal(targetId, offer) {
  state.tradeLock = true;
  const me = currentPlayer();
  const target = state.players[targetId];
  openModal({
    title: `Trade Offer for ${target.name}`,
    body: `<div class="notice">${escapeHtml(me.name)} offers ${offer.giveAmt} ${offer.give} for ${offer.getAmt} ${offer.get}.</div>
           <p>Please let ${escapeHtml(target.name)} decide on this device.</p>`,
    actions: [
      { label: "Decline", className: "secondary", onClick: () => {
        addLog(`${target.name} declined a trade offer from ${me.name}.`);
        state.tradeLock = false;
        closeModal();
        render();
      }},
      { label: "Accept", onClick: () => {
        if (target.resources[offer.get] < offer.getAmt) return alertMsg(`${target.name} does not have enough ${offer.get}.`);
        me.resources[offer.give] -= offer.giveAmt;
        target.resources[offer.give] += offer.giveAmt;
        target.resources[offer.get] -= offer.getAmt;
        me.resources[offer.get] += offer.getAmt;
        addLog(`${target.name} accepted a trade with ${me.name}.`);
        state.tradeLock = false;
        closeModal();
        render();
      }}
    ]
  });
}

function openTransferModal() {
  const playersOptions = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  const resOptions = RESOURCES.map(r => `<option value="${r}">${capitalize(r)}</option>`).join("");
  openModal({
    title: "Manual Resource Transfer",
    body: `
      <div class="notice warn">Use this only for local table corrections, teaching games, or voluntary transfers.</div>
      <div class="form-grid">
        <label>From<select id="trFrom">${playersOptions}</select></label>
        <label>To<select id="trTo">${playersOptions}</select></label>
        <label>Resource<select id="trRes">${resOptions}</select></label>
        <label>Amount<input id="trAmt" type="number" min="1" value="1"></label>
      </div>`,
    actions: [{ label: "Transfer", onClick: (modal) => {
      const from = Number(modal.querySelector("#trFrom").value);
      const to = Number(modal.querySelector("#trTo").value);
      const res = modal.querySelector("#trRes").value;
      const amt = Number(modal.querySelector("#trAmt").value);
      if (from === to) return alertMsg("Choose different players.");
      if (state.players[from].resources[res] < amt) return alertMsg("Not enough resources.");
      state.players[from].resources[res] -= amt;
      state.players[to].resources[res] += amt;
      addLog(`${playerName(from)} transferred ${amt} ${res} to ${playerName(to)}.`);
      closeModal();
      render();
    }}]
  });
}

function endTurn() {
  if (state.phase !== "play" || !state.diceRolled || state.pendingAction || state.tradeLock) return;
  const p = currentPlayer();
  p.devCards.push(...p.newDevCards);
  p.newDevCards = [];
  p.playedDevThisTurn = false;
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  state.diceRolled = false;
  state.dice = null;
  state.pendingAction = null;
  setStatus(`${currentPlayer().name}: roll the dice.`);
  addLog(`It is now ${currentPlayer().name}'s turn.`);
  render();
}

function openDiscardModal(playerId, amount, done) {
  const player = state.players[playerId];
  const rows = RESOURCES.map(r => `
    <div class="row">
      <span>${capitalize(r)} (have ${player.resources[r]})</span>
      <input type="number" min="0" max="${player.resources[r]}" value="0" data-res="${r}">
    </div>`).join("");
  openModal({
    title: `${player.name} must discard ${amount}`,
    body: `<div class="notice warn">Please discard exactly ${amount} resources.</div><div class="table-like">${rows}</div>`,
    actions: [{ label: "Discard", onClick: (modal) => {
      const vals = {};
      let total = 0;
      modal.querySelectorAll("input[data-res]").forEach(input => {
        const val = Number(input.value);
        vals[input.dataset.res] = val;
        total += val;
      });
      if (total !== amount) return alertMsg(`You must discard exactly ${amount}.`);
      for (const [res, val] of Object.entries(vals)) {
        if (player.resources[res] < val) return alertMsg("Invalid discard amount.");
      }
      for (const [res, val] of Object.entries(vals)) {
        player.resources[res] -= val;
        state.board.bank[res] += val;
      }
      addLog(`${player.name} discarded ${amount} resources.`);
      closeModal();
      render();
      done();
    }}],
    closeDisabled: true
  });
}

function formatDev(card) {
  return ({ knight: "Knight", roadBuilding: "Road Building", yearOfPlenty: "Year of Plenty", monopoly: "Monopoly", victoryPoint: "Victory Point" })[card] || card;
}

function alertMsg(msg) {
  openModal({ title: "Notice", body: `<div class="notice error">${escapeHtml(msg)}</div>`, actions: [{ label: "OK", onClick: closeModal }] });
}

function openHelp() {
  openModal({
    title: "Rules & Controls",
    body: `
      <div class="help-list">
        <p><strong>Included:</strong> random base board, setup phase, roads, settlements, cities, robber, 7 discard, stealing, bank trade, port trade, player trade, development cards, Largest Army, Longest Road, and 10-point victory.</p>
        <p><strong>How to play:</strong></p>
        <ol>
          <li>Click <strong>New Game</strong>, set 3 or 4 players, and start.</li>
          <li>During setup, place settlement then its attached road. The second settlement grants starting resources.</li>
          <li>On each turn: roll, trade/build/play 1 development card, then end turn.</li>
          <li>Use the board directly for roads, settlements, cities, and robber movement.</li>
          <li>The sidebar shows resources, victory point status, and development cards.</li>
        </ol>
        <p><strong>Notes:</strong> this is a local hot-seat implementation for one device. It uses original gameplay structure, but it is not affiliated with CATAN or its publishers.</p>
      </div>`,
    actions: [{ label: "Close", className: "secondary", onClick: closeModal }]
  });
}

function openNewGameModal() {
  openModal({
    title: "Start New Game",
    body: `
      <div class="form-grid single">
        <label>Number of players
          <select id="playerCount">
            <option value="3">3</option>
            <option value="4" selected>4</option>
          </select>
        </label>
        <div id="playerInputs"></div>
      </div>
    `,
    actions: [
      { label: "Cancel", className: "secondary", onClick: closeModal },
      { label: "Start Game", onClick: (modal) => {
        const count = Number(modal.querySelector("#playerCount").value);
        const players = Array.from({ length: count }, (_, i) => ({
          name: modal.querySelector(`#p${i}`).value.trim() || `Player ${i+1}`
        }));
        closeModal();
        startNewGame({ players });
      }}
    ],
    onRender(modal) {
      const renderInputs = () => {
        const count = Number(modal.querySelector("#playerCount").value);
        modal.querySelector("#playerInputs").innerHTML = Array.from({ length: count }, (_, i) => `
          <label>Player ${i+1} name
            <input id="p${i}" value="Player ${i+1}">
          </label>`).join("");
      };
      modal.querySelector("#playerCount").addEventListener("change", renderInputs);
      renderInputs();
    }
  });
}

function openModal({ title, body, actions = [], onRender, closeDisabled = false }) {
  els.modalRoot.innerHTML = "";
  const node = els.modalTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".modal-title").textContent = title;
  node.querySelector(".modal-body").innerHTML = body;
  const actionsWrap = node.querySelector(".modal-actions");
  const closeBtn = node.querySelector(".close-modal");
  if (closeDisabled) closeBtn.style.display = "none";
  else closeBtn.addEventListener("click", closeModal);

  actions.forEach(action => {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    if (action.className) btn.className = action.className;
    btn.addEventListener("click", () => action.onClick?.(node));
    actionsWrap.appendChild(btn);
  });
  els.modalRoot.appendChild(node);
  onRender?.(node);
}
function closeModal() { els.modalRoot.innerHTML = ""; }

function bindEvents() {
  els.rollBtn.addEventListener("click", attemptRollDice);
  els.endTurnBtn.addEventListener("click", endTurn);
  els.newGameBtn.addEventListener("click", openNewGameModal);
  els.helpBtn.addEventListener("click", openHelp);

  els.finishActionBtn.addEventListener("click", () => {
    state.pendingAction = null;
    setStatus("Action cleared.");
    render();
  });

  els.createRoomBtn.addEventListener("click", createRoom);
  els.joinRoomBtn.addEventListener("click", joinRoom);
  els.leaveRoomBtn.addEventListener("click", leaveRoom);
  els.startOnlineMatchBtn.addEventListener("click", startOnlineMatch);

  els.nicknameInput.addEventListener("change", () => {
    localStorage.setItem("catanNickname", els.nicknameInput.value.trim());
  });

  els.joinRoomCodeInput.addEventListener("input", () => {
    els.joinRoomCodeInput.value = els.joinRoomCodeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  });

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!state.gameStarted || state.winner) return;
      const action = btn.dataset.action;
      const player = currentPlayer();

      if (state.phase !== "play" && action !== "moveRobber") {
        return alertMsg("That action is not available during setup.");
      }

      if (["buildRoad","buildSettlement","buildCity","buyDev","playDev","bankTrade","playerTrade"].includes(action) && !state.diceRolled) {
        return alertMsg("Roll the dice first.");
      }

      if (state.pendingAction && !["moveRobber"].includes(action)) {
        return alertMsg("Finish your current action first.");
      }

      switch (action) {
        case "buildRoad":
          state.pendingAction = { type: "buildRoad" };
          setStatus(`${player.name}: click an edge to build a road.`);
          break;
        case "buildSettlement":
          state.pendingAction = { type: "buildSettlement" };
          setStatus(`${player.name}: click a vertex to build a settlement.`);
          break;
        case "buildCity":
          state.pendingAction = { type: "buildCity" };
          setStatus(`${player.name}: click one of your settlements to upgrade it.`);
          break;
        case "buyDev":
          buyDevelopmentCard();
          break;
        case "playDev":
          openPlayDevCardModal();
          break;
        case "moveRobber":
          state.pendingAction = { type: "moveRobber", free: true };
          setStatus(`${player.name}: click a hex to move the robber.`);
          break;
        case "bankTrade":
          openBankTradeModal();
          break;
        case "playerTrade":
          openPlayerTradeModal();
          break;
        case "transfer":
          openTransferModal();
          break;
      }

      render();
    });
  });
}


bindEvents();
openHelp();
render();
bootstrapFirebase();
