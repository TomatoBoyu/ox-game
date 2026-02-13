const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
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

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function createState() {
  return {
    board: Array(9).fill(null),
    current: "X",
    finished: false,
    moveHistory: { X: [], O: [] },
    winner: null,
    winLine: null,
    lastMove: null,
    lastPlayer: null,
  };
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      players: { X: null, O: null },
      spectators: new Set(),
      state: createState(),
    });
  }
  return rooms.get(code);
}

function send(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  send(room.players.X, data);
  send(room.players.O, data);
  for (const ws of room.spectators) {
    send(ws, data);
  }
}

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    const first = board[a];
    if (first && first === board[b] && first === board[c]) {
      return { winner: first, line: [a, b, c] };
    }
  }
  return null;
}

function isDraw(board) {
  return board.every((cell) => cell !== null);
}

function applyMove(state, index) {
  const history = state.moveHistory[state.current];
  if (history.length >= 3) {
    const oldest = history.shift();
    state.board[oldest] = null;
  }

  state.board[index] = state.current;
  history.push(index);
  state.lastMove = index;
  state.lastPlayer = state.current;

  const result = checkWinner(state.board);
  if (result) {
    state.finished = true;
    state.winner = result.winner;
    state.winLine = result.line;
  } else if (isDraw(state.board)) {
    state.finished = true;
    state.winner = null;
    state.winLine = null;
  } else {
    state.current = state.current === "X" ? "O" : "X";
  }
}

function handleJoin(ws, roomCode) {
  const code = roomCode.trim().toUpperCase();
  if (!code) {
    send(ws, { type: "error", message: "合言葉が空です" });
    return;
  }

  const room = getRoom(code);
  ws.roomCode = code;

  if (!room.players.X) {
    room.players.X = ws;
    ws.role = "X";
  } else if (!room.players.O) {
    room.players.O = ws;
    ws.role = "O";
  } else {
    room.spectators.add(ws);
    ws.role = "S";
  }

  send(ws, { type: "joined", role: ws.role, state: room.state });
  broadcast(room, { type: "state", state: room.state });
}

function handleMove(ws, index) {
  const room = rooms.get(ws.roomCode);
  if (!room || ws.role === "S") return;
  const state = room.state;
  if (state.finished) return;
  if (ws.role !== state.current) return;
  if (typeof index !== "number" || index < 0 || index > 8) return;
  if (state.board[index] !== null) return;

  applyMove(state, index);
  broadcast(room, { type: "state", state });
}

function handleReset(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room || ws.role === "S") return;
  room.state = createState();
  broadcast(room, { type: "state", state: room.state });
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      send(ws, { type: "error", message: "JSONが不正です" });
      return;
    }

    if (message.type === "join") {
      handleJoin(ws, message.room || "");
      return;
    }

    if (message.type === "move") {
      handleMove(ws, message.index);
      return;
    }

    if (message.type === "reset") {
      handleReset(ws);
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    if (room.players.X === ws) room.players.X = null;
    if (room.players.O === ws) room.players.O = null;
    room.spectators.delete(ws);

    const hasAny =
      room.players.X || room.players.O || room.spectators.size > 0;
    if (!hasAny) {
      rooms.delete(ws.roomCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
