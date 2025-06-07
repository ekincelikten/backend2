// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const lobbies = new Map();

io.on("connection", (socket) => {
  socket.on("createLobby", ({ lobbyName, nickname }) => {
    const id = uuidv4();
    const lobby = {
      id,
      name: lobbyName,
      owner: nickname,
      ownerId: socket.id,
      players: [{ id: socket.id, nickname, alive: true }],
      votes: {},
      phase: "waiting",
      accused: null,
      finalVotes: [],
      dayTimerRunning: true
    };
    lobbies.set(id, lobby);
    socket.join(id);
    io.to(socket.id).emit("lobbyJoined", { lobby, players: lobby.players });
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
    if (!lobby || lobby.players.length >= 20) return;
    lobby.players.push({ id: socket.id, nickname, alive: true });
    socket.join(lobbyId);
    io.to(lobbyId).emit("lobbyJoined", { lobby, players: lobby.players });
  });

  socket.on("startGame", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    const shuffled = [...lobby.players].sort(() => 0.5 - Math.random());
    const gulyabani = shuffled[0];
    const others = shuffled.slice(1);

    lobby.gulyabaniId = gulyabani.id;
    lobby.phase = "night";

    io.to(gulyabani.id).emit("roleAssigned", { role: "Gulyabani" });
    others.forEach(p => io.to(p.id).emit("roleAssigned", { role: "Vatandaş" }));
    io.to(lobbyId).emit("gameStarted");

    io.to(gulyabani.id).emit("nightPhase", { players: others });
  });

  socket.on("gulyabaniKill", ({ lobbyId, targetId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || socket.id !== lobby.gulyabaniId) return;
    const target = lobby.players.find(p => p.id === targetId);
    if (!target) return;

    target.alive = false;
    io.to(targetId).emit("killed", { reason: "Gulyabani tarafından yendin!" });
    io.to(lobbyId).emit("playerDied", { id: targetId, nickname: target.nickname });

    lobby.phase = "day";
    lobby.votes = {};
    lobby.dayTimerRunning = true;
    io.to(lobbyId).emit("dayStart", { isOwner: lobby.ownerId });
  });

  socket.on("vote", ({ lobbyId, targetId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.phase !== "day") return;

    lobby.votes[socket.id] = targetId;

    const voteCounts = {};
    Object.values(lobby.votes).forEach(id => {
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    });

    const majority = Math.floor(lobby.players.filter(p => p.alive).length / 2) + 1;

    for (const [id, count] of Object.entries(voteCounts)) {
      if (count >= majority) {
        const accused = lobby.players.find(p => p.id === id);
        if (accused && accused.alive) {
          lobby.phase = "defense";
          lobby.accused = accused;
          io.to(lobbyId).emit("defensePhase", { nickname: accused.nickname });
          setTimeout(() => {
            lobby.phase = "finalVote";
            lobby.finalVotes = [];
            io.to(lobbyId).emit("finalVotePhase", { nickname: accused.nickname });
          }, 10000);
        }
        break;
      }
    }
  });

  socket.on("finalVote", ({ lobbyId, vote }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.phase !== "finalVote") return;
    lobby.finalVotes.push({ id: socket.id, vote });

    const aliveCount = lobby.players.filter(p => p.alive).length;
    if (lobby.finalVotes.length >= aliveCount) {
      const guiltyCount = lobby.finalVotes.filter(v => v.vote).length;
      if (guiltyCount > aliveCount / 2) {
        lobby.accused.alive = false;
        io.to(lobbyId).emit("executed", { nickname: lobby.accused.nickname });
      } else {
        io.to(lobbyId).emit("spared", { nickname: lobby.accused.nickname });
      }
      lobby.phase = "day";
      lobby.votes = {};
      lobby.accused = null;
      lobby.dayTimerRunning = true;
      io.to(lobbyId).emit("dayStart", { isOwner: lobby.ownerId });
    }
  });

  socket.on("pauseDayTimer", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.phase !== "day") return;
    if (socket.id !== lobby.ownerId) return;
    lobby.dayTimerRunning = false;
    io.to(lobbyId).emit("dayTimerPaused");
  });

  socket.on("phaseEnded", ({ lobbyId }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.phase === "night") {
      lobby.phase = "day";
      lobby.votes = {};
      lobby.dayTimerRunning = true;
      io.to(lobbyId).emit("dayStart", { isOwner: lobby.ownerId });
    } else if (lobby.phase === "day") {
      if (!lobby.dayTimerRunning && lobby.phase !== "finalVote" && lobby.phase !== "defense") return;
      lobby.phase = "night";
      const alivePlayers = lobby.players.filter(p => p.alive);
      const gulyabani = alivePlayers.find(p => p.id === lobby.gulyabaniId);
      if (gulyabani) {
        const targets = alivePlayers.filter(p => p.id !== gulyabani.id);
        io.to(gulyabani.id).emit("nightPhase", { players: targets });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});