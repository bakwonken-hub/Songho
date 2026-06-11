// ============================================
// SONGHO - Version Terminal Moderne
// Multijoueur local & en ligne
// ============================================

let board = Array(5).fill().map(() => Array(5).fill(null));
let currentTurn = 'B';
let selectedPiece = null;
let gameMode = 'local';
let gameOver = false;

// Socket.io (online mode)
let socket = null;
let gameId = null;
let playerColor = null;
let isMyTurn = false;

// Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cellSize = canvas.width / 5;

// Correspondance colonnes
const colMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 };
const reverseColMap = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E' };

// ========== INITIALISATION ==========
function initBoard() {
    board = Array(5).fill().map(() => Array(5).fill(null));
    
    // Blancs (NORD)
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) {
            board[i][j] = 'B';
        }
    }
    board[2][0] = 'B';
    board[2][4] = 'B';
    
    // Noirs (SUD)
    for (let i = 3; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            board[i][j] = 'N';
        }
    }
}

function resetGame() {
    initBoard();
    currentTurn = 'B';
    selectedPiece = null;
    gameOver = false;
    drawBoard();
    updateScores();
    addLog('🔄 Nouvelle partie ! Les blancs commencent.', 'system');
    updatePrompt();
}

// ========== AFFICHAGE ==========
function drawBoard() {
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const x = j * cellSize;
            const y = i * cellSize;
            
            // Case
            const isDark = (i + j) % 2 === 1;
            ctx.fillStyle = isDark ? '#2a3a2a' : '#3a4a3a';
            ctx.fillRect(x, y, cellSize, cellSize);
            
            // Bordure néon
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, cellSize, cellSize);
            
            // Numéros de ligne/colonne
            if (j === 0) {
                ctx.font = `bold ${cellSize * 0.25}px 'Share Tech Mono'`;
                ctx.fillStyle = '#5a8a7a';
                ctx.shadowBlur = 0;
                ctx.fillText(`${i+1}`, x + 3, y + cellSize * 0.2);
            }
            if (i === 4) {
                ctx.font = `bold ${cellSize * 0.25}px 'Share Tech Mono'`;
                ctx.fillStyle = '#5a8a7a';
                ctx.fillText(reverseColMap[j], x + cellSize - 12, y + cellSize - 3);
            }
            
            // Pion
            if (board[i][j]) {
                const centerX = x + cellSize/2;
                const centerY = y + cellSize/2;
                const radius = cellSize * 0.32;
                
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.shadowColor = 'rgba(0, 255, 136, 0.3)';
                
                const gradient = ctx.createRadialGradient(centerX - 5, centerY - 5, 5, centerX, centerY, radius);
                if (board[i][j] === 'B') {
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(1, '#ccccdd');
                } else {
                    gradient.addColorStop(0, '#444455');
                    gradient.addColorStop(1, '#111122');
                }
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.shadowBlur = 0;
                ctx.strokeStyle = board[i][j] === 'B' ? '#aaaacc' : '#222233';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                // Effet brillant
                ctx.beginPath();
                ctx.arc(centerX - 3, centerY - 3, radius * 0.2, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fill();
                
                // Sélection
                if (selectedPiece && selectedPiece.x === i && selectedPiece.y === j) {
                    ctx.strokeStyle = '#ffaa44';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 6, 0, 2 * Math.PI);
                    ctx.stroke();
                    
                    // Effet pulsation
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
                    ctx.strokeStyle = 'rgba(255, 170, 68, 0.5)';
                    ctx.stroke();
                }
            }
        }
    }
    
    // Effet de grille lumineuse
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
    }
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
    ctx.stroke();
}

function updateScores() {
    let whiteCount = 0, blackCount = 0;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            if (board[i][j] === 'B') whiteCount++;
            if (board[i][j] === 'N') blackCount++;
        }
    }
    document.getElementById('whiteScore').textContent = whiteCount;
    document.getElementById('blackScore').textContent = blackCount;
    
    // Mettre à jour l'indicateur de tour
    const turnPiece = document.getElementById('turnPiece');
    const turnText = document.getElementById('turnText');
    if (currentTurn === 'B') {
        turnPiece.className = 'turn-piece white-turn';
        turnText.textContent = 'BLANC';
        document.querySelector('.player-north').classList.add('active-turn');
        document.querySelector('.player-south').classList.remove('active-turn');
    } else {
        turnPiece.className = 'turn-piece black-turn';
        turnText.textContent = 'NOIR';
        document.querySelector('.player-south').classList.add('active-turn');
        document.querySelector('.player-north').classList.remove('active-turn');
    }
    
    // Vérifier victoire
    if (whiteCount === 0 && !gameOver) {
        gameOver = true;
        addLog('🏆 VICTOIRE ! Les NOIRS remportent la partie !', 'victory');
        showMessage('Victoire des Noirs !', '🏆', 'NOIRS GAGNENT');
    } else if (blackCount === 0 && !gameOver) {
        gameOver = true;
        addLog('🏆 VICTOIRE ! Les BLANCS remportent la partie !', 'victory');
        showMessage('Victoire des Blancs !', '🏆', 'BLANCS GAGNENT');
    }
}

function updatePrompt() {
    const promptText = document.getElementById('promptText');
    if (gameOver) {
        promptText.textContent = 'partie terminée - [RESET] pour rejouer';
    } else if (selectedPiece) {
        const letter = reverseColMap[selectedPiece.y];
        const num = selectedPiece.x + 1;
        promptText.textContent = `pion sélectionné ${letter}${num} - choisissez une destination`;
    } else {
        promptText.textContent = `sélectionnez un pion ${currentTurn === 'B' ? 'blanc' : 'noir'} (NORD=${currentTurn === 'B' ? '●' : '○'})`;
    }
}

function addLog(message, type = 'move') {
    const logArea = document.getElementById('logArea');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `[${time}] ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
    
    // Limiter l'historique
    while (logArea.children.length > 50) {
        logArea.removeChild(logArea.firstChild);
    }
}

// ========== LOGIQUE DE JEU ==========
function isValidMove(fromX, fromY, toX, toY, color) {
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

function executeMove(fromX, fromY, toX, toY) {
    const piece = board[fromX][fromY];
    if (!piece || piece !== currentTurn) {
        addLog(`❌ Ce n'est pas votre pion !`, 'error');
        return false;
    }
    if (gameOver) {
        addLog(`❌ Partie terminée !`, 'error');
        return false;
    }
    
    if (!isValidMove(fromX, fromY, toX, toY, currentTurn)) {
        addLog(`❌ Déplacement invalide !`, 'error');
        return false;
    }
    
    const fromLetter = reverseColMap[fromY];
    const fromNum = fromX + 1;
    const toLetter = reverseColMap[toY];
    const toNum = toX + 1;
    
    // Sauvegarder l'état pour capture
    const wasCapture = (Math.abs(toX - fromX) === 2 || Math.abs(toY - fromY) === 2);
    let capturedPiece = null;
    
    if (wasCapture) {
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        capturedPiece = board[midX][midY];
    }
    
    // Déplacer
    board[toX][toY] = piece;
    board[fromX][fromY] = null;
    
    // Capture
    if (wasCapture && capturedPiece) {
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        board[midX][midY] = null;
        addLog(`⚔️ CAPTURE ! ${fromLetter}${fromNum} → ${toLetter}${toNum} (pion ${capturedPiece === 'B' ? 'blanc' : 'noir'} éliminé)`, 'capture');
    } else {
        addLog(`♟️ Déplacement : ${fromLetter}${fromNum} → ${toLetter}${toNum}`, 'move');
    }
    
    // Changement de tour
    currentTurn = currentTurn === 'B' ? 'N' : 'B';
    selectedPiece = null;
    
    drawBoard();
    updateScores();
    updatePrompt();
    
    return true;
}

// ========== GESTION DES CLICS ==========
function handleCanvasClick(e) {
    if (gameMode === 'online' && (!isMyTurn || gameOver)) {
        if (!isMyTurn) addLog(`⏳ Attendez votre tour...`, 'system');
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const col = Math.floor(mouseX / cellSize);
    const row = Math.floor(mouseY / cellSize);
    
    if (row >= 0 && row < 5 && col >= 0 && col < 5) {
        if (selectedPiece === null) {
            if (board[row][col] === currentTurn && !gameOver) {
                selectedPiece = { x: row, y: col };
                drawBoard();
                updatePrompt();
                addLog(`🎯 Pion sélectionné : ${reverseColMap[col]}${row+1}`, 'system');
            } else if (board[row][col] !== null && board[row][col] !== currentTurn && !gameOver) {
                addLog(`❌ Ce n'est pas votre pion !`, 'error');
            }
        } else {
            if (executeMove(selectedPiece.x, selectedPiece.y, row, col)) {
                if (gameMode === 'online' && socket && gameId) {
                    socket.emit('makeMove', {
                        gameId: gameId,
                        fromX: selectedPiece.x,
                        fromY: selectedPiece.y,
                        toX: row,
                        toY: col
                    });
                }
            }
            selectedPiece = null;
            drawBoard();
            updatePrompt();
        }
    }
}

// ========== MODE LOCAL ==========
function initLocalMode() {
    gameMode = 'local';
    if (socket) socket.disconnect();
    document.getElementById('connectionStatus').textContent = '● LOCAL';
    document.getElementById('onlinePanel').classList.add('hidden');
    resetGame();
    addLog('🟢 Mode local activé - 2 joueurs sur le même écran', 'system');
}

// ========== MODE ONLINE ==========
function initOnlineMode() {
    gameMode = 'online';
    if (socket) socket.disconnect();
    
    socket = io();
    document.getElementById('connectionStatus').textContent = '🟡 CONNEXION';
    
    socket.on('connect', () => {
        document.getElementById('connectionStatus').textContent = '● EN LIGNE';
        addLog('🌐 Connecté au serveur', 'system');
    });
    
    socket.on('gameCreated', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').innerHTML = `✅ Partie créée ! Code: <strong>${gameId}</strong>`;
        addLog(`🎮 Partie créée - Code: ${gameId} - Vous êtes ${playerColor === 'B' ? 'BLANC' : 'NOIR'}`, 'system');
        resetGame();
    });
    
    socket.on('gameJoined', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').innerHTML = `✅ Connecté à la partie ${gameId}`;
        addLog(`🔗 Rejoint la partie ${gameId} - Vous êtes ${playerColor === 'B' ? 'BLANC' : 'NOIR'}`, 'system');
        showMessage(`Vous avez rejoint la partie !`, '🎮', `${playerColor === 'B' ? 'BLANC' : 'NOIR'} - Attendez l'adversaire`);
    });
    
    socket.on('gameStarted', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        playerColor = data.colors[socket.id];
        isMyTurn = (currentTurn === playerColor);
        gameOver = false;
        drawBoard();
        updateScores();
        document.getElementById('gameStatus').innerHTML = `🎲 Partie en cours ! ${isMyTurn ? 'C\'est à vous' : 'Attendez votre tour'}`;
        addLog(`🎯 Partie démarrée ! ${playerColor === 'B' ? 'Blancs' : 'Noirs'} - ${isMyTurn ? 'C\'est à vous de jouer !' : 'Attendez l\'adversaire'}`, 'system');
    });
    
    socket.on('moveMade', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        isMyTurn = (currentTurn === playerColor);
        drawBoard();
        updateScores();
        if (data.captured) addLog(`⚔️ L'adversaire a capturé un pion !`, 'capture');
        addLog(`👥 Tour ${currentTurn === 'B' ? 'blanc' : 'noir'}`, 'system');
        updatePrompt();
    });
    
    socket.on('moveError', (message) => {
        addLog(`❌ ${message}`, 'error');
    });
    
    socket.on('gameOver', (data) => {
        const winner = data.winner === 'B' ? 'Blancs' : 'Noirs';
        gameOver = true;
        addLog(`🏆 VICTOIRE ! ${winner} remportent la partie !`, 'victory');
        document.getElementById('gameStatus').innerHTML = `🏆 Partie terminée - Victoire ${winner}`;
        showMessage(`Victoire des ${winner} !`, '🏆', 'FIN DE LA PARTIE');
    });
    
    socket.on('gameReset', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        gameOver = false;
        isMyTurn = (currentTurn === playerColor);
        drawBoard();
        updateScores();
        addLog(`🔄 L'adversaire a relancé la partie`, 'system');
    });
    
    socket.on('playerDisconnected', () => {
        addLog(`⚠️ L'adversaire a quitté la partie`, 'error');
        document.getElementById('gameStatus').innerHTML = `⚠️ Adversaire déconnecté`;
        gameOver = true;
    });
}

// ========== UI & MODALS ==========
function showMessage(message, icon = 'ℹ️', title = 'Information') {
    const modal = document.getElementById('messageModal');
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    modal.classList.remove('hidden');
}

function showRules() {
    document.getElementById('rulesModal').classList.remove('hidden');
}

// ========== EVENT LISTENERS ==========
canvas.addEventListener('click', handleCanvasClick);

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

document.getElementById('resetGameBtn').addEventListener('click', () => {
    if (gameMode === 'online' && socket && gameId) {
        socket.emit('resetGame', gameId);
    }
    resetGame();
});

document.getElementById('rulesBtn').addEventListener('click', showRules);

document.getElementById('modalCloseBtn').addEventListener('click', () => {
    document.getElementById('messageModal').classList.add('hidden');
});

document.getElementById('rulesCloseBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.add('hidden');
});

// Initialisation
initBoard();
drawBoard();
updateScores();
addLog('🟢 SYSTEME: Songho v2.0 prêt. Les blancs commencent.', 'system');
