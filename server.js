// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], credentials: true }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

const lobbies = new Map();
const MAX_PLAYERS = 20;
const AVATAR_COUNT = 20;

function generateAvatars() {
  const all = Array.from({ length: AVATAR_COUNT }, (_, i) => `Avatar${i + 1}.png`);
  return all.sort(() => 0.5 - Math.random());
}

io.on("connection", (socket) => {
  socket.on("createLobby", ({ lobbyName, nickname }) => {
    const id = uuidv4();
    const avatars = generateAvatars();
    const player = {
      id: socket.id,
      nickname,
      alive: true,
      avatar: avatars.pop()
    };
    const lobby = {
      id,
      name: lobbyName,
      owner: nickname,
      ownerId: socket.id,
      players: [player],
      avatars,
      votes: {},
      phase: "waiting",
      accused: null,
      finalVotes: [],
      dayTimerRunning: true
    };
    lobbies.set(id, lobby);
    socket.join(id);
    const fullList = Array.from({ length: MAX_PLAYERS }).map((_, i) => lobby.players[i] || { empty: true });
    io.to(socket.id).emit("lobbyJoined", { lobby, players: fullList });
  });

  socket.on("getLobbies", () => {
    const list = Array.from(lobbies.values()).map((l) => ({
      id: l.id,
      name: l.name,
      players: l.players
    }));
    io.to(socket.id).emit("lobbyList", list);
  });

  socket.on("joinLobby", ({ lobbyId, nickname }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.players.length >= MAX_PLAYERS) return;
    const avatar = lobby.avatars.pop();
    const player = { id: socket.id, nickname, alive: true, avatar };
    lobby.players.push(player);
    socket.join(lobbyId);
    const fullList = Array.from({ length: MAX_PLAYERS }).map((_, i) => lobby.players[i] || { empty: true });
    io.to(lobbyId).emit("lobbyJoined", { lobby, players: fullList });
  });

  socket.on("startGame", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || socket.id !== lobby.ownerId) return;

    const shuffled = [...lobby.players].filter(p => !p.empty).sort(() => 0.5 - Math.random());
    const gulyabani = shuffled[0];
    const others = shuffled.slice(1);

    lobby.gulyabaniId = gulyabani.id;
    lobby.phase = "night";

    io.to(gulyabani.id).emit("roleAssigned", { role: "Gulyabani" });
    others.forEach(p => io.to(p.id).emit("roleAssigned", { role: "Vatandaş" }));
    io.to(lobbyId).emit("gameStarted");

    io.to(gulyabani.id).emit("nightPhase", { players: others });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
