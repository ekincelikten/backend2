const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const lobbies = new Map();

io.on("connection", (socket) => {
  socket.on("createLobby", ({ lobbyName, nickname }) => {
    const lobbyId = generateId();
    const player = {
      id: socket.id,
      nickname,
      avatar: null,
      role: null
    };
    const lobby = {
      id: lobbyId,
      name: lobbyName,
      ownerId: socket.id,
      players: [player]
    };
    lobbies.set(lobbyId, lobby);
    socket.join(lobbyId);
    emitLobbyUpdate(lobbyId);
  });

  socket.on("getLobbies", () => {
    const lobbyList = Array.from(lobbies.values()).map(({ id, name }) => ({ id, name }));
    socket.emit("lobbyList", lobbyList);
  });

  socket.on("joinLobby", ({ lobbyId, nickname }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.players.length >= 20) return;
    const player = {
      id: socket.id,
      nickname,
      avatar: null,
      role: null
    };
    lobby.players.push(player);
    socket.join(lobbyId);
    emitLobbyUpdate(lobbyId);
  });
});

function emitLobbyUpdate(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const playersWithAvatars = Array.from({ length: 20 }, (_, i) => {
    const player = lobby.players[i];
    return player
      ? { id: player.id, nickname: player.nickname, avatar: player.avatar || `Avatar${i + 1}.png` }
      : { empty: true };
  });
  io.to(lobbyId).emit("lobbyJoined", {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      ownerId: lobby.ownerId
    },
    players: playersWithAvatars
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});