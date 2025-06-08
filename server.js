const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

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

  socket.on("startGame", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || socket.id !== lobby.ownerId) return;

    const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
    shuffled[0].role = "Gulyabani";
    for (let i = 1; i < shuffled.length; i++) {
      shuffled[i].role = "Vatandas";
    }

    shuffled.forEach(p => {
      io.to(p.id).emit("yourRole", { role: p.role });
    });

    io.to(lobbyId).emit("phaseChange", { phase: "night" });
    setTimeout(() => {
      io.to(lobbyId).emit("phaseChange", { phase: "day" });
    }, 10000);
  });
});

function emitLobbyUpdate(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  const playersWithAvatars = Array.from({ length: 20 }, (_, i) => {
    const player = lobby.players[i];
    return player
      ? { nickname: player.nickname, avatar: player.avatar || `Avatar${i + 1}.png` }
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

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
