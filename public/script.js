import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ========== ÉTAT DU JEU ==========
let board = Array(5).fill().map(() => Array(5).fill(null));
let currentTurn = 'B';
let selectedPiece = null;
let gameMode = 'local';
let gameOver = false;

// Socket.io
let socket = null;
let gameId = null;
let playerColor = null;
let isMyTurn = false;

// ========== THREE.JS ==========
let scene, camera, renderer, labelRenderer, controls;
let pieces = {}; // Stockage des pièces 3D
let squares = [];
let raycaster;
let mouse;

// Couleurs
const colors = {
    boardLight: 0xc9a96e,
    boardDark: 0xdeb887,
    gold: 0xffd700,
    whitePiece: 0xeeeeee,
    blackPiece: 0x222222
};

function init3D() {
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.008);
    
    // Caméra
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 12, 8);
    camera.lookAt(2, 0, 2);
    
    // Rendu
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // CSS2DRenderer pour les textes
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.left = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);
    
    // Contrôles
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.zoomSpeed = 1.2;
    controls.target.set(2, 0, 2);
    
    // Raycaster pour la sélection
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Éclairage
    setupLights();
    
    // Création du plateau
    createBoard();
    
    // Animation
    animate();
    
    // Événements
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onCanvasClick);
}

function setupLights() {
    // Lumière ambiante
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    
    // Lumière principale directionnelle
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.receiveShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    
    // Remplissage
    const fillLight = new THREE.PointLight(0x4466cc, 0.3);
    fillLight.position.set(-2, 3, 4);
    scene.add(fillLight);
    
    // Lumière chaude venant du bas
    const warmLight = new THREE.PointLight(0xffaa66, 0.4);
    warmLight.position.set(0, -1, 0);
    scene.add(warmLight);
    
    // Lumière d'accentuation
    const accentLight = new THREE.PointLight(0xff6600, 0.5);
    accentLight.position.set(3, 5, 2);
    scene.add(accentLight);
    
    // Particules ambiantes (étoiles)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        starPositions[i*3] = (Math.random() - 0.5) * 200;
        starPositions[i*3+1] = (Math.random() - 0.5) * 50 + 10;
        starPositions[i*3+2] = (Math.random() - 0.5) * 100 - 50;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffd700, size: 0.05, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

function createBoard() {
    const boardGroup = new THREE.Group();
    
    // Plateau principal
    const boardBase = new THREE.BoxGeometry(5.8, 0.2, 5.8);
    const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.4, metalness: 0.1 });
    const basePlate = new THREE.Mesh(boardBase, boardMaterial);
    basePlate.position.set(2, -0.3, 2);
    basePlate.receiveShadow = true;
    boardGroup.add(basePlate);
    
    // Cases
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const isDark = (i + j) % 2 === 1;
            const squareMat = new THREE.MeshStandardMaterial({
                color: isDark ? 0xb58863 : 0xf0d9b5,
                roughness: 0.3,
                metalness: 0.1,
                emissive: isDark ? 0x000000 : 0x221100,
                emissiveIntensity: 0.05
            });
            
            const square = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.95), squareMat);
            square.position.set(j + 0.5, -0.2, i + 0.5);
            square.userData = { row: i, col: j };
            square.castShadow = true;
            square.receiveShadow = true;
            boardGroup.add(square);
            squares.push(square);
            
            // Bordure dorée
            const borderMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
            const border = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.05), borderMat);
            border.position.set(j + 0.5, -0.15, i + 0.5);
            boardGroup.add(border);
        }
    }
    
    // Bordures du plateau
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 });
    const borderWidth = 0.1;
    const borderHeight = 0.15;
    
    const borders = [
        { pos: [2, -0.15, -0.2], size: [6, borderHeight, borderWidth] },
        { pos: [2, -0.15, 5.2], size: [6, borderHeight, borderWidth] },
        { pos: [-0.2, -0.15, 2.5], size: [borderWidth, borderHeight, 5.4] },
        { pos: [5.2, -0.15, 2.5], size: [borderWidth, borderHeight, 5.4] }
    ];
    
    borders.forEach(b => {
        const borderPiece = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]), borderMat);
        borderPiece.position.set(b.pos[0], b.pos[1], b.pos[2]);
        boardGroup.add(borderPiece);
    });
    
    scene.add(boardGroup);
}

function createPiece(row, col, color) {
    const geometry = new THREE.SphereGeometry(0.38, 64, 64);
    const material = new THREE.MeshStandardMaterial({
        color: color === 'B' ? 0xffffff : 0x222222,
        metalness: 0.3,
        roughness: 0.2,
        emissive: color === 'B' ? 0xffffff : 0x333333,
        emissiveIntensity: 0.1
    });
    
    const piece = new THREE.Mesh(geometry, material);
    piece.position.set(col + 0.5, 0, row + 0.5);
    piece.userData = { row, col, color };
    piece.castShadow = true;
    piece.receiveShadow = true;
    
    // Reflets (boule intérieure)
    const innerGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 32, 32),
        new THREE.MeshStandardMaterial({
            color: color === 'B' ? 0xffdd99 : 0x886622,
            emissive: color === 'B' ? 0xffaa66 : 0x442200,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.6
        })
    );
    piece.add(innerGlow);
    
    scene.add(piece);
    return piece;
}

function updatePieces3D() {
    // Supprimer toutes les pièces existantes
    Object.values(pieces).forEach(piece => {
        scene.remove(piece);
    });
    pieces = {};
    
    // Créer les nouvelles pièces
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            if (board[i][j]) {
                const piece = createPiece(i, j, board[i][j]);
                pieces[`${i},${j}`] = piece;
            }
        }
    }
}

function animatePieceMove(piece, targetX, targetZ) {
    if (!piece) return;
    const startY = piece.position.y;
    const startX = piece.position.x;
    const startZ = piece.position.z;
    let progress = 0;
    const duration = 300;
    const startTime = performance.now();
    
    function animateMove(now) {
        const elapsed = now - startTime;
        progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        
        piece.position.x = startX + (targetX - startX) * ease;
        piece.position.z = startZ + (targetZ - startZ) * ease;
        piece.position.y = startY + Math.sin(Math.PI * ease) * 0.3;
        
        if (progress < 1) {
            requestAnimationFrame(animateMove);
        } else {
            piece.position.y = startY;
        }
    }
    
    requestAnimationFrame(animateMove);
}

function animateCapture(piece) {
    if (!piece) return;
    let scale = 1;
    let progress = 0;
    const startTime = performance.now();
    const duration = 300;
    
    function animate(now) {
        const elapsed = now - startTime;
        progress = Math.min(1, elapsed / duration);
        scale = 1 + Math.sin(Math.PI * progress) * 0.5;
        piece.scale.set(scale, scale, scale);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(piece);
        }
    }
    
    requestAnimationFrame(animate);
}

function onCanvasClick(event) {
    if (gameMode === 'online' && (!isMyTurn || gameOver)) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(squares);
    
    if (intersects.length > 0) {
        const hit = intersects[0];
        const row = hit.object.userData.row;
        const col = hit.object.userData.col;
        
        handleCellClick(row, col);
    }
}

function handleCellClick(row, col) {
    if (gameOver) return;
    
    if (selectedPiece === null) {
        if (board[row][col] === currentTurn) {
            selectedPiece = { row, col };
            highlightSquare(row, col, true);
            addLog(`Pion sélectionné en ${String.fromCharCode(65+col)}${row+1}`);
        }
    } else {
        const fromRow = selectedPiece.row;
        const fromCol = selectedPiece.col;
        
        if (executeMove(fromRow, fromCol, row, col)) {
            if (gameMode === 'online' && socket && gameId) {
                socket.emit('makeMove', {
                    gameId: gameId,
                    fromX: fromRow,
                    fromY: fromCol,
                    toX: row,
                    toY: col
                });
            }
        }
        clearHighlight();
        selectedPiece = null;
    }
}

function highlightSquare(row, col, active) {
    const square = squares.find(s => s.userData.row === row && s.userData.col === col);
    if (square) {
        square.material.emissiveIntensity = active ? 0.3 : 0.05;
        square.material.emissive = active ? 0xff6600 : 0x000000;
    }
}

function clearHighlight() {
    squares.forEach(square => {
        square.material.emissiveIntensity = 0.05;
        square.material.emissive = 0x000000;
    });
}

function addLog(message, type = 'move') {
    console.log(`[${type}] ${message}`);
}

function updateUI() {
    let whiteCount = 0, blackCount = 0;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            if (board[i][j] === 'B') whiteCount++;
            if (board[i][j] === 'N') blackCount++;
        }
    }
    
    document.getElementById('whiteScore').textContent = whiteCount;
    document.getElementById('blackScore').textContent = blackCount;
    
    const turnText = document.getElementById('turnText');
    const turnPiece = document.getElementById('turnPiece3d');
    
    if (currentTurn === 'B') {
        turnText.textContent = 'TOUR DES BLANCS';
        turnPiece.className = 'turn-piece-3d white-turn';
    } else {
        turnText.textContent = 'TOUR DES NOIRS';
        turnPiece.className = 'turn-piece-3d black-turn';
    }
    
    if (whiteCount === 0 && !gameOver) {
        gameOver = true;
        showModal('🏆 VICTOIRE !', 'Les NOIRS remportent la partie !');
    } else if (blackCount === 0 && !gameOver) {
        gameOver = true;
        showModal('🏆 VICTOIRE !', 'Les BLANCS remportent la partie !');
    }
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

// ========== LOGIQUE DE JEU (identique à avant) ==========
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
    if (!piece || piece !== currentTurn) return false;
    if (gameOver) return false;
    if (!isValidMove(fromX, fromY, toX, toY, currentTurn)) return false;
    
    // Animation de déplacement
    const pieceKey = `${fromX},${fromY}`;
    const movingPiece = pieces[pieceKey];
    if (movingPiece) {
        animatePieceMove(movingPiece, toY + 0.5, toX + 0.5);
    }
    
    // Capture
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
        const midX = fromX + dx/2;
        const midY = fromY + dy/2;
        const capturedKey = `${midX},${midY}`;
        const capturedPiece = pieces[capturedKey];
        if (capturedPiece) {
            animateCapture(capturedPiece);
            delete pieces[capturedKey];
        }
        board[midX][midY] = null;
    }
    
    // Déplacer
    board[toX][toY] = piece;
    board[fromX][fromY] = null;
    
    // Mettre à jour les pièces 3D
    delete pieces[pieceKey];
    pieces[`${toX},${toY}`] = movingPiece;
    if (movingPiece) {
        movingPiece.userData = { row: toX, col: toY, color: piece };
    }
    
    currentTurn = currentTurn === 'B' ? 'N' : 'B';
    updateUI();
    
    return true;
}

function resetGame() {
    initBoard();
    currentTurn = 'B';
    selectedPiece = null;
    gameOver = false;
    updatePieces3D();
    updateUI();
    clearHighlight();
    addLog('🔄 Nouvelle partie !', 'system');
}

function initBoard() {
    board = Array(5).fill().map(() => Array(5).fill(null));
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) board[i][j] = 'B';
    }
    board[2][0] = 'B';
    board[2][4] = 'B';
    for (let i = 3; i < 5; i++) {
        for (let j = 0; j < 5; j++) board[i][j] = 'N';
    }
}

// ========== MODES DE JEU ==========
function initLocalMode() {
    gameMode = 'local';
    if (socket) socket.disconnect();
    document.getElementById('onlinePanel').classList.add('hidden');
    resetGame();
}

function initOnlineMode() {
    gameMode = 'online';
    if (socket) socket.disconnect();
    
    socket = io();
    
    socket.on('connect', () => {
        addLog('🌐 Connecté au serveur', 'system');
    });
    
    socket.on('gameCreated', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').innerHTML = `✅ Partie créée ! Code: ${gameId}`;
        resetGame();
    });
    
    socket.on('gameJoined', (data) => {
        gameId = data.gameId;
        playerColor = data.color;
        isMyTurn = (playerColor === 'B');
        document.getElementById('gameStatus').innerHTML = `✅ Connecté à la partie ${gameId}`;
        showModal('Partie rejointe', `Vous êtes ${playerColor === 'B' ? 'BLANC' : 'NOIR'}`);
    });
    
    socket.on('gameStarted', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        playerColor = data.colors[socket.id];
        isMyTurn = (currentTurn === playerColor);
        gameOver = false;
        updatePieces3D();
        updateUI();
        addLog('🎯 Partie démarrée !', 'system');
    });
    
    socket.on('moveMade', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        isMyTurn = (currentTurn === playerColor);
        updatePieces3D();
        updateUI();
        if (data.captured) addLog('⚔️ Capture !', 'capture');
    });
    
    socket.on('gameOver', (data) => {
        const winner = data.winner === 'B' ? 'Blancs' : 'Noirs';
        gameOver = true;
        showModal('🏆 VICTOIRE', `${winner} remportent la partie !`);
    });
    
    socket.on('gameReset', (data) => {
        board = data.board;
        currentTurn = data.currentTurn;
        gameOver = false;
        updatePieces3D();
        updateUI();
    });
    
    socket.on('playerDisconnected', () => {
        addLog('⚠️ Adversaire déconnecté', 'error');
        gameOver = true;
    });
    
    socket.on('moveError', (msg) => {
        addLog(`❌ ${msg}`, 'error');
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

// ========== INITIALISATION ==========
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

document.getElementById('resetBtn').addEventListener('click', () => {
    if (gameMode === 'online' && socket && gameId) {
        socket.emit('resetGame', gameId);
    }
    resetGame();
});

document.getElementById('rulesBtn').addEventListener('click', showRules);
document.getElementById('modalCloseBtn').addEventListener('click', hideModal);
document.getElementById('rulesCloseBtn').addEventListener('click', hideModal);

initBoard();
init3D();
updatePieces3D();
updateUI();
