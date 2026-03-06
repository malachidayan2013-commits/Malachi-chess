const api = {
  async getJSON(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    return res.json();
  },
  async postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    return res.json();
  },
};

let state = {
  me: null,
  gameId: null,
  myColor: null,
  opponent: null,
  board: [],
  turn: null,
  selected: null,
  legalTargets: [],
  moves: [],
};

const PIECES = {
  wp: "♙",
  wr: "♖",
  wn: "♘",
  wb: "♗",
  wq: "♕",
  wk: "♔",
  bp: "♟︎",
  br: "♜",
  bn: "♞",
  bb: "♝",
  bq: "♛",
  bk: "♚",
};

function initialBoard() {
  const emptyRow = [null, null, null, null, null, null, null, null];
  const board = Array.from({ length: 8 }, () => emptyRow.slice());
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];

  board[0] = back.map((t) => "b" + t);
  board[1] = Array(8).fill("bp");
  board[6] = Array(8).fill("wp");
  board[7] = back.map((t) => "w" + t);
  return board;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function findKing(board, color) {
  const king = color[0] + "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) return { r, c };
    }
  }
  return null;
}

function isSquareAttacked(board, r, c, byColor) {
  const enemy = byColor[0];
  const my = enemy === "w" ? "b" : "w";

  const pawnDir = enemy === "w" ? -1 : 1;
  for (const dc of [-1, 1]) {
    const rr = r + pawnDir;
    const cc = c + dc;
    if (inBounds(rr, cc) && board[rr][cc] === enemy + "p") return true;
  }

  const knightD = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];
  for (const [dr, dc] of knightD) {
    const rr = r + dr;
    const cc = c + dc;
    if (inBounds(rr, cc) && board[rr][cc] === enemy + "n") return true;
  }

  const dirsB = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [dr, dc] of dirsB) {
    let rr = r + dr;
    let cc = c + dc;
    while (inBounds(rr, cc)) {
      const p = board[rr][cc];
      if (p) {
        if (p[0] === enemy && (p[1] === "b" || p[1] === "q")) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  const dirsR = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dr, dc] of dirsR) {
    let rr = r + dr;
    let cc = c + dc;
    while (inBounds(rr, cc)) {
      const p = board[rr][cc];
      if (p) {
        if (p[0] === enemy && (p[1] === "r" || p[1] === "q")) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (inBounds(rr, cc) && board[rr][cc] === enemy + "k") return true;
    }
  }

  return false;
}

function getPseudoLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece[0];
  const type = piece[1];
  const moves = [];

  const forward = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;

  if (type === "p") {
    const r1 = r + forward;
    if (inBounds(r1, c) && !board[r1][c]) {
      moves.push({ r: r1, c, capture: false });
      const r2 = r + 2 * forward;
      if (r === startRow && !board[r2][c]) {
        moves.push({ r: r2, c, capture: false });
      }
    }
    for (const dc of [-1, 1]) {
      const rr = r + forward;
      const cc = c + dc;
      if (inBounds(rr, cc) && board[rr][cc] && board[rr][cc][0] !== color) {
        moves.push({ r: rr, c: cc, capture: true });
      }
    }
    return moves;
  }

  if (type === "n") {
    const deltas = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dr, dc] of deltas) {
      const rr = r + dr;
      const cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      const target = board[rr][cc];
      if (!target || target[0] !== color) {
        moves.push({ r: rr, c: cc, capture: !!target });
      }
    }
    return moves;
  }

  const rayDirs = [];
  if (type === "b" || type === "q") {
    rayDirs.push(
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    );
  }
  if (type === "r" || type === "q") {
    rayDirs.push(
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    );
  }
  if (rayDirs.length) {
    for (const [dr, dc] of rayDirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inBounds(rr, cc)) {
        const target = board[rr][cc];
        if (!target) {
          moves.push({ r: rr, c: cc, capture: false });
        } else {
          if (target[0] !== color) {
            moves.push({ r: rr, c: cc, capture: true });
          }
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return moves;
  }

  if (type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (!inBounds(rr, cc)) continue;
        const target = board[rr][cc];
        if (!target || target[0] !== color) {
          moves.push({ r: rr, c: cc, capture: !!target });
        }
      }
    }
    return moves;
  }

  return moves;
}

function getLegalMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece[0] === "w" ? "white" : "black";
  const pseudo = getPseudoLegalMoves(board, r, c);
  const legal = [];
  for (const m of pseudo) {
    const tmp = cloneBoard(board);
    tmp[m.r][m.c] = tmp[r][c];
    tmp[r][c] = null;
    const kingPos = findKing(tmp, color);
    if (!kingPos) continue;
    if (!isSquareAttacked(tmp, kingPos.r, kingPos.c, color === "white" ? "black" : "white")) {
      legal.push(m);
    }
  }
  return legal;
}

function coordsToAlg(r, c) {
  const file = "abcdefgh"[c];
  const rank = 8 - r;
  return file + rank;
}

function updateStatus(msg, isError = false) {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.classList.toggle("error", isError);
}

function renderBoard() {
  const boardEl = document.getElementById("chess-board");
  boardEl.innerHTML = "";
  const myTurn = state.gameId && state.turn === state.myColor;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idxFromTop = r;
      const light = (idxFromTop + c) % 2 === 0;
      const sq = document.createElement("div");
      sq.className = "square " + (light ? "light" : "dark");
      sq.dataset.r = String(r);
      sq.dataset.c = String(c);

      const piece = state.board[r][c];
      if (piece) {
        const span = document.createElement("span");
        span.className = "piece";
        span.textContent = PIECES[piece] || "?";
        sq.appendChild(span);
      }

      const sel = state.selected;
      if (sel && sel.r === r && sel.c === c) {
        sq.classList.add("selected");
      }

      if (
        state.legalTargets.some((m) => m.r === r && m.c === c)
      ) {
        const targetPiece = state.board[r][c];
        if (targetPiece) {
          sq.classList.add("capture-target");
        } else {
          sq.classList.add("move-target");
        }
      }

      if (state.myColor && state.turn === state.myColor && state.gameId) {
        sq.classList.add("clickable");
        sq.addEventListener("click", onSquareClick);
      } else if (!state.gameId) {
        sq.addEventListener("click", () => {});
      }

      boardEl.appendChild(sq);
    }
  }

  const whiteKing = findKing(state.board, "white");
  const blackKing = findKing(state.board, "black");
  if (whiteKing) {
    const inCheck = isSquareAttacked(state.board, whiteKing.r, whiteKing.c, "black");
    if (inCheck) {
      getSquareEl(whiteKing.r, whiteKing.c).classList.add("in-check");
    }
  }
  if (blackKing) {
    const inCheck = isSquareAttacked(state.board, blackKing.r, blackKing.c, "white");
    if (inCheck) {
      getSquareEl(blackKing.r, blackKing.c).classList.add("in-check");
    }
  }

  const turnEl = document.getElementById("turn-indicator");
  if (!state.gameId) {
    turnEl.textContent = "התור: —";
  } else {
    const colorText = state.turn === "white" ? "לבן" : "שחור";
    const mine = state.turn === state.myColor ? " (התור שלך)" : "";
    turnEl.textContent = "התור: " + colorText + mine;
  }
}

function getSquareEl(r, c) {
  return document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
}

function onSquareClick(e) {
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const piece = state.board[r][c];
  const myColorChar = state.myColor === "white" ? "w" : "b";

  if (!state.selected) {
    if (!piece || piece[0] !== myColorChar) {
      return;
    }
    state.selected = { r, c };
    state.legalTargets = getLegalMoves(state.board, r, c);
    renderBoard();
    return;
  }

  if (state.selected.r === r && state.selected.c === c) {
    state.selected = null;
    state.legalTargets = [];
    renderBoard();
    return;
  }

  const isLegal = state.legalTargets.some((m) => m.r === r && m.c === c);
  if (!isLegal) {
    state.selected = null;
    state.legalTargets = [];
    renderBoard();
    return;
  }

  makeMove(state.selected.r, state.selected.c, r, c);
}

async function makeMove(fromR, fromC, toR, toC) {
  const moving = state.board[fromR][fromC];
  const target = state.board[toR][toC];
  if (!moving) return;

  const tmp = cloneBoard(state.board);
  tmp[toR][toC] = tmp[fromR][fromC];
  tmp[fromR][fromC] = null;
  const myColorFull = state.myColor;
  const kingPos = findKing(tmp, myColorFull);
  if (kingPos) {
    const enemyColor = myColorFull === "white" ? "black" : "white";
    if (isSquareAttacked(tmp, kingPos.r, kingPos.c, enemyColor)) {
      updateStatus("לא ניתן לבצע מהלך שמשאיר את המלך שלך תחת שח.", true);
      state.selected = null;
      state.legalTargets = [];
      renderBoard();
      return;
    }
  }

  const move = {
    from: { r: fromR, c: fromC },
    to: { r: toR, c: toC },
    piece: moving,
    captured: target || null,
    san: `${moving[0] === "w" ? "ל" : "ש"} ${coordsToAlg(fromR, fromC)}→${coordsToAlg(
      toR,
      toC
    )}`,
  };

  const res = await api.postJSON("/api/game/move", {
    game_id: state.gameId,
    move,
  });
  if (!res.ok) {
    updateStatus(res.error || "שגיאה בשליחת המהלך לשרת.", true);
    return;
  }

  state.board = tmp;
  state.turn = state.turn === "white" ? "black" : "white";
  state.selected = null;
  state.legalTargets = [];
  state.moves.push(move);
  appendMoveToLog(move, state.myColor === "white" ? state.moves.length : Math.ceil(state.moves.length / 2));
  updateStatus("המהלך נשלח. ממתין למהלך של " + (state.turn === "white" ? "לבן" : "שחור") + ".");
  renderBoard();
}

function appendMoveToLog(move) {
  const log = document.getElementById("moves-log");
  const li = document.createElement("li");
  li.textContent = move.san;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

async function refreshPlayers() {
  if (!state.me) return;
  const data = await api.getJSON("/api/players");
  if (!data.players) return;
  const list = document.getElementById("players-list");
  list.innerHTML = "";
  if (!data.players.length) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="muted">אין עדיין חברים מחוברים.</span>';
    list.appendChild(li);
    return;
  }
  data.players.forEach((name) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name;
    const btn = document.createElement("button");
    btn.className = "secondary-btn small";
    btn.textContent = "הזמן למשחק";
    btn.addEventListener("click", () => sendInvite(name));
    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function sendInvite(targetName) {
  if (!state.me) return;
  const res = await api.postJSON("/api/invite", { target: targetName });
  if (!res.ok) {
    updateStatus(res.error || "שגיאה בשליחת ההזמנה.", true);
    return;
  }
  updateStatus("הזמנה נשלחה ל־" + targetName + ". ממתין לאישור.");
  loadInvitations();
}

async function loadInvitations() {
  if (!state.me) return;
  const data = await api.getJSON("/api/invitations");
  if (!data.ok) return;

  const incomingEl = document.getElementById("incoming-list");
  const outgoingEl = document.getElementById("outgoing-list");
  incomingEl.innerHTML = "";
  outgoingEl.innerHTML = "";

  data.incoming.forEach((inv) => {
    const li = document.createElement("li");
    if (inv.status === "pending") {
      const span = document.createElement("span");
      span.textContent = `הזמנה מ־${inv.from}`;
      const yes = document.createElement("button");
      yes.className = "secondary-btn small";
      yes.textContent = "אשר";
      yes.addEventListener("click", () => respondInvite(inv.id, true));
      const no = document.createElement("button");
      no.className = "secondary-btn small";
      no.textContent = "דחה";
      no.style.marginRight = "4px";
      no.addEventListener("click", () => respondInvite(inv.id, false));
      li.appendChild(span);
      li.appendChild(yes);
      li.appendChild(no);
    } else if (inv.status === "accepted" && inv.game_id && !state.gameId) {
      const span = document.createElement("span");
      span.textContent = `משחק אושר עם ${inv.from}.`;
      li.appendChild(span);
    }
    incomingEl.appendChild(li);
  });

  data.outgoing.forEach((inv) => {
    const li = document.createElement("li");
    const text =
      inv.status === "pending"
        ? `הזמנה ל־${inv.to} (ממתין)`
        : inv.status === "accepted"
        ? `הזמנה ל־${inv.to} אושרה`
        : `הזמנה ל־${inv.to} נדחתה`;
    li.textContent = text;
    outgoingEl.appendChild(li);
  });
}

async function respondInvite(id, accept) {
  const res = await api.postJSON("/api/invitations/respond", {
    invite_id: id,
    accept,
  });
  if (!res.ok) {
    updateStatus(res.error || "שגיאה בטיפול בהזמנה.", true);
    return;
  }
  if (!accept) {
    updateStatus("דחית את ההזמנה.", false);
    loadInvitations();
    return;
  }
  startGame(res.game_id, res.color, res.opponent);
}

function startGame(gameId, myColor, opponent) {
  state.gameId = gameId;
  state.myColor = myColor;
  state.opponent = opponent;
  state.board = initialBoard();
  state.turn = "white";
  state.selected = null;
  state.legalTargets = [];
  state.moves = [];
  document.getElementById("moves-log").innerHTML = "";

  document.getElementById("player-white").textContent =
    "לבן: " + (myColor === "white" ? state.me : opponent);
  document.getElementById("player-black").textContent =
    "שחור: " + (myColor === "black" ? state.me : opponent);
  updateStatus(
    "המשחק התחיל! " +
      (state.turn === myColor ? "התור שלך." : "ממתין למהלך של היריב.")
  );
  renderBoard();
}

async function pollGame() {
  if (!state.gameId) return;
  try {
    const data = await api.getJSON(`/api/game/state?game_id=${state.gameId}`);
    if (!data.ok) return;
    const game = data.game;
    state.turn = game.turn;
    const myColor = data.color;
    state.myColor = myColor;
    state.opponent = data.opponent;

    const applied = state.moves.length;
    if (game.moves.length > applied) {
      for (let i = applied; i < game.moves.length; i++) {
        const m = game.moves[i];
        const from = m.from;
        const to = m.to;
        const piece = state.board[from.r][from.c];
        state.board[to.r][to.c] = piece;
        state.board[from.r][from.c] = null;
        state.moves.push(m);
        appendMoveToLog(m);
      }
      renderBoard();
    }
  } catch (e) {
    console.error(e);
  }
}

async function initLoginUI() {
  const who = await api.getJSON("/api/whoami");
  if (who.name) {
    state.me = who.name;
    setupLoggedInUI();
  } else {
    setupLoggedOutUI();
  }
}

function setupLoggedOutUI() {
  const top = document.getElementById("top-controls");
  top.innerHTML = "";
  const btn = document.createElement("button");
  btn.id = "login-btn";
  btn.className = "primary-btn";
  btn.textContent = "הכנס";
  btn.addEventListener("click", async () => {
    const name = prompt("הכנס שם משתמש (כינוי):");
    if (!name) return;
    const res = await api.postJSON("/api/login", { name });
    if (!res.ok) {
      updateStatus(res.error || "שגיאה בהתחברות.", true);
      return;
    }
    state.me = res.name;
    updateStatus("מחובר בשם: " + res.name);
    setupLoggedInUI();
  });
  top.appendChild(btn);
}

function setupLoggedInUI() {
  const top = document.getElementById("top-controls");
  top.innerHTML = "";
  const nameSpan = document.createElement("span");
  nameSpan.textContent = state.me;
  const inviteBtn = document.createElement("button");
  inviteBtn.className = "secondary-btn";
  inviteBtn.textContent = "הזמן חבר למשחק";
  inviteBtn.addEventListener("click", async () => {
    await refreshPlayers();
    const friend = prompt("הכנס את שם החבר שלך בדיוק כפי שהוא מופיע ברשימת השחקנים:");
    if (!friend) return;
    await sendInvite(friend);
  });
  const logoutBtn = document.createElement("button");
  logoutBtn.className = "secondary-btn";
  logoutBtn.textContent = "התנתק";
  logoutBtn.addEventListener("click", async () => {
    await api.postJSON("/api/logout", {});
    state.me = null;
    state.gameId = null;
    state.myColor = null;
    state.opponent = null;
    state.board = initialBoard();
    state.turn = null;
    state.selected = null;
    state.legalTargets = [];
    state.moves = [];
    document.getElementById("moves-log").innerHTML = "";
    document.getElementById("player-white").textContent = "לבן: —";
    document.getElementById("player-black").textContent = "שחור: —";
    updateStatus("התנתקת. בחר שם חדש כדי להתחבר.");
    setupLoggedOutUI();
    renderBoard();
  });
  top.appendChild(nameSpan);
  top.appendChild(inviteBtn);
  top.appendChild(logoutBtn);

  document
    .getElementById("refresh-players")
    .addEventListener("click", refreshPlayers);
  refreshPlayers();
  loadInvitations();
}

function main() {
  state.board = initialBoard();
  renderBoard();
  initLoginUI();
  updateStatus("לוח השחמט מוכן. התחבר כדי לשחק עם חבר.");
  setInterval(() => {
    if (state.me) {
      loadInvitations();
    }
  }, 4000);
  setInterval(pollGame, 2000);
}

document.addEventListener("DOMContentLoaded", main);

