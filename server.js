const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des parties
const games = new Map();

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initializeBoard() {
  // Plateau: 12 trous (0-5 = Nord/Joueur1, 6-11 = Sud/Joueur2)
  // Chaque trou commence avec 4 graines
  return Array(12).fill(4);
}

function getValidMoves(board, player) {
  // player: 'N' (Nord, trous 0-5) ou 'S' (Sud, trous 6-11)
  const start = player === 'N' ? 0 : 6;
  const end = player === 'N' ? 6 : 12;
  const moves = [];
  
  for (let i = start; i < end; i++) {
    if (board[i] > 0) {
      moves.push(i);
    }
  }
  return moves;
}

function executeMove(board, hole, player) {
  let newBoard = [...board];
  let seeds = newBoard[hole];
  newBoard[hole] = 0;
  
  let currentHole = hole;
  let captured = 0;
  
  // Distribution des graines
  while (seeds > 0) {
    currentHole = (currentHole + 1) % 12;
    // On saute le trou d'origine s'il est vide (déjà vidé)
    if (currentHole === hole && newBoard[hole] === 0) {
      continue;
    }
    newBoard[currentHole]++;
    seeds--;
  }
  
  // Capture
  let lastHole = currentHole;
  let opponentStart = player === 'N' ? 6 : 0;
  let opponentEnd = player === 'N' ? 12 : 6;
  
  while (lastHole >= opponentStart && lastHole < opponentEnd && 
         (newBoard[lastHole] === 2 || newBoard[lastHole] === 3)) {
    captured += newBoard[lastHole];
    newBoard[lastHole] = 0;
    lastHole--;
  }
  
  return { board: newBoard, captured };
}

function checkVictory(board, playerTurn) {
  const nordSeeds = board.slice(0, 6).reduce((a, b) => a + b, 0);
  const sudSeeds = board.slice(6, 12).reduce((a, b) => a + b, 0);
  
  if (nordSeeds === 0) return 'S';
  if (sudSeeds === 0) return 'N';
  
  // Vérifier si un joueur n'a plus de coups possibles
  const validMovesNord = getValidMoves(board, 'N');
  const validMovesSud = getValidMoves(board, 'S');
  
  if (validMovesNord.length === 0 && playerTurn === 'N') return 'S';
  if (validMovesSud.length === 0 && playerTurn === 'S') return 'N';
  
  return null;
}

io.on('connection', (socket) => {
  console.log('🎮 Joueur connecté:', socket.id);

  socket.on('createGame', () => {
    const gameId = generateGameId();
    games.set(gameId, {
      players: [socket.id],
      board: initializeBoard(),
      currentTurn: 'N', // Nord commence
      status: 'waiting',
      playerColors: { [socket.id]: 'N' },
      history: [],
      nordScore: 0,
      sudScore: 0
    });
    socket.join(gameId);
    socket.emit('gameCreated', { gameId, color: 'N' });
    console.log(`📌 Partie ${gameId} créée`);
  });

  socket.on('joinGame', (gameId) => {
    const game = games.get(gameId);
    if (game && game.status === 'waiting' && game.players.length === 1) {
      game.players.push(socket.id);
      game.playerColors[socket.id] = 'S';
      game.status = 'playing';
      socket.join(gameId);
      
      io.to(gameId).emit('gameStarted', {
        board: game.board,
        currentTurn: game.currentTurn,
        colors: game.playerColors,
        nordScore: game.nordScore,
        sudScore: game.sudScore,
        history: game.history
      });
      
      socket.emit('gameJoined', { gameId, color: 'S' });
      console.log(`🎲 Joueur ${socket.id} a rejoint la partie ${gameId}`);
    } else {
      socket.emit('joinError', 'Partie inexistante ou déjà pleine');
    }
  });

  socket.on('makeMove', ({ gameId, hole }) => {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;
    
    const playerColor = game.playerColors[socket.id];
    if (playerColor !== game.currentTurn) {
      socket.emit('moveError', 'Ce n\'est pas votre tour');
      return;
    }
    
    // Vérifier que le trou appartient bien au joueur
    const isValidHole = (playerColor === 'N' && hole >= 0 && hole < 6) ||
                        (playerColor === 'S' && hole >= 6 && hole < 12);
    
    if (!isValidHole) {
      socket.emit('moveError', 'Trou invalide');
      return;
    }
    
    if (game.board[hole] === 0) {
      socket.emit('moveError', 'Ce trou est vide');
      return;
    }
    
    const result = executeMove(game.board, hole, playerColor);
    game.board = result.board;
    
    // Mettre à jour les scores
    if (playerColor === 'N') {
      game.nordScore += result.captured;
    } else {
      game.sudScore += result.captured;
    }
    
    // Ajouter à l'historique
    const moveDesc = `${playerColor === 'N' ? 'Nord' : 'Sud'} joue trou ${(hole % 6) + 1}, capture ${result.captured}`;
    game.history.unshift(moveDesc);
    if (game.history.length > 20) game.history.pop();
    
    // Vérifier victoire
    const winner = checkVictory(game.board, game.currentTurn);
    if (winner) {
      game.status = 'finished';
      io.to(gameId).emit('gameOver', { 
        winner, 
        board: game.board,
        nordScore: game.nordScore,
        sudScore: game.sudScore
      });
    } else {
      game.currentTurn = game.currentTurn === 'N' ? 'S' : 'N';
      io.to(gameId).emit('moveMade', {
        board: game.board,
        currentTurn: game.currentTurn,
        nordScore: game.nordScore,
        sudScore: game.sudScore,
        history: game.history,
        lastMove: moveDesc,
        captured: result.captured
      });
    }
  });

  socket.on('resetGame', (gameId) => {
    const game = games.get(gameId);
    if (game) {
      game.board = initializeBoard();
      game.currentTurn = 'N';
      game.status = 'playing';
      game.nordScore = 0;
      game.sudScore = 0;
      game.history = [];
      io.to(gameId).emit('gameReset', { 
        board: game.board, 
        currentTurn: 'N',
        nordScore: 0,
        sudScore: 0,
        history: []
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('👋 Joueur déconnecté:', socket.id);
    for (const [gameId, game] of games.entries()) {
      if (game.players.includes(socket.id)) {
        io.to(gameId).emit('playerDisconnected');
        games.delete(gameId);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Awélé démarré sur http://localhost:${PORT}`);
});
