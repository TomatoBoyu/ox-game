const cells = Array.from(document.querySelectorAll(".cell"));
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("reset");
const resetScoreBtn = document.getElementById("resetScore");
const xScoreEl = document.getElementById("xScore");
const oScoreEl = document.getElementById("oScore");
const modeLabelEl = document.getElementById("modeLabel");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let board = Array(9).fill(null);
let current = "X";
let finished = false;
const scoreByMode = {
  pvp: { X: 0, O: 0 },
  ai: { X: 0, O: 0 },
};
const moveHistory = { X: [], O: [] };
let audioCtx = null;
let mode = "pvp";
const human = "X";
const ai = "O";

function setStatus(message) {
  statusEl.textContent = message;
}

function updateScores() {
  const scores = scoreByMode[mode];
  xScoreEl.textContent = String(scores.X);
  oScoreEl.textContent = String(scores.O);
  modeLabelEl.textContent = mode === "pvp" ? "1 vs 1" : "vs AI";
}

function playClickSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = current === "X" ? 520 : 420;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
  osc.stop(audioCtx.currentTime + 0.14);
}

function playWinSound(winner) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const base = winner === "X" ? 520 : 420;
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(audioCtx.destination);

  [0, 0.08, 0.16].forEach((offset, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * (1 + i * 0.25);
    osc.connect(gain);
    osc.start(now + offset);
    osc.stop(now + offset + 0.12);
  });

  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
}

function render() {
  cells.forEach((cell, index) => {
    const value = board[index];
    cell.textContent = value ?? "";
    cell.classList.toggle("filled", value !== null);
    cell.classList.toggle("x", value === "X");
    cell.classList.toggle("o", value === "O");
    cell.classList.remove("expiring");
  });

  const history = moveHistory[current];
  if (!finished && history.length >= 3) {
    const oldest = history[0];
    cells[oldest].classList.add("expiring");
  }
}

function checkWinner() {
  for (const [a, b, c] of WIN_LINES) {
    const first = board[a];
    if (first && first === board[b] && first === board[c]) {
      return { winner: first, line: [a, b, c] };
    }
  }
  return null;
}

function isDraw() {
  return board.every((cell) => cell !== null);
}

function handleClick(event) {
  if (finished) return;
  if (mode === "ai" && current === ai) return;
  const index = Number(event.currentTarget.dataset.index);
  if (board[index] !== null) return;

  applyMove(index);
}

function applyMove(index) {
  const history = moveHistory[current];
  if (history.length >= 3) {
    const oldest = history.shift();
    board[oldest] = null;
  }

  board[index] = current;
  history.push(index);

  const result = checkWinner();
  if (result) {
    finished = true;
    setStatus(`${result.winner} の勝ち`);
    result.line.forEach((i) => cells[i].classList.add("win"));
    scoreByMode[mode][result.winner] += 1;
    updateScores();
    playWinSound(result.winner);
  } else if (isDraw()) {
    finished = true;
    setStatus("引き分け");
    playClickSound();
  } else {
    current = current === "X" ? "O" : "X";
    setStatus(`${current} の番`);
    playClickSound();
  }

  render();

  if (mode === "ai" && !finished && current === ai) {
    setTimeout(aiMove, 420);
  }
}

function aiMove() {
  if (finished || current !== ai) return;

  const choice = findBestMove({
    board: board.slice(),
    history: { X: [...moveHistory.X], O: [...moveHistory.O] },
    player: ai,
  });

  if (choice !== null) {
    applyMove(choice);
  }
}

function findBestMove(state) {
  const empty = state.board
    .map((value, index) => (value === null ? index : null))
    .filter((v) => v !== null);
  if (empty.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove = empty[0];
  const depth = 8;

  for (const index of empty) {
    const next = simulateMove(state, index);
    const score = minimax(next, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }

  return bestMove;
}

function minimax(state, depth, alpha, beta, maximizing) {
  const terminal = evaluateTerminal(state);
  if (terminal !== null) return terminal;
  if (depth === 0) return evaluateHeuristic(state);

  const empty = state.board
    .map((value, index) => (value === null ? index : null))
    .filter((v) => v !== null);
  if (empty.length === 0) return 0;

  if (maximizing) {
    let value = -Infinity;
    for (const index of empty) {
      const next = simulateMove(state, index);
      value = Math.max(value, minimax(next, depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const index of empty) {
    const next = simulateMove(state, index);
    value = Math.min(value, minimax(next, depth - 1, alpha, beta, true));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluateTerminal(state) {
  for (const [a, b, c] of WIN_LINES) {
    const first = state.board[a];
    if (first && first === state.board[b] && first === state.board[c]) {
      return first === ai ? 1000 : -1000;
    }
  }
  return null;
}

function evaluateHeuristic(state) {
  let score = 0;
  for (const [a, b, c] of WIN_LINES) {
    const line = [state.board[a], state.board[b], state.board[c]];
    const aiCount = line.filter((v) => v === ai).length;
    const humanCount = line.filter((v) => v === human).length;
    if (aiCount > 0 && humanCount === 0) score += aiCount * aiCount;
    if (humanCount > 0 && aiCount === 0) score -= humanCount * humanCount;
  }
  if (state.board[4] === ai) score += 2;
  if (state.board[4] === human) score -= 2;
  return score;
}

function simulateMove(state, index) {
  const nextBoard = state.board.slice();
  const nextHistory = {
    X: [...state.history.X],
    O: [...state.history.O],
  };
  const history = nextHistory[state.player];
  if (history.length >= 3) {
    const oldest = history.shift();
    nextBoard[oldest] = null;
  }
  nextBoard[index] = state.player;
  history.push(index);
  return {
    board: nextBoard,
    history: nextHistory,
    player: state.player === "X" ? "O" : "X",
  };
}

function setMode(nextMode) {
  mode = nextMode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  resetGame();
  updateScores();
}

function resetGame() {
  board = Array(9).fill(null);
  current = "X";
  finished = false;
  moveHistory.X = [];
  moveHistory.O = [];
  cells.forEach((cell) => cell.classList.remove("win"));
  render();
  setStatus(`${current} の番`);
}

cells.forEach((cell) => cell.addEventListener("click", handleClick));
resetBtn.addEventListener("click", resetGame);
resetScoreBtn.addEventListener("click", () => {
  scoreByMode[mode].X = 0;
  scoreByMode[mode].O = 0;
  updateScores();
});
modeButtons.forEach((btn) =>
  btn.addEventListener("click", () => setMode(btn.dataset.mode))
);

render();
updateScores();
