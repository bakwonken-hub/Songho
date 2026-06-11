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

// Servir les fichiers statiques
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des parties multijoueur
const games = new Map(); // gameId -> { players, board, currentTurn, status }

io.on('connection', (socket) => {
  console.log('Nouveau joueur connecté:', socket.id);

  // Créer une nouvelle partie
  socket.on('createGame', () => {
    const gameId = generateGameId();
    games.set(gameId, {
      players: [socket.id],
      board: initializeBoard(),
      currentTurn: 'B', // B pour Blanc, N pour Noir
      status: 'waiting', // waiting, playing, finished
      playerColors: { [socket.id]: 'B' }
    });
    socket.join(gameId);
    socket.emit('gameCreated', { gameId, color: 'B' });
    console.log(`Partie ${gameId} créée par ${socket.id}`);
  });

  // Rejoindre une partie
  socket.on('joinGame', (gameId) => {
    const game = games.get(gameId);
    if (game && game.status === 'waiting' && game.players.length === 1) {
      game.players.push(socket.id);
      game.playerColors[socket.id] = 'N';
      game.status = 'playing';
      socket.join(gameId);
      
      // Informer les deux joueurs
      io.to(gameId).emit('gameStarted', {
        players: game.players,
        board: game.board,
        currentTurn: game.currentTurn,
        colors: game.playerColors
      });
      
      socket.emit('gameJoined', { gameId, color: 'N' });
      console.log(`Joueur ${socket.id} a rejoint la partie ${gameId}`);
    } else {
      socket.emit('joinError', 'Partie inexistante ou déjà pleine');
    }
  });

  // Jouer un coup
  socket.on('makeMove', ({ gameId, fromX, fromY, toX, toY }) => {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;
    
    // Vérifier que c'est bien le tour du joueur
    const playerColor = game.playerColors[socket.id];
    if (playerColor !== game.currentTurn) {
      socket.emit('moveError', 'Ce n\'est pas votre tour');
      return;
    }
    
    // Exécuter le mouvement
    const result = executeMove(game.board, fromX, fromY, toX, toY, game.currentTurn);
    
    if (result.success) {
      game.board = result.board;
      
      // Vérifier alignement de 3
      if (result.alignment) {
        // Envoyer un événement pour permettre au joueur de choisir un pion à retirer
        socket.emit('alignmentBonus', { board: game.board });
        // Ici, on attendrait une réponse pour retirer un pion adverse
      }
      
      // Changer de tour
      game.currentTurn = game.currentTurn === 'B' ? 'N' : 'B';
      
      // Vérifier victoire
      const winner = checkVictory(game.board);
      if (winner) {
        game.status = 'finished';
        io.to(gameId).emit('gameOver', { winner, board: game.board });
      } else {
        // Diffuser le nouveau plateau
        io.to(gameId).emit('moveMade', {
          board: game.board,
          currentTurn: game.currentTurn,
          fromX, fromY, toX, toY
        });
      }
    } else {
      socket.emit('moveError', result.message);
    }
  });

  // Retirer un pion suite à un alignement
  socket.on('removePiece', ({ gameId, x, y }) => {
    const game = games.get(gameId);
    if (!game || game.status !== 'playing') return;
    
    const playerColor = game.playerColors[socket.id];
    const pieceColor = game.board[x][y];
    
    if (pieceColor && pieceColor !== playerColor) {
      game.board[x][y] = null;
      io.to(gameId).emit('pieceRemoved', { board: game.board, x, y });
    }
  });

  // Déconnexion
  socket.on('disconnect', () => {
    console.log('Joueur déconnecté:', socket.id);
    // Nettoyer les parties où ce joueur était présent
    for (const [gameId, game] of games.entries()) {
      if (game.players.includes(socket.id)) {
        io.to(gameId).emit('playerDisconnected', 'L\'autre joueur a quitté la partie');
        games.delete(gameId);
        break;
      }
    }
  });
});

function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function initializeBoard() {
  const board = Array(5).fill().map(() => Array(5).fill(null));
  
  // Placer les pions blancs (lignes 0 et 1, plus deux coins de la ligne 2)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 5; j++) {
      board[i][j] = 'B';
    }
  }
  board[2][0] = 'B';
  board[2][4] = 'B';
  
  // Placer les pions noirs (lignes 4 et 3, plus deux coins de la ligne 2)
  for (let i = 3; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      board[i][j] = 'N';
    }
  }
  board[2][0] = 'B';
  board[2][4] = 'B';
  
  return board;
}

function executeMove(board, fromX, fromY, toX, toY, playerColor) {
  // Vérifications basiques
  if (fromX < 0 || fromX > 4 || fromY < 0 || fromY > 4 ||
      toX < 0 || toX > 4 || toY < 0 || toY > 4) {
    return { success: false, message: 'Position invalide' };
  }
  
  const piece = board[fromX][fromY];
  if (!piece || piece !== playerColor) {
    return { success: false, message: 'Ce n\'est pas votre pion' };
  }
  
  if (board[toX][toY] !== null) {
    return { success: false, message: 'Case occupée' };
  }
  
  // Vérifier déplacement adjacent (horizontal ou vertical)
  const isAdjacent = (Math.abs(toX - fromX) + Math.abs(toY - fromY)) === 1;
  if (!isAdjacent) {
    return { success: false, message: 'Déplacement non adjacent' };
  }
  
  // Créer une copie du plateau
  const newBoard = board.map(row => [...row]);
  
  // Effectuer le déplacement
  newBoard[toX][toY] = piece;
  newBoard[fromX][fromY] = null;
  
  // Vérifier les captures (saut par-dessus un pion adverse)
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
    const midX = fromX + dx/2;
    const midY = fromY + dy/2;
    if (midX >= 0 && midX <= 4 && midY >= 0 && midY <= 4) {
      const midPiece = board[midX][midY];
      if (midPiece && midPiece !== piece) {
        newBoard[midX][midY] = null;
        return { success: true, board: newBoard, alignment: false };
      }
    }
  }
  
  // Vérifier alignement de 3 pions
  const hasAlignment = checkAlignment(newBoard, toX, toY, piece);
  
  return { success: true, board: newBoard, alignment: hasAlignment };
}

function checkAlignment(board, x, y, color) {
  // Vérifier horizontal
  let count = 1;
  for (let i = x+1; i < 5 && board[i][y] === color; i++) count++;
  for (let i = x-1; i >= 0 && board[i][y] === color; i--) count++;
  if (count >= 3) return true;
  
  // Vérifier vertical
  count = 1;
  for (let j = y+1; j < 5 && board[x][j] === color; j++) count++;
  for (let j = y-1; j >= 0 && board[x][j] === color; j--) count++;
  if (count >= 3) return true;
  
  return false;
}

function checkVictory(board) {
  let whiteCount = 0;
  let blackCount = 0;
  
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});