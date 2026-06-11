const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.static('public'));

// ========== BASE DE DONNÉES SQLITE ==========
const db = new sqlite3.Database('./database.sqlite');

// Initialisation des tables
db.serialize(() => {
  // Table des joueurs
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      display_name TEXT,
      total_games INTEGER DEFAULT 0,
      total_wins INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des parties
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      player_nord_id TEXT,
      player_sud_id TEXT,
      board TEXT,
      current_turn TEXT,
      nord_score INTEGER DEFAULT 0,
      sud_score INTEGER DEFAULT 0,
      history TEXT,
      status TEXT DEFAULT 'waiting',
      winner TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des coups
  db.run(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT,
      move_number INTEGER,
      player TEXT,
      hole INTEGER,
      captured INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ========== FONCTIONS MÉTIER ==========
function initBoard() {
  return JSON.stringify(Array(14).fill(5));
}

function isValidMove(boardArray, hole, player) {
  if (player === 'NORD' && (hole < 0 || hole > 6)) return false;
  if (player === 'SUD' && (hole < 7 || hole > 13)) return false;
  return boardArray[hole] > 0;
}

function executeMoveLogic(boardArray, hole, player) {
  let newBoard = [...boardArray];
  let seeds = newBoard[hole];
  newBoard[hole] = 0;
  
  let currentHole = hole;
  
  while (seeds > 0) {
    currentHole = (currentHole + 1) % 14;
    if (currentHole === hole && newBoard[hole] === 0) continue;
    newBoard[currentHole]++;
    seeds--;
  }
  
  let captured = 0;
  let lastHole = currentHole;
  const opponentStart = player === 'NORD' ? 7 : 0;
  const opponentEnd = player === 'NORD' ? 14 : 7;
  
  while (lastHole >= opponentStart && lastHole < opponentEnd && 
         (newBoard[lastHole] === 2 || newBoard[lastHole] === 3)) {
    captured += newBoard[lastHole];
    newBoard[lastHole] = 0;
    lastHole--;
  }
  
  return { board: newBoard, captured };
}

function checkVictory(boardArray, nordScore, sudScore) {
  const nordTotal = boardArray.slice(0, 7).reduce((a, b) => a + b, 0);
  const sudTotal = boardArray.slice(7, 14).reduce((a, b) => a + b, 0);
  
  if (nordTotal === 0 || nordScore >= 50) return 'SUD';
  if (sudTotal === 0 || sudScore >= 50) return 'NORD';
  return null;
}

// ========== API ROUTES ==========

// Enregistrement joueur
app.post('/api/register', (req, res) => {
  const { username, display_name } = req.body;
  
  if (!username || !display_name) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  
  db.get('SELECT id, username, display_name FROM players WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erreur base de données' });
    
    if (row) {
      return res.json({ success: true, player_id: row.id, username: row.username, display_name: row.display_name });
    }
    
    const playerId = uuidv4();
    db.run('INSERT INTO players (id, username, display_name) VALUES (?, ?, ?)', 
      [playerId, username, display_name], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur création joueur' });
        res.json({ success: true, player_id: playerId, username, display_name });
      });
  });
});

// Créer une partie
app.post('/api/create_game', (req, res) => {
  const { player_id, player_name } = req.body;
  
  if (!player_id) {
    return res.status(400).json({ error: 'Identifiant joueur requis' });
  }
  
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const board = initBoard();
  
  db.run(`INSERT INTO games (id, player_nord_id, board, current_turn, nord_score, sud_score, history, status)
          VALUES (?, ?, ?, 'NORD', 0, 0, '[]', 'waiting')`,
    [gameId, player_id, board], (err) => {
      if (err) return res.status(500).json({ error: 'Erreur création partie' });
      
      res.json({
        success: true,
        game_id: gameId,
        board: JSON.parse(board),
        current_turn: 'NORD',
        nord_score: 0,
        sud_score: 0,
        player_color: 'NORD'
      });
    });
});

// Rejoindre une partie
app.post('/api/join_game', (req, res) => {
  const { game_id, player_id } = req.body;
  
  if (!game_id || !player_id) {
    return res.status(400).json({ error: 'Code partie et identifiant requis' });
  }
  
  db.get('SELECT * FROM games WHERE id = ? AND status = "waiting"', [game_id.toUpperCase()], (err, game) => {
    if (err || !game) {
      return res.status(404).json({ error: 'Partie inexistante ou déjà commencée' });
    }
    
    db.run('UPDATE games SET player_sud_id = ?, status = "playing" WHERE id = ?',
      [player_id, game_id.toUpperCase()], (err) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du join' });
        
        res.json({
          success: true,
          game_id: game_id.toUpperCase(),
          board: JSON.parse(game.board),
          current_turn: game.current_turn,
          nord_score: game.nord_score,
          sud_score: game.sud_score,
          player_color: 'SUD'
        });
      });
  });
});

// Obtenir l'état d'une partie
app.get('/api/get_game', (req, res) => {
  const gameId = req.query.game_id;
  
  if (!gameId) {
    return res.status(400).json({ error: 'Code partie requis' });
  }
  
  db.get('SELECT * FROM games WHERE id = ?', [gameId.toUpperCase()], (err, game) => {
    if (err || !game) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }
    
    // Récupérer les infos joueurs
    const players = {};
    
    if (game.player_nord_id) {
      db.get('SELECT display_name FROM players WHERE id = ?', [game.player_nord_id], (err, row) => {
        players.NORD = row ? row.display_name : 'Joueur Nord';
      });
    }
    
    if (game.player_sud_id) {
      db.get('SELECT display_name FROM players WHERE id = ?', [game.player_sud_id], (err, row) => {
        players.SUD = row ? row.display_name : 'Joueur Sud';
      });
    }
    
    // Récupérer l'historique
    db.all('SELECT * FROM moves WHERE game_id = ? ORDER BY move_number DESC LIMIT 20', [gameId.toUpperCase()], (err, history) => {
      res.json({
        success: true,
        game: {
          id: game.id,
          board: JSON.parse(game.board),
          current_turn: game.current_turn,
          nord_score: game.nord_score,
          sud_score: game.sud_score,
          status: game.status,
          winner: game.winner,
          players
        },
        history: history || []
      });
    });
  });
});

// Jouer un coup
app.post('/api/make_move', (req, res) => {
  const { game_id, hole, player_id } = req.body;
  
  if (!game_id || hole === undefined || !player_id) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  
  db.get('SELECT * FROM games WHERE id = ?', [game_id.toUpperCase()], (err, game) => {
    if (err || !game) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ error: 'Partie terminée' });
    }
    
    // Déterminer le joueur
    let playerColor = null;
    if (game.player_nord_id === player_id) playerColor = 'NORD';
    if (game.player_sud_id === player_id) playerColor = 'SUD';
    
    if (!playerColor) {
      return res.status(403).json({ error: 'Vous n\'êtes pas dans cette partie' });
    }
    
    if (game.current_turn !== playerColor) {
      return res.status(400).json({ error: 'Ce n\'est pas votre tour' });
    }
    
    const boardArray = JSON.parse(game.board);
    
    if (!isValidMove(boardArray, hole, playerColor)) {
      return res.status(400).json({ error: 'Coup invalide' });
    }
    
    const result = executeMoveLogic(boardArray, hole, playerColor);
    
    let nordScore = game.nord_score;
    let sudScore = game.sud_score;
    
    if (playerColor === 'NORD') {
      nordScore += result.captured;
    } else {
      sudScore += result.captured;
    }
    
    // Compter les coups
    db.get('SELECT COUNT(*) as count FROM moves WHERE game_id = ?', [game_id.toUpperCase()], (err, countResult) => {
      const moveNumber = (countResult?.count || 0) + 1;
      
      db.run(`INSERT INTO moves (game_id, move_number, player, hole, captured)
              VALUES (?, ?, ?, ?, ?)`,
        [game_id.toUpperCase(), moveNumber, playerColor, hole, result.captured], () => {
          
          const newTurn = playerColor === 'NORD' ? 'SUD' : 'NORD';
          const winner = checkVictory(result.board, nordScore, sudScore);
          const newStatus = winner ? 'finished' : 'playing';
          
          db.run(`UPDATE games 
                  SET board = ?, nord_score = ?, sud_score = ?, current_turn = ?, status = ?, winner = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`,
            [JSON.stringify(result.board), nordScore, sudScore, newTurn, newStatus, winner, game_id.toUpperCase()], () => {
              
              if (winner) {
                const winnerId = winner === 'NORD' ? game.player_nord_id : game.player_sud_id;
                db.run('UPDATE players SET total_games = total_games + 1, total_wins = total_wins + 1 WHERE id = ?', [winnerId]);
                
                const loserId = winner === 'NORD' ? game.player_sud_id : game.player_nord_id;
                if (loserId) {
                  db.run('UPDATE players SET total_games = total_games + 1 WHERE id = ?', [loserId]);
                }
              }
              
              res.json({
                success: true,
                board: result.board,
                captured: result.captured,
                nord_score: nordScore,
                sud_score: sudScore,
                current_turn: newTurn,
                winner: winner
              });
            });
        });
    });
  });
});

// Reset partie
app.post('/api/reset_game', (req, res) => {
  const { game_id } = req.body;
  
  if (!game_id) {
    return res.status(400).json({ error: 'Code partie requis' });
  }
  
  const newBoard = initBoard();
  
  db.run(`UPDATE games 
          SET board = ?, nord_score = 0, sud_score = 0, current_turn = 'NORD', status = 'playing', winner = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    [newBoard, game_id.toUpperCase()], (err) => {
      if (err) return res.status(500).json({ error: 'Erreur reset' });
      
      db.run('DELETE FROM moves WHERE game_id = ?', [game_id.toUpperCase()]);
      
      res.json({
        success: true,
        board: JSON.parse(newBoard),
        current_turn: 'NORD',
        nord_score: 0,
        sud_score: 0
      });
    });
});

// Route principale
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== SOCKET.IO POUR TEMPS RÉEL ==========
const onlineGames = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Client connecté:', socket.id);
  
  socket.on('join_game', (gameId) => {
    socket.join(gameId);
    onlineGames.set(socket.id, gameId);
    console.log(`🎮 ${socket.id} a rejoint la partie ${gameId}`);
  });
  
  socket.on('game_update', (data) => {
    io.to(data.game_id).emit('game_sync', data);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client déconnecté:', socket.id);
    onlineGames.delete(socket.id);
  });
});

// ========== DÉMARRAGE ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Awélé démarré sur http://localhost:${PORT}`);
  console.log(`📊 Base de données: SQLite (./database.sqlite)`);
});
