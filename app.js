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
  devSummary: document.getElementById("devSummary")
};

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
}

function renderBoard() {
  const svg = els.board;
  svg.innerHTML = "";
  if (!state.board) return;

  state.board.hexes.forEach(hex => {
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", hex.corners.map(p => `${p.x},${p.y}`).join(" "));
    poly.setAttribute("fill", RESOURCE_COLORS[hex.terrain]);
    poly.setAttribute("stroke", "#f8fafc");
    poly.setAttribute("stroke-width", "3");
    poly.dataset.hexId = hex.id;
    if (state.pendingAction?.type === "moveRobber" && !hex.robber) {
      poly.style.cursor = "pointer";
      poly.addEventListener("click", () => attemptMoveRobber(hex.id));
    }
    svg.appendChild(poly);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", hex.center.x);
    label.setAttribute("y", hex.center.y - 10);
    label.setAttribute("class", "hex-label");
    label.textContent = hex.terrain === "desert" ? "Desert" : capitalize(hex.terrain);
    label.setAttribute("font-size", "18");
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
      t.setAttribute("class", "hex-label");
      t.textContent = hex.number;
      svg.appendChild(t);
    }

    if (hex.robber) {
      const robber = document.createElementNS("http://www.w3.org/2000/svg", "path");
      robber.setAttribute("d", `M ${hex.center.x-12} ${hex.center.y-58} q 12 -24 24 0 v 22 l 10 30 h -44 l 10 -30 z`);
      robber.setAttribute("class", "robber");
      svg.appendChild(robber);
    }
  });

  state.board.edges.forEach(edge => {
    const a = state.board.vertices[edge.a], b = state.board.vertices[edge.b];
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hit.setAttribute("x1", a.x); hit.setAttribute("y1", a.y);
    hit.setAttribute("x2", b.x); hit.setAttribute("y2", b.y);
    hit.setAttribute("class", "edge-hit");
    if (state.pendingAction?.type === "buildRoad") hit.addEventListener("click", () => attemptBuildRoad(edge.id));
    svg.appendChild(hit);

    if (edge.owner !== null) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
      line.setAttribute("class", "edge-drawn");
      line.setAttribute("stroke", state.players[edge.owner].color);
      svg.appendChild(line);
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
    hit.setAttribute("class", "vertex");
    if (["buildSettlement","buildCity"].includes(state.pendingAction?.type)) {
      hit.addEventListener("click", () => state.pendingAction.type === "buildSettlement" ? attemptBuildSettlement(v.id) : attemptBuildCity(v.id));
    }
    svg.appendChild(hit);

    if (v.building) {
      const player = state.players[v.building.owner];
      if (v.building.type === "settlement") {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", `M ${v.x-13} ${v.y+10} L ${v.x-13} ${v.y-2} L ${v.x} ${v.y-16} L ${v.x+13} ${v.y-2} L ${v.x+13} ${v.y+10} Z`);
        p.setAttribute("fill", player.color);
        p.setAttribute("class", "settlement-shape");
        svg.appendChild(p);
      } else {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", `M ${v.x-16} ${v.y+11} L ${v.x-16} ${v.y-2} L ${v.x-4} ${v.y-2} L ${v.x-4} ${v.y-14} L ${v.x+9} ${v.y-14} L ${v.x+9} ${v.y-2} L ${v.x+16} ${v.y-2} L ${v.x+16} ${v.y+11} Z`);
        p.setAttribute("fill", player.color);
        p.setAttribute("class", "city-shape");
        svg.appendChild(p);
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
  els.rollBtn.disabled = !isActive || state.phase !== "play" || state.diceRolled || !!state.pendingAction || state.tradeLock;
  els.endTurnBtn.disabled = !isActive || state.phase !== "play" || !state.diceRolled || !!state.pendingAction || !!state.robberNeedsDiscard || state.tradeLock;
  els.finishActionBtn.disabled = !state.pendingAction;
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
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!state.gameStarted || state.winner) return;
      const action = btn.dataset.action;
      const player = currentPlayer();
      if (state.phase !== "play" && action !== "moveRobber") return alertMsg("That action is not available during setup.");
      if (["buildRoad","buildSettlement","buildCity","buyDev","playDev","bankTrade","playerTrade"].includes(action) && !state.diceRolled) return alertMsg("Roll the dice first.");
      if (state.pendingAction && !["moveRobber"].includes(action)) return alertMsg("Finish your current action first.");
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
        case "buyDev": buyDevelopmentCard(); break;
        case "playDev": openPlayDevCardModal(); break;
        case "moveRobber":
          state.pendingAction = { type: "moveRobber", free: true };
          setStatus(`${player.name}: click a hex to move the robber.`);
          break;
        case "bankTrade": openBankTradeModal(); break;
        case "playerTrade": openPlayerTradeModal(); break;
        case "transfer": openTransferModal(); break;
      }
      render();
    });
  });
}

bindEvents();
openHelp();
render();
