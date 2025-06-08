// server.js - backend (tamamlanmış sürüm)

const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "https://hortlakli-koy-frontend.vercel.app",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const lobbies = {};

function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 7);
}

function getRandomAvatar(usedAvatars) {
  const available = [];
  for (let i = 1; i <= 20; i++) {
    const avatar = `Avatar${i}.png`;
    if (!usedAvatars.includes(avatar)) available.push(avatar);
  }
  if (available.length === 0) return `Avatar${Math.floor(Math.random() * 20) + 1}.png`;
  return available[Math.floor(Math.random() * available.length)];
}

function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  shuffled[0].role = "Gulyabani";
  for (let i = 1; i < shuffled.length; i++) {
    shuffled[i].role = "Vatandaş";
  }
}

function startDayPhase(lobbyCode) {
  const lobby = lobbies[lobbyCode];
  if (!lobby) return;
  lobby.phase = "day";
  io.to(lobbyCode).emit("phaseChanged", { phase: "day" });
}

io.on("connection", (socket) => {
  socket.on("createLobby", ({ lobbyName, nickname }) => {
    const lobbyCode = generateLobbyCode();
    lobbies[lobbyCode] = {
      name: lobbyName,
      players: [],
      phase: "waiting",
      attackPerformed: false
    };
    const usedAvatars = [];
    const avatar = getRandomAvatar(usedAvatars);
    usedAvatars.push(avatar);
    const player = {
      id: socket.id,
      nickname,
      avatar,
      role: "",
      isAlive: true
    };
    lobbies[lobbyCode].players.push(player);
    socket.join(lobbyCode);
    socket.emit("lobbyJoined", {
      lobby: lobbies[lobbyCode],
      players: lobbies[lobbyCode].players
    });
  });

  socket.on("joinLobby", ({ lobbyCode, nickname }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.players.length >= 20) return;
    const usedAvatars = lobby.players.map(p => p.avatar);
    const avatar = getRandomAvatar(usedAvatars);
    const player = {
      id: socket.id,
      nickname,
      avatar,
      role: "",
      isAlive: true
    };
    lobby.players.push(player);
    socket.join(lobbyCode);
    io.to(lobbyCode).emit("playerJoined", lobby.players);
  });

  socket.on("startGame", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby || lobby.players.length < 5) return;
    assignRoles(lobby.players);
    io.to(lobbyCode).emit("gameStarted", lobby.players);
    startDayPhase(lobbyCode);
  });

  socket.on("attack", ({ lobbyCode, targetId }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    const victim = lobby.players.find(p => p.id === targetId && p.isAlive);
    if (victim) {
      victim.isAlive = false;
      lobby.attackPerformed = true;
      io.to(lobbyCode).emit("playerDied", { playerId: victim.id });
      io.to(targetId).emit("killed", { reason: "Gulyabani tarafından yendin!" });

      const villagers = lobby.players.filter(p => p.role === "Vatandaş" && p.isAlive);
      const gulyabani = lobby.players.find(p => p.role === "Gulyabani" && p.isAlive);
      if (!gulyabani) io.to(lobbyCode).emit("gameOver", { winner: "Köylüler Kazandı!" });
      else if (villagers.length === 0) io.to(lobbyCode).emit("gameOver", { winner: "Hortlaklar Kazandı!" });
    }
  });

  socket.on("startNight", ({ lobbyCode }) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) return;

    lobby.phase = "night";
    lobby.attackPerformed = false;
    const gulyabani = lobby.players.find(p => p.role === "Gulyabani" && p.isAlive);
    const alivePlayers = lobby.players.filter(p => p.isAlive && p.id !== gulyabani?.id);
    if (gulyabani) {
      io.to(gulyabani.id).emit("chooseVictim", alivePlayers);

      setTimeout(() => {
        if (!lobby.attackPerformed) {
          io.to(lobbyCode).emit("log", "Gulyabani saldırmadı, gece sona erdi.");
          lobby.phase = "day";
          startDayPhase(lobbyCode);
        }
      }, 10000);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
