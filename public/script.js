// État du jeu
let board = Array(5).fill().map(() => Array(5).fill(null));
let currentTurn = 'B'; // 'B' pour Blanc, 'N' pour Noir
let selectedPiece = null;
let gameMode = 'local'; // 'local' ou 'online'
let socket = null;
let gameId = null;
let playerColor = null;
let isMyTurn = false;

// Configuration du canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cellSize = canvas.width / 5;

// Initialisation du plateau
function initBoard() {
    board = Array(5).fill().map(() => Array(5).fill(null));
    
    // Blancs (haut)
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) {
            board[i][j] = 'B';
        }
    }
    board[2][0] = 'B';
    board[2][4] = 'B';
    
    // Noirs (bas)
    for (let i = 3; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            board[i][j] = 'N';
        }
    }
}

// Dessiner le plateau
function drawBoard() {
    // Fond du plateau
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const x = j * cellSize;
            const y = i * cellSize;
            
            // Case
            ctx.fillStyle = (i + j) % 2 === 0 ? '#f0d9b5' : '#b58863';
            ctx.fillRect(x, y, cellSize, cellSize);
            
            // Bordure
            ctx.strokeStyle = '#8b5a2b';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellSize, cellSize);
            
            // Dessiner le pion s'il y en a un
            if (board[i][j]) {
                const centerX = x + cellSize/2;
                const centerY = y + cellSize/2;
                const radius = cellSize * 0.35;
                
                // Ombre
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                
                // Dégradé pour le pion
                const gradient = ctx.createRadialGradient(centerX - 5, centerY - 5, 5, centerX, centerY, radius);
                if (board[i][j] === 'B') {
                    gradient.addColorStop(0, '#ffffff');
                    gradient.addColorStop(1, '#cccccc');
                } else {
                    gradient.addColorStop(0, '#444444');
                    gradient.addColorStop(1, '#111111');
                }
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
                
                // Contour
                ctx.shadowBlur = 0;
                ctx.strokeStyle = board[i][j] === 'B' ? '#999' : '#333';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Surbrillance si sélectionné
                if (selectedPiece && selectedPiece.x === i && selectedPiece.y === j) {
                    ctx.strokeStyle = '#ffd700';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 5, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
        }
    }
    
    // Mettre à jour les scores
    updateScores();
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
    const turnPiece = document.querySelector('.turn-piece');
    if (currentTurn === 'B') {
        turnPiece.className = 'turn-piece white-turn';
    } else {
        turnPiece.className = 'turn-piece black-turn';
    }
}

function getPieceColor(x, y) {
    return board[x][y];
}

function isValidMove(fromX, fromY, toX, toY, color) {
    // Vérifier case destination vide
    if (board[toX][toY] !== null) return false;
    
    // Vérifier déplacement adjacent
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    
    if (dx + dy === 1) return true;
    
    // Vérifier capture par saut
    if ((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) {
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const midPiece = board[midX][midY];
        if (midPiece && midPiece !== color) {
            return true;
        }
    }
    
    return false;
}

function executeMove(fromX, fromY, toX, toY) {
    const piece = board[fromX][fromY];
    if (!piece || piece !== currentTurn) return false;
    
    if (!isValidMove(fromX, fromY, toX, toY, currentTurn)) return false;
    
    // Effectuer le déplacement
    board[toX][toY] = piece;
    board[fromX][fromY] = null;
    
    // Vérifier capture
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
        const midX = fromX + dx/2;
        const midY = fromY + dy/2;
        if (midX >= 0 && midX <= 4 && midY >= 0 && midY <= 4) {
            if (board[midX][midY] && board[midX][midY] !== piece) {
                board[midX][midY] = null;
                showMessage(`Capture !`, `success`);
            }
        }
    }
    
    // Vérifier alignement de 3
    if (checkAlignment(toX, toY, piece)) {
        showMessage(`Alignement de 3 pions ! Vous pouvez retirer un pion adverse.`, 'info');
        // Dans une version complète, ici on permettrait de retirer un pion
    }
    
    return true;
}

function checkAlignment(x, y, color) {
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

function checkVictory() {
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

function switchTurn() {
    currentTurn = currentTurn === 'B' ? 'N' : 'B';
    drawBoard();
    
    const winner = checkVictory();
    if (winner) {
        const winnerName = winner === 'B' ? 'Blancs' : 'Noirs';
        showMessage(`Victoire ! Les ${winnerName} gagnent la partie !`, 'victory');
    }
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const col = Math.floor(mouseX / cellSize);
    const row = Math.floor(mouseY / cellSize);
    
    if (row >= 0 && row < 5 && col >= 0 && col < 5) {
        if (selectedPiece === null) {
            // Sélectionner un pion
            if (board[row][col] === currentTurn) {
                selectedPiece = { x: row, y: col };
                drawBoard();
            }
        } else {
            // Déplacer le pion
            if (executeMove(selectedPiece.x, selectedPiece.y, row, col)) {
                if (gameMode === 'online' && socket && gameId) {
                    socket.emit('makeMove', {
                        gameId: gameId,
                        fromX: selectedPiece.x,
                        fromY: selectedPiece.y,
                        toX: row,
                        toY: col
                    });
                } else {
                    switchTurn();
                }
            }
            selectedPiece = null;
            drawBoard();
        }
    }
}

function resetGame() {
    initBoard();
    currentTurn = 'B';
    selectedPiece = null;
    drawBoard();
    showMessage('Nouvelle partie !', 'info');
}

function showMessage(message, type) {
    const modal = document.getElementById('messageModal');
    const title = document.getElementById('modalTitle');
    const msg = document.getElementById('modalMessage');
    
    if (type === 'victory') {
        title.textContent = '🏆 Victoire ! 🏆';
        title.style.color = '#f39c12';
    } else if (type === 'success') {
        title.textContent = 'Succès';
        title.style.color = '#27ae60';
    } else {
        title.textContent = 'Information';
        title.style.color = '#3498db';
    }
    
    msg.textContent = message;
    modal.classList.remove('hidden');
}

// Mode Online
function initOnlineMode() {
    if (socket) {
        socket.disconnect();
    }
    
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connecté au serveur');
        document.getElementById('gameStatus').textContent = 'Connecté au serveur';
    });
    
    socket.on('gameCreated', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').textContent = `Partie créée ! Code: ${gameId}`;
        showMessage(`Votre code de partie: ${gameId}. Partagez-le avec un ami !`, 'success');
        resetGame();
    });
    
    socket.on('gameJoined', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').textContent = `Connecté à la partie ${gameId}`;
        showMessage(`Vous avez rejoint la partie ! Vous êtes ${playerColor === 'B' ? 'Blanc' : 'Noir'}`, 'success');
    });
    
    socket.on('gameStarted', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        playerColor = data.colors[socket.id];
        isMyTurn = (currentTurn === playerColor);
        drawBoard();
        document.getElementById('gameStatus').textContent = 'Partie en cours...';
    });
    
    socket.on('moveMade', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        isMyTurn = (currentTurn === playerColor);
        drawBoard();
    });
    
    socket.on('moveError', (message) => {
        showMessage(message, 'error');
    });
    
    socket.on('gameOver', (data) => {
        const winner = data.winner === 'B' ? 'Blancs' : 'Noirs';
        showMessage(`Fin de partie ! Victoire des ${winner}`, 'victory');
        document.getElementById('gameStatus').textContent = `Partie terminée - Victoire ${winner}`;
    });
    
    socket.on('playerDisconnected', (message) => {
        showMessage(message, 'error');
        document.getElementById('gameStatus').textContent = 'Joueur déconnecté';
    });
}

// Event Listeners
canvas.addEventListener('click', handleCanvasClick);

document.getElementById('localModeBtn').addEventListener('click', () => {
    gameMode = 'local';
    document.getElementById('localModeBtn').classList.add('active');
    document.getElementById('onlineModeBtn').classList.remove('active');
    document.getElementById('onlinePanel').classList.add('hidden');
    if (socket) socket.disconnect();
    resetGame();
});

document.getElementById('onlineModeBtn').addEventListener('click', () => {
    gameMode = 'online';
    document.getElementById('onlineModeBtn').classList.add('active');
    document.getElementById('localModeBtn').classList.remove('active');
    document.getElementById('onlinePanel').classList.remove('hidden');
    initOnlineMode();
    resetGame();
});

document.getElementById('createGameBtn').addEventListener('click', () => {
    if (socket) socket.emit('createGame');
});

document.getElementById('joinGameBtn').addEventListener('click', () => {
    const gameIdInput = document.getElementById('gameIdInput').value.toUpperCase();
    if (gameIdInput && socket) socket.emit('joinGame', gameIdInput);
});

document.getElementById('resetGameBtn').addEventListener('click', () => {
    resetGame();
});

document.getElementById('rulesBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.remove('hidden');
});

document.getElementById('modalCloseBtn').addEventListener('click', () => {
    document.getElementById('messageModal').classList.add('hidden');
});

document.getElementById('rulesCloseBtn').addEventListener('click', () => {
    document.getElementById('rulesModal').classList.add('hidden');
});

// Initialisation
initBoard();
drawBoard();