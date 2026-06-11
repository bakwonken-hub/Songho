// ========== ÉTAT DU JEU ==========
let board = Array(12).fill(4);
let currentTurn = 'N'; // 'N' pour Nord, 'S' pour Sud
let gameMode = 'local';
let gameOver = false;
let selectedHole = null;
let nordScore = 0;
let sudScore = 0;
let history = [];

// Socket.io
let socket = null;
let gameId = null;
let playerColor = null;
let isMyTurn = false;

// ========== INITIALISATION ==========
function initBoard() {
    board = Array(12).fill(4);
    currentTurn = 'N';
    nordScore = 0;
    sudScore = 0;
    history = [];
    gameOver = false;
    selectedHole = null;
    updateUI();
    updateHistoryDisplay();
}

function updateUI() {
    // Mettre à jour l'affichage des graines
    for (let i = 0; i < 12; i++) {
        const seedElem = document.getElementById(`seed-${i}`);
        if (seedElem) {
            seedElem.textContent = board[i];
            // Animation si changement
            seedElem.classList.add('seed-animate');
            setTimeout(() => seedElem.classList.remove('seed-animate'), 300);
        }
    }
    
    // Mettre à jour les scores
    document.getElementById('nordScore').textContent = nordScore;
    document.getElementById('sudScore').textContent = sudScore;
    
    // Mettre à jour le tour
    const turnPlayerElem = document.getElementById('turnPlayer');
    turnPlayerElem.textContent = currentTurn === 'N' ? 'NORD' : 'SUD';
    turnPlayerElem.style.color = currentTurn === 'N' ? '#ffd700' : '#ff8c00';
    
    // Mettre à jour les statistiques
    const nordTotal = board.slice(0, 6).reduce((a, b) => a + b, 0);
    const sudTotal = board.slice(6, 12).reduce((a, b) => a + b, 0);
    
    if (playerColor) {
        document.getElementById('yourCamp').textContent = playerColor === 'N' ? 'NORD' : 'SUD';
        document.getElementById('yourSeeds').textContent = playerColor === 'N' ? nordTotal + nordScore : sudTotal + sudScore;
        document.getElementById('opponentSeeds').textContent = playerColor === 'N' ? sudTotal + sudScore : nordTotal + nordScore;
    } else {
        document.getElementById('yourSeeds').textContent = nordTotal + nordScore;
        document.getElementById('opponentSeeds').textContent = sudTotal + sudScore;
    }
    
    // Mettre en évidence les trous jouables
    highlightValidMoves();
}

function highlightValidMoves() {
    // Enlever toutes les classes active-turn
    document.querySelectorAll('.hole').forEach(h => h.classList.remove('active-turn'));
    
    if (gameOver) return;
    if (gameMode === 'online' && (!isMyTurn || gameOver)) return;
    
    const start = currentTurn === 'N' ? 0 : 6;
    const end = currentTurn === 'N' ? 6 : 12;
    
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
    
    historyList.innerHTML = history.map((entry, idx) => `
        <div class="history-item">
            <strong>${history.length - idx}. </strong>${entry}
        </div>
    `).join('');
    
    const lastMoveElem = document.getElementById('lastMoveContent');
    if (history.length > 0) {
        lastMoveElem.textContent = history[0];
    }
}

function addToHistory(moveDesc) {
    history.unshift(moveDesc);
    if (history.length > 20) history.pop();
    updateHistoryDisplay();
}

// ========== LOGIQUE DE JEU ==========
function getValidMoves(player) {
    const start = player === 'N' ? 0 : 6;
    const end = player === 'N' ? 6 : 12;
    const moves = [];
    for (let i = start; i < end; i++) {
        if (board[i] > 0) moves.push(i);
    }
    return moves;
}

function executeMove(hole, player) {
    if (gameOver) return { success: false, message: "Partie terminée" };
    if (player !== currentTurn) return { success: false, message: "Ce n'est pas votre tour" };
    
    const isValidHole = (player === 'N' && hole >= 0 && hole < 6) ||
                        (player === 'S' && hole >= 6 && hole < 12);
    
    if (!isValidHole) return { success: false, message: "Trou invalide" };
    if (board[hole] === 0) return { success: false, message: "Ce trou est vide" };
    
    let seeds = board[hole];
    let newBoard = [...board];
    newBoard[hole] = 0;
    
    let currentHole = hole;
    
    // Distribution
    while (seeds > 0) {
        currentHole = (currentHole + 1) % 12;
        if (currentHole === hole && newBoard[hole] === 0) continue;
        newBoard[currentHole]++;
        seeds--;
    }
    
    // Capture
    let captured = 0;
    let lastHole = currentHole;
    const opponentStart = player === 'N' ? 6 : 0;
    const opponentEnd = player === 'N' ? 12 : 6;
    
    while (lastHole >= opponentStart && lastHole < opponentEnd && 
           (newBoard[lastHole] === 2 || newBoard[lastHole] === 3)) {
        captured += newBoard[lastHole];
        newBoard[lastHole] = 0;
        lastHole--;
    }
    
    board = newBoard;
    
    // Mettre à jour les scores
    if (player === 'N') {
        nordScore += captured;
    } else {
        sudScore += captured;
    }
    
    const moveDesc = `${player === 'N' ? 'Nord' : 'Sud'} joue trou ${(hole % 6) + 1}, capture ${captured}`;
    addToHistory(moveDesc);
    
    // Vérifier victoire
    const nordTotal = board.slice(0, 6).reduce((a, b) => a + b, 0);
    const sudTotal = board.slice(6, 12).reduce((a, b) => a + b, 0);
    
    if (nordTotal === 0) {
        gameOver = true;
        return { success: true, message: "Victoire Sud !", gameOver: true, winner: 'S' };
    }
    if (sudTotal === 0) {
        gameOver = true;
        return { success: true, message: "Victoire Nord !", gameOver: true, winner: 'N' };
    }
    
    // Vérifier si l'adversaire peut jouer
    const nextPlayer = player === 'N' ? 'S' : 'N';
    const validMoves = getValidMoves(nextPlayer);
    if (validMoves.length === 0) {
        gameOver = true;
        const winner = player === 'N' ? 'N' : 'S';
        return { success: true, message: `Victoire ${winner === 'N' ? 'Nord' : 'Sud'} !`, gameOver: true, winner };
    }
    
    currentTurn = nextPlayer;
    
    return { success: true, captured, moveDesc };
}

function resetGame() {
    board = Array(12).fill(4);
    currentTurn = 'N';
    nordScore = 0;
    sudScore = 0;
    history = [];
    gameOver = false;
    selectedHole = null;
    updateUI();
    updateHistoryDisplay();
    highlightValidMoves();
    
    if (gameMode === 'online' && socket && gameId) {
        socket.emit('resetGame', gameId);
    }
}

// ========== GESTION DES CLICS ==========
function handleHoleClick(hole) {
    if (gameMode === 'online' && (!isMyTurn || gameOver)) {
        if (!isMyTurn) addTemporaryMessage("⏳ Attendez votre tour", "error");
        return;
    }
    
    const player = currentTurn;
    const result = executeMove(hole, player);
    
    if (result.success) {
        updateUI();
        highlightValidMoves();
        
        if (result.gameOver) {
            showModal(result.winner === 'N' ? '🏆 VICTOIRE NORD' : '🏆 VICTOIRE SUD', result.message);
        }
        
        if (gameMode === 'online' && socket && gameId) {
            socket.emit('makeMove', { gameId, hole });
        }
    } else {
        addTemporaryMessage(result.message, "error");
    }
}

function addTemporaryMessage(msg, type) {
    const turnIndicator = document.getElementById('turnIndicator');
    const originalHTML = turnIndicator.innerHTML;
    turnIndicator.innerHTML = `
        <span class="turn-label">${type === 'error' ? '❌ ERREUR' : 'ℹ️ INFO'}</span>
        <div class="turn-player" style="color: #ff5555; font-size: 0.8rem;">${msg}</div>
    `;
    setTimeout(() => {
        turnIndicator.innerHTML = originalHTML;
    }, 2000);
}

function showModal(title, message) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('messageModal').classList.remove('hidden');
}

function hideModal() {
    document.getElementById('messageModal').classList.add('hidden');
    document.getElementById('rulesModal').classList.add('hidden');
}

function showRules() {
    document.getElementById('rulesModal').classList.remove('hidden');
}

// ========== MODES DE JEU ==========
function initLocalMode() {
    gameMode = 'local';
    if (socket) socket.disconnect();
    document.getElementById('onlinePanel').classList.add('hidden');
    document.getElementById('connectionText').textContent = 'MODE LOCAL';
    document.getElementById('connectionDot').style.background = '#ffd700';
    resetGame();
}

function initOnlineMode() {
    gameMode = 'online';
    if (socket) socket.disconnect();
    
    socket = io();
    document.getElementById('connectionText').textContent = 'CONNEXION...';
    document.getElementById('connectionDot').style.background = '#ffaa00';
    
    socket.on('connect', () => {
        document.getElementById('connectionText').textContent = 'EN LIGNE';
        document.getElementById('connectionDot').style.background = '#00ff88';
    });
    
    socket.on('gameCreated', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'N');
        document.getElementById('gameCodeDisplay').innerHTML = `Code: <strong>${gameId}</strong>`;
        document.getElementById('gameStatus').innerHTML = '✅ Partie créée';
        resetGame();
    });
    
    socket.on('gameJoined', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'N');
        document.getElementById('gameCodeDisplay').innerHTML = `Partie: ${gameId}`;
        document.getElementById('gameStatus').innerHTML = '✅ Connecté';
        showModal('Partie rejointe', `Vous êtes ${playerColor === 'N' ? 'NORD' : 'SUD'}`);
        resetGame();
    });
    
    socket.on('gameStarted', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        playerColor = data.colors[socket.id];
        nordScore = data.nordScore;
        sudScore = data.sudScore;
        history = data.history || [];
        isMyTurn = (currentTurn === playerColor);
        gameOver = false;
        updateUI();
        updateHistoryDisplay();
        highlightValidMoves();
        document.getElementById('gameStatus').innerHTML = '🎮 Partie en cours';
    });
    
    socket.on('moveMade', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        nordScore = data.nordScore;
        sudScore = data.sudScore;
        history = data.history;
        isMyTurn = (currentTurn === playerColor);
        updateUI();
        updateHistoryDisplay();
        highlightValidMoves();
        
        if (data.captured > 0) {
            addTemporaryMessage(`Capture de ${data.captured} graines !`, "capture");
        }
    });
    
    socket.on('gameOver', (data) => {
        gameOver = true;
        const winnerName = data.winner === 'N' ? 'NORD' : 'SUD';
        showModal('🏆 VICTOIRE', `${winnerName} remporte la partie !`);
        document.getElementById('gameStatus').innerHTML = `🏆 Victoire ${winnerName}`;
    });
    
    socket.on('gameReset', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        nordScore = data.nordScore;
        sudScore = data.sudScore;
        history = data.history;
        gameOver = false;
        isMyTurn = (currentTurn === playerColor);
        updateUI();
        updateHistoryDisplay();
        highlightValidMoves();
    });
    
    socket.on('playerDisconnected', () => {
        addTemporaryMessage("⚠️ Adversaire déconnecté", "error");
        gameOver = true;
        document.getElementById('gameStatus').innerHTML = '⚠️ Adversaire parti';
    });
    
    socket.on('moveError', (msg) => {
        addTemporaryMessage(msg, "error");
    });
    
    socket.on('joinError', (msg) => {
        addTemporaryMessage(msg, "error");
    });
}

// ========== EVENT LISTENERS ==========
document.querySelectorAll('.hole').forEach(hole => {
    hole.addEventListener('click', () => {
        const holeIndex = parseInt(hole.dataset.hole);
        if (!isNaN(holeIndex)) handleHoleClick(holeIndex);
    });
});

document.getElementById('localModeBtn').addEventListener('click', () => {
    document.getElementById('localModeBtn').classList.add('active');
    document.getElementById('onlineModeBtn').classList.remove('active');
    initLocalMode();
});

document.getElementById('onlineModeBtn').addEventListener('click', () => {
    document.getElementById('onlineModeBtn').classList.add('active');
    document.getElementById('localModeBtn').classList.remove('active');
    document.getElementById('onlinePanel').classList.remove('hidden');
    initOnlineMode();
});

document.getElementById('createGameBtn').addEventListener('click', () => {
    if (socket) socket.emit('createGame');
});

document.getElementById('joinGameBtn').addEventListener('click', () => {
    const code = document.getElementById('gameIdInput').value.toUpperCase();
    if (code && socket) socket.emit('joinGame', code);
});

document.getElementById('rulesBtn').addEventListener('click', showRules);
document.getElementById('infoBtn').addEventListener('click', showRules);
document.getElementById('priseBtn').addEventListener('click', () => {
    showModal("Prise spéciale", "Lorsque votre dernière graine tombe dans un trou adverse contenant 2 ou 3 graines, vous les capturez !");
});
document.getElementById('quitBtn').addEventListener('click', () => {
    if (confirm('Voulez-vous vraiment quitter ?')) {
        if (socket) socket.disconnect();
        initLocalMode();
    }
});
document.getElementById('modalCloseBtn').addEventListener('click', hideModal);
document.getElementById('rulesCloseBtn').addEventListener('click', hideModal);

// Initialisation
initBoard();
highlightValidMoves();

// Ajouter un message de bienvenue
addToHistory("Bienvenue ! Les Nord commencent.");
