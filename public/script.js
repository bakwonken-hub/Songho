// ========== ÉTAT GLOBAL ==========
let currentPlayer = null;
let gameMode = 'local';
let currentGameId = null;
let currentPlayerColor = null;
let isMyTurn = true;
let pollingInterval = null;

let board = Array(14).fill(5);
let currentTurn = 'NORD';
let nordScore = 0;
let sudScore = 0;
let history = [];
let lastCapture = 0;

let socket = null;

// ========== INITIALISATION ==========
document.addEventListener('DOMContentLoaded', () => {
    const savedPlayer = localStorage.getItem('awele_player');
    if (savedPlayer) {
        try {
            currentPlayer = JSON.parse(savedPlayer);
            if (currentPlayer && currentPlayer.id) {
                document.getElementById('registerOverlay').classList.add('hidden');
                document.getElementById('mainApp').classList.remove('hidden');
                updatePlayerDisplay();
                initLocalGame();
                initSocket();
            } else {
                localStorage.removeItem('awele_player');
            }
        } catch(e) {
            localStorage.removeItem('awele_player');
        }
    }
});

function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket connecté');
    });
    
    socket.on('game_sync', (data) => {
        if (data.game_id === currentGameId) {
            board = data.board;
            currentTurn = data.current_turn;
            nordScore = data.nord_score;
            sudScore = data.sud_score;
            updateUI();
        }
    });
}

// ========== GESTION DES JOUEURS ==========
document.getElementById('registerBtn').addEventListener('click', async () => {
    const username = document.getElementById('registerUsername').value.trim();
    const displayName = document.getElementById('registerDisplayName').value.trim();
    
    if (!username || !displayName) {
        showMessage('Veuillez remplir tous les champs', '❌', 'Erreur');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, display_name: displayName })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentPlayer = {
                id: data.player_id,
                username: data.username,
                display_name: data.display_name
            };
            localStorage.setItem('awele_player', JSON.stringify(currentPlayer));
            
            document.getElementById('registerOverlay').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            updatePlayerDisplay();
            initLocalGame();
            initSocket();
            
            showMessage(`Bienvenue ${data.display_name} !`, '⚡', 'Connexion réussie');
        } else {
            showMessage(data.error || 'Erreur lors de l\'inscription', '❌', 'Erreur');
        }
    } catch (error) {
        showMessage('Erreur de connexion au serveur', '❌', 'Erreur');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('awele_player');
    if (pollingInterval) clearInterval(pollingInterval);
    if (socket) socket.disconnect();
    currentPlayer = null;
    currentGameId = null;
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('registerOverlay').classList.remove('hidden');
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerDisplayName').value = '';
});

function updatePlayerDisplay() {
    if (currentPlayer) {
        document.getElementById('nordPlayerName').textContent = currentPlayer.display_name;
        document.getElementById('sudPlayerName').textContent = 'En attente...';
    }
}

// ========== LOGIQUE DE JEU ==========
function initBoard() {
    board = Array(14).fill(5);
    currentTurn = 'NORD';
    nordScore = 0;
    sudScore = 0;
    history = [];
    lastCapture = 0;
    isMyTurn = true;
    updateUI();
}

function updateUI() {
    for (let i = 0; i < 14; i++) {
        const seedElem = document.getElementById(`seed-${i}`);
        if (seedElem) {
            seedElem.textContent = board[i];
            seedElem.classList.add('seed-animate');
            setTimeout(() => seedElem.classList.remove('seed-animate'), 300);
            
            const container = document.getElementById(`seeds-${i}`);
            if (container) {
                container.innerHTML = '';
                const dotsCount = Math.min(board[i], 15);
                for (let d = 0; d < dotsCount; d++) {
                    const dot = document.createElement('div');
                    dot.className = 'seed-dot';
                    container.appendChild(dot);
                }
            }
        }
    }
    
    document.getElementById('nordScoreDisplay').textContent = nordScore;
    document.getElementById('sudScoreDisplay').textContent = sudScore;
    document.getElementById('nordCenterScore').textContent = nordScore;
    document.getElementById('sudCenterScore').textContent = sudScore;
    
    const turnText = document.getElementById('turnText');
    turnText.textContent = `TOUR DU ${currentTurn}`;
    turnText.style.color = currentTurn === 'NORD' ? '#ffd700' : '#ff6a4a';
    
    const nordCard = document.getElementById('playerCardNord');
    const sudCard = document.getElementById('playerCardSud');
    
    if (currentTurn === 'NORD') {
        nordCard.classList.add('active');
        sudCard.classList.remove('active');
    } else {
        sudCard.classList.add('active');
        nordCard.classList.remove('active');
    }
    
    document.getElementById('lastCapture').innerHTML = `
        <span class="capture-value">${lastCapture}</span>
        <span class="capture-label">graines</span>
    `;
    
    updateHistoryDisplay();
    highlightValidMoves();
}

function highlightValidMoves() {
    document.querySelectorAll('.hole').forEach(h => h.classList.remove('active-turn'));
    
    if (gameMode === 'online' && !isMyTurn) return;
    
    const start = currentTurn === 'NORD' ? 0 : 7;
    const end = currentTurn === 'NORD' ? 7 : 14;
    
    for (let i = start; i < end; i++) {
        if (board[i] > 0) {
            const holeElem = document.querySelector(`.hole[data-hole="${i}"]`);
            if (holeElem) holeElem.classList.add('active-turn');
        }
    }
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">Aucun coup pour le moment</div>';
        return;
    }
    
    historyList.innerHTML = history.slice(0, 20).map((entry, idx) => `
        <div class="history-item">
            <strong>${idx + 1}.</strong> ${entry}
        </div>
    `).join('');
}

function addToHistory(moveDesc) {
    history.unshift(moveDesc);
    if (history.length > 50) history.pop();
    updateHistoryDisplay();
}

function isValidMove(hole, player) {
    if (player === 'NORD' && (hole < 0 || hole > 6)) return false;
    if (player === 'SUD' && (hole < 7 || hole > 13)) return false;
    return board[hole] > 0;
}

function executeMove(hole, player) {
    if (player !== currentTurn) return { success: false, message: "Ce n'est pas votre tour" };
    if (!isValidMove(hole, player)) return { success: false, message: "Case invalide ou vide" };
    
    let seeds = board[hole];
    let newBoard = [...board];
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
    
    board = newBoard;
    lastCapture = captured;
    
    if (player === 'NORD') {
        nordScore += captured;
    } else {
        sudScore += captured;
    }
    
    const moveDesc = `${player} joue case ${(hole % 7) + 1}, capture ${captured} graine(s)`;
    addToHistory(moveDesc);
    
    const nordTotal = board.slice(0, 7).reduce((a, b) => a + b, 0);
    const sudTotal = board.slice(7, 14).reduce((a, b) => a + b, 0);
    
    let winner = null;
    if (nordTotal === 0 || nordScore >= 50) winner = 'SUD';
    if (sudTotal === 0 || sudScore >= 50) winner = 'NORD';
    
    if (winner) {
        showMessage(`Victoire du ${winner} !`, '🏆', 'FIN DE LA PARTIE');
        return { success: true, captured, gameOver: true, winner };
    }
    
    const nextPlayer = player === 'NORD' ? 'SUD' : 'NORD';
    const nextStart = nextPlayer === 'NORD' ? 0 : 7;
    const nextEnd = nextPlayer === 'NORD' ? 7 : 14;
    let hasMove = false;
    for (let i = nextStart; i < nextEnd; i++) {
        if (board[i] > 0) { hasMove = true; break; }
    }
    
    if (!hasMove) {
        const winner = player === 'NORD' ? 'NORD' : 'SUD';
        showMessage(`Victoire du ${winner} !`, '🏆', 'FIN DE LA PARTIE');
        return { success: true, captured, gameOver: true, winner };
    }
    
    currentTurn = nextPlayer;
    
    if (gameMode === 'online' && socket && currentGameId) {
        socket.emit('game_update', {
            game_id: currentGameId,
            board: board,
            current_turn: currentTurn,
            nord_score: nordScore,
            sud_score: sudScore
        });
    }
    
    return { success: true, captured };
}

// ========== MODE LOCAL ==========
function initLocalGame() {
    gameMode = 'local';
    currentGameId = null;
    isMyTurn = true;
    document.getElementById('onlinePanel').classList.add('hidden');
    document.getElementById('modeDisplay').textContent = 'Local';
    document.getElementById('sudPlayerName').textContent = 'Joueur 2';
    initBoard();
}

// ========== MODE ONLINE ==========
function initOnlineGame() {
    gameMode = 'online';
    document.getElementById('onlinePanel').classList.remove('hidden');
    document.getElementById('modeDisplay').textContent = 'En ligne';
}

async function createOnlineGame() {
    if (!currentPlayer) return;
    
    try {
        const response = await fetch('/api/create_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player_id: currentPlayer.id,
                player_name: currentPlayer.display_name
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGameId = data.game_id;
            currentPlayerColor = data.player_color;
            isMyTurn = true;
            board = data.board;
            currentTurn = data.current_turn;
            nordScore = data.nord_score;
            sudScore = data.sud_score;
            
            document.getElementById('gameCodeDisplay').innerHTML = `📌 Code: <strong>${currentGameId}</strong>`;
            document.getElementById('onlineGameStatus').innerHTML = '✅ Partie créée - En attente d\'un adversaire';
            document.getElementById('sudPlayerName').textContent = 'En attente...';
            
            updateUI();
            
            if (socket) {
                socket.emit('join_game', currentGameId);
            }
            
            startPolling();
        } else {
            showMessage(data.error, '❌', 'Erreur');
        }
    } catch (error) {
        showMessage('Erreur de connexion', '❌', 'Erreur');
    }
}

async function joinOnlineGame() {
    const gameCode = document.getElementById('gameCodeInput').value.toUpperCase();
    if (!gameCode) {
        showMessage('Entrez un code de partie', '⚠️', 'Attention');
        return;
    }
    if (!currentPlayer) return;
    
    try {
        const response = await fetch('/api/join_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: gameCode,
                player_id: currentPlayer.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGameId = gameCode;
            currentPlayerColor = data.player_color;
            isMyTurn = (data.current_turn === currentPlayerColor);
            board = data.board;
            currentTurn = data.current_turn;
            nordScore = data.nord_score;
            sudScore = data.sud_score;
            
            document.getElementById('gameCodeDisplay').innerHTML = `📌 Partie: ${currentGameId}`;
            document.getElementById('onlineGameStatus').innerHTML = '✅ Connecté - Partie en cours';
            
            updateUI();
            
            if (socket) {
                socket.emit('join_game', currentGameId);
            }
            
            startPolling();
        } else {
            showMessage(data.error, '❌', 'Erreur');
        }
    } catch (error) {
        showMessage('Erreur de connexion', '❌', 'Erreur');
    }
}

async function makeOnlineMove(hole) {
    if (!currentGameId || !currentPlayer) return false;
    if (!isMyTurn) {
        showMessage('Ce n\'est pas votre tour', '⏳', 'Attention');
        return false;
    }
    
    try {
        const response = await fetch('/api/make_move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: currentGameId,
                hole: hole,
                player_id: currentPlayer.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            board = data.board;
            currentTurn = data.current_turn;
            nordScore = data.nord_score;
            sudScore = data.sud_score;
            isMyTurn = (currentTurn === currentPlayerColor);
            lastCapture = data.captured;
            
            addToHistory(`${currentPlayerColor === 'NORD' ? 'SUD' : 'NORD'} joue case ${(hole % 7) + 1}, capture ${data.captured}`);
            updateUI();
            
            if (data.winner) {
                showMessage(`Victoire du ${data.winner} !`, '🏆', 'FIN DE LA PARTIE');
                if (pollingInterval) clearInterval(pollingInterval);
            }
            
            if (socket) {
                socket.emit('game_update', {
                    game_id: currentGameId,
                    board: board,
                    current_turn: currentTurn,
                    nord_score: nordScore,
                    sud_score: sudScore
                });
            }
            
            return true;
        } else {
            showMessage(data.error, '❌', 'Erreur');
            return false;
        }
    } catch (error) {
        showMessage('Erreur de connexion', '❌', 'Erreur');
        return false;
    }
}

async function resetOnlineGame() {
    if (!currentGameId) return;
    
    try {
        const response = await fetch('/api/reset_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: currentGameId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            board = data.board;
            currentTurn = data.current_turn;
            nordScore = data.nord_score;
            sudScore = data.sud_score;
            isMyTurn = (currentTurn === currentPlayerColor);
            history = [];
            updateUI();
            showMessage('Nouvelle partie !', '🔄', 'Reset');
            
            if (socket) {
                socket.emit('game_update', {
                    game_id: currentGameId,
                    board: board,
                    current_turn: currentTurn,
                    nord_score: nordScore,
                    sud_score: sudScore
                });
            }
        }
    } catch (error) {
        showMessage('Erreur lors du reset', '❌', 'Erreur');
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!currentGameId) return;
        
        try {
            const response = await fetch(`/api/get_game?game_id=${currentGameId}`);
            const data = await response.json();
            
            if (data.success && data.game) {
                const game = data.game;
                
                if (JSON.stringify(board) !== JSON.stringify(game.board)) {
                    board = game.board;
                    currentTurn = game.current_turn;
                    nordScore = game.nord_score;
                    sudScore = game.sud_score;
                    isMyTurn = (currentTurn === currentPlayerColor);
                    updateUI();
                }
                
                if (data.history && data.history.length > 0) {
                    const newHistory = data.history.map(m => 
                        `${m.player} joue case ${(m.hole % 7) + 1}, capture ${m.captured}`
                    );
                    if (JSON.stringify(history) !== JSON.stringify(newHistory)) {
                        history = newHistory;
                        updateHistoryDisplay();
                    }
                }
                
                if (game.status === 'finished') {
                    if (pollingInterval) clearInterval(pollingInterval);
                    showMessage(`Victoire du ${game.winner} !`, '🏆', 'FIN DE LA PARTIE');
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 2000);
}

// ========== GESTION DES CLICS ==========
document.querySelectorAll('.hole').forEach(hole => {
    hole.addEventListener('click', () => {
        const holeIndex = parseInt(hole.dataset.hole);
        if (isNaN(holeIndex)) return;
        
        if (gameMode === 'local') {
            const result = executeMove(holeIndex, currentTurn);
            if (result.success) {
                updateUI();
                if (!result.gameOver) highlightValidMoves();
            } else if (result.message) {
                showMessage(result.message, '⚠️', 'Coup invalide');
            }
        } else if (gameMode === 'online') {
            makeOnlineMove(holeIndex);
        }
    });
});

// ========== BOUTONS ==========
document.getElementById('localModeBtn').addEventListener('click', () => {
    if (pollingInterval) clearInterval(pollingInterval);
    initLocalGame();
    document.getElementById('localModeBtn').classList.add('primary');
    document.getElementById('localModeBtn').classList.remove('secondary');
    document.getElementById('onlineModeBtn').classList.add('secondary');
    document.getElementById('onlineModeBtn').classList.remove('primary');
});

document.getElementById('onlineModeBtn').addEventListener('click', () => {
    initOnlineGame();
    document.getElementById('onlineModeBtn').classList.add('primary');
    document.getElementById('onlineModeBtn').classList.remove('secondary');
    document.getElementById('localModeBtn').classList.add('secondary');
    document.getElementById('localModeBtn').classList.remove('primary');
});

document.getElementById('createOnlineGameBtn').addEventListener('click', createOnlineGame);
document.getElementById('joinOnlineGameBtn').addEventListener('click', joinOnlineGame);
document.getElementById('resetGameBtn').addEventListener('click', () => {
    if (gameMode === 'local') {
    initLocalGame();
    } else {
        resetOnlineGame();
    }
});

document.getElementById('rulesBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.remove('hidden');
});

document.getElementById('statsBtn').addEventListener('click', () => {
    showMessage(`Statistiques de ${currentPlayer?.display_name || 'Joueur'}\n\nTotal parties: --\nVictoires: --`, '📊', 'Statistiques');
});

document.getElementById('rulesCloseBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.add('hidden');
});

document.getElementById('modalCloseBtn').addEventListener('click', () => {
    document.getElementById('messageModal').classList.add('hidden');
});
function showMessage(message, icon, title) {
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('messageModal').classList.remove('hidden');
}
