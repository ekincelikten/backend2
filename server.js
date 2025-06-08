
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const lobbies = new Map();

io.on("connection", (socket) => {
  socket.on("createLobby", (data) => {
    const { nickname, lobbyName } = data;
    const lobbyCode = generateCode();
    const player = {
      id: socket.id,
      nickname,
      avatar: assignAvatar([], []),
      role: null,
      alive: true,
    };

    lobbies.set(lobbyCode, {
      name: lobbyName,
      players: [player],
      started: false,
      phase: "lobby",
    });

    socket.join(lobbyCode);
    socket.emit("lobbyJoined", { lobbyCode, player });
    io.emit("lobbyList", getLobbyList());
  });

  socket.on("getLobbies", () => {
    socket.emit("lobbyList", getLobbyList());
  });

  socket.on("joinLobby", (data) => {
    const { nickname, lobbyCode } = data;
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || lobby.started || lobby.players.length >= 20) return;

    const existingAvatars = lobby.players.map(p => p.avatar);
    const player = {
      id: socket.id,
      nickname,
      avatar: assignAvatar(existingAvatars, []),
      role: null,
      alive: true,
    };

    lobby.players.push(player);
    socket.join(lobbyCode);
    socket.emit("lobbyJoined", { lobbyCode, player });
    io.to(lobbyCode).emit("lobbyUpdated", lobby);
    io.emit("lobbyList", getLobbyList());
  });

  socket.on("startGame", (lobbyCode) => {
    const lobby = lobbies.get(lobbyCode);
    if (!lobby || lobby.started) return;

    const players = lobby.players;
    lobby.started = true;
    lobby.phase = "day";

    // 1 Gulyabani, diğerleri Vatandaş
    const shuffled = players.sort(() => Math.random() - 0.5);
    shuffled[0].role = "Gulyabani";
    for (let i = 1; i < shuffled.length; i++) {
      shuffled[i].role = "Vatandaş";
    }

    // Roller sadece sahiplerine gönderilir
    shuffled.forEach(p => {
      io.to(p.id).emit("roleAssigned", p.role);
    });

    io.to(lobbyCode).emit("gameStarted", {
      players: players.map(p => ({ nickname: p.nickname, avatar: p.avatar })),
    });
  });

  socket.on("disconnect", () => {
    for (const [code, lobby] of lobbies.entries()) {
      const index = lobby.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        lobby.players.splice(index, 1);
        if (lobby.players.length === 0) {
          lobbies.delete(code);
        } else {
          io.to(code).emit("lobbyUpdated", lobby);
        }
        io.emit("lobbyList", getLobbyList());
        break;
      }
    }
  });
});

function getLobbyList() {
  const list = [];
  for (const [code, lobby] of lobbies.entries()) {
    if (!lobby.started) {
      list.push({ code, name: lobby.name, count: lobby.players.length });
    }
  }
  return list;
}

function assignAvatar(used, dead) {
  for (let i = 1; i <= 20; i++) {
    const name = `Avatar${i}.png`;
    if (!used.includes(name) && !dead.includes(name)) return name;
  }
  return "Empty.png";
}

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
