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

// Gestion des parties multijoueur
const games = new Map();

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initializeBoard() {
  const board = Array(5).fill().map(() => Array(5).fill(null));
  
  // Pions blancs (NORD)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 5; j++) {
      board[i][j] = 'B';
    }
  }
  board[2][0] = 'B';
  board[2][4] = 'B';
  
  // Pions noirs (SUD)
  for (let i = 3; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      board[i][j] = 'N';
    }
  }
  
  return board;
}

function isValidMove(board, fromX, fromY, toX, toY, color) {
  if (toX < 0 || toX > 4 || toY < 0 || toY > 4) return false;
  if (board[toX][toY] !== null) return false;
  
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  
  if (dx + dy === 1) return true;
  
  if ((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) {
    const midX = (fromX + toX) / 2;
    const midY = (fromY + toY) / 2;
    const midPiece = board[midX][midY];
    if (midPiece && midPiece !== color) return true;
  }
  
  return false;
}

function executeMove(board, fromX, fromY, toX, toY, color) {
  const piece = board[fromX][fromY];
  if (!piece || piece !== color) return { success: false, message: "Ce n'est pas votre pion" };
  if (!isValidMove(board, fromX, fromY, toX, toY, color)) {
    return { success: false, message: "Déplacement invalide" };
  }
  
  const newBoard = board.map(row => [...row]);
  newBoard[toX][toY] = piece;
  newBoard[fromX][fromY] = null;
  
  let captured = false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  
  if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
    const midX = fromX + dx/2;
    const midY = fromY + dy/2;
    if (midX >= 0 && midX <= 4 && midY >= 0 && midY <= 4) {
      if (newBoard[midX][midY] && newBoard[midX][midY] !== color) {
        newBoard[midX][midY] = null;
        captured = true;
      }
    }
  }
  
  return { success: true, board: newBoard, captured };
}

function checkVictory(board) {
  let whiteCount = 0, blackCount = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (board[i][j] === 'B') whiteCount++;
      if (board[i][j] === 'N') blackCount++;
    }
  }
  if (whiteCount === 0) return 'N';
  if (blackCount === 0) return 'B';
  return null;
}

io.on('connection', (socket) => {
  console.log('🎮 Joueur connecté:', socket.id);

  socket.on('createGame', () => {
    const gameId = generateGameId();
    games.set(gameId, {
      players: [socket.id],
      board: initializeBoard(),
      currentTurn: 'B',
      status: 'waiting',
      playerColors: { [socket.id]: 'B' }
    });
    socket.join(gameId);
    socket.emit('gameCreated', { gameId, color: 'B' });
    console.log(`📌 Partie ${gameId} créée`);
  });

  socket.on('joinGame', (gameId) => {
    const game = games.get(gameId);
    if (game && game.status === 'waiting' && game.players.length === 1) {
      game.players.push(socket.id);
      game.playerColors[socket.id] = 'N';
      game.status = 'playing';
      socket.join(gameId);
      
      io.to(gameId).emit('gameStarted', {
        board: game.board,
        currentTurn: game.currentTurn,
        colors: game.playerColors
      });
      
      socket.emit('gameJoined', { gameId, color: 'N' });
      console.log(`🎲 Joueur ${socket.id} a rejoint la partie ${gameId}`);
    } else {
      socket.emit('joinError', 'Partie inexistante ou déjà pleine');
    }
  });

  socket.on('makeMove', ({ gameId, fromX, fromY, toX, toY }) => {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;
    
    const playerColor = game.playerColors[socket.id];
    if (playerColor !== game.currentTurn) {
      socket.emit('moveError', 'Ce n\'est pas votre tour');
      return;
    }
    
    const result = executeMove(game.board, fromX, fromY, toX, toY, game.currentTurn);
    
    if (result.success) {
      game.board = result.board;
      
      const winner = checkVictory(game.board);
      if (winner) {
        game.status = 'finished';
        io.to(gameId).emit('gameOver', { winner, board: game.board });
      } else {
        game.currentTurn = game.currentTurn === 'B' ? 'N' : 'B';
        io.to(gameId).emit('moveMade', {
          board: game.board,
          currentTurn: game.currentTurn,
          fromX, fromY, toX, toY,
          captured: result.captured
        });
      }
    } else {
      socket.emit('moveError', result.message);
    }
  });

  socket.on('resetGame', (gameId) => {
    const game = games.get(gameId);
    if (game) {
      game.board = initializeBoard();
      game.currentTurn = 'B';
      game.status = 'playing';
      io.to(gameId).emit('gameReset', { board: game.board, currentTurn: 'B' });
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
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
