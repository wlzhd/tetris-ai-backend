// aaa.js
// const socket = io("http://localhost:3000");
// const socket = io("http://192.168.0.40:3000");
console.log(window.location.origin);
const socket = io(window.location.origin);

let roomId = null;
let myRole = null;
let gameActive = false;
let isSoloMode = false;
let myComboCount = -1;

const keys = {};

// ==========================================================
// ⌨️ [초정밀 조작감 개혁] 프레임 카운트 방식에서 실제 밀리초(ms) 타이머 방식으로 대전환!
// ==========================================================
let dasTimer = 0;      
let arrTimer = 0;      
let softDropTimer = 0; 

let DAS_DELAY_MS = 150;     // 방향키를 꾹 눌렀을 때 연속 이동이 시작될 때까지의 대기 시간 (150ms)
let ARR_FRAME_RATE = 1;     // 슬라이더 연동 변수 (ARR 속도 제어용)
let SOFT_DROP_RATE = 25; 
// ==========================================================

// ⏱️ Jstris Sprint 40L 타이머 및 누적 스택 변수
let sprintStartTime = 0;
let sprintLinesCleared = 0;
let sprintTimerInterval = null; // 💡 실시간 상단 타이머 갱신을 위한 인터벌 변수
const SPRINT_TARGET_LINES = 40; // 목표치 40줄 고정

const BLOCK_SIZE = 24;
const SHAPES = {
    'I': { matrix: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], color: '#00f0f0' }, 
    'O': { matrix: [[2,2], [2,2]], color: '#f0f000' },                             
    'T': { matrix: [[0,3,0], [3,3,3], [0,0,0]], color: '#a000f0' },                 
    'L': { matrix: [[0,0,4], [4,4,4], [0,0,0]], color: '#f0a000' },                 
    'J': { matrix: [[5,0,0], [5,5,5], [0,0,0]], color: '#0000f0' },                 
    'S': { matrix: [[0,6,6], [6,6,0], [0,0,0]], color: '#00f0f0' },                 
    'Z': { matrix: [[7,7,0], [0,7,7], [0,0,0]], color: '#f00000' }                  
};
const COLORS = [null, '#00f0f0', '#f0f000', '#a000f0', '#f0a000', '#0000f0', '#00f0f0', '#f00000', '#555555'];
const SHAPE_TYPES = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

const WK_TESTS_90 = [
    {dx: 0, dy: 0},   
    {dx: -1, dy: 0},  
    {dx: 1, dy: 0},   
    {dx: 0, dy: 1},   
    {dx: -1, dy: 1},  
    {dx: 1, dy: 1},   
    {dx: 0, dy: -1},  
    {dx: -2, dy: 0},  
    {dx: 2, dy: 0}    
];
const WK_TESTS_180 = [{dx:0,dy:0}, {dx:0,dy:1}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:-1}];

// 🧩 7-Bag 랜덤 블록 매트릭스 생성기
function generateSharedBag() {
    let bag = [...SHAPE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag.map(type => SHAPES[type].matrix.map(row => [...row]));
}

// 🟦 내 게임 상태 객체
let myGame = {
    canvas: document.getElementById('my-tetris'),
    ctx: document.getElementById('my-tetris').getContext('2d'),
    holdCanvas: document.getElementById('my-hold'),
    holdCtx: document.getElementById('my-hold').getContext('2d'),
    nextCanvas: document.getElementById('my-next'),
    nextCtx: document.getElementById('my-next').getContext('2d'),
    scoreElement: document.getElementById('my-attack-count'), 
    gaugeElement: document.getElementById('my-attack-gauge'),
    board: Array.from({length: 20}, () => Array(10).fill(0)),
    score: 0, 
    player: { pos: {x: 0, y: 0}, matrix: null, color: '', type: '' },
    nextQueue: [], currentBag: [], holdType: null, canSwap: true,
    dropCounter: 0, dropInterval: 1000, lockDelayTimer: 0, lockTotalHighestTimer: 0,
    pendingAttacks: 0 
};

// 🟧 상대방 중계 화면 객체
let oppGame = {
    canvas: document.getElementById('opp-tetris'), ctx: document.getElementById('opp-tetris').getContext('2d'),
    holdCanvas: document.getElementById('opp-hold'), holdCtx: document.getElementById('opp-hold').getContext('2d'),
    nextCanvas: document.getElementById('opp-next'), nextCtx: document.getElementById('opp-next').getContext('2d'),
    scoreElement: document.getElementById('opp-score'),
    gaugeElement: document.getElementById('opp-attack-gauge'),
    board: Array.from({length: 20}, () => Array(10).fill(0)),
    score: 0, player: { pos: {x: 0, y: 0}, matrix: null, color: '' },
    nextQueue: [], holdType: null,
    pendingAttacks: 0 
};

// ⚙️ 감도 리스너
document.getElementById('setting-arr').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    ARR_FRAME_RATE = Math.floor(val / 20); 
    document.getElementById('val-arr').innerText = val;
});

document.getElementById('setting-softdrop').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    SOFT_DROP_RATE = val; 
    document.getElementById('val-softdrop').innerText = val;
});

function myPlayerReset() {
    if (myGame.nextQueue.length < 7) {
        myGame.nextQueue.push(...generateSharedBag());
    }
    myGame.player.matrix = myGame.nextQueue.shift();
    myGame.player.type = getPieceType(myGame.player.matrix); 
    myGame.player.color = SHAPES[myGame.player.type] ? SHAPES[myGame.player.type].color : '#fff';
    
    myGame.player.pos.y = 0;
    
    const baseStartX = Math.floor(10 / 2) - Math.floor(myGame.player.matrix[0].length / 2);
    if (myGame.player.type !== 'I' && myGame.player.type !== 'O') {
        myGame.player.pos.x = baseStartX - 1; 
    } else {
        myGame.player.pos.x = baseStartX;
    }

    if (collide(myGame.board, myGame.player)) {
        myGame.player.pos.y--; 
        if (collide(myGame.board, myGame.player)) {
            myGame.player.pos.y--;
            if (collide(myGame.board, myGame.player)) {
                if (sprintTimerInterval) clearInterval(sprintTimerInterval); // 게임오버 시에도 타이머 스톱
                alert("💥 블록 소환 불가로 인한 GAME OVER 💥");
                gameActive = false;
                return;
            }
        }
    }
    myGame.canSwap = true;
    updateNextPreview(); 
    sendGameSync();
}

function getPieceType(matrix) {
    if (!matrix) return 'I';
    if (matrix.length === 2) return 'O';
    if (matrix.length === 4) return 'I';
    const str = JSON.stringify(matrix);
    if (str.includes('[0,3,0]') || matrix[1][1] === 3) return 'T';
    if (str.includes('[0,0,4]') || matrix[0][2] === 4) return 'L';
    if (str.includes('[5,0,0]') || matrix[0][0] === 5) return 'J';
    if (str.includes('[0,6,6]') || matrix[0][1] === 6) return 'S';
    if (str.includes('[7,7,0]') || matrix[0][0] === 7) return 'Z';
    return 'T';
}

function collide(board, player) {
    const m = player.matrix; const o = player.pos;
    if (!m) return false;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0) {
                if (!board[y + o.y] || board[y + o.y][x + o.x] === undefined || board[y + o.y][x + o.x] !== 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function myPlayerMove(dir) {
    if (!gameActive) return;
    myGame.player.pos.x += dir;
    if (collide(myGame.board, myGame.player)) myGame.player.pos.x -= dir;
    else { myGame.lockDelayTimer = 0; sendGameSync(); }
}

function myPlayerDrop() {
    if (!gameActive) return;
    myGame.player.pos.y++;
    if (collide(myGame.board, myGame.player)) {
        myGame.player.pos.y--;
        return false;
    }
    myGame.lockDelayTimer = 0;
    sendGameSync();
    return true;
}

function rotateMatrix(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    if (dir === 1) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function myPlayerRotate(dir) {
    if (!gameActive || !myGame.player.matrix) return;
    const origX = myGame.player.pos.x; const origY = myGame.player.pos.y;
    if (dir === 1) rotateMatrix(myGame.player.matrix, 1);
    else if (dir === -1) rotateMatrix(myGame.player.matrix, -1);
    else if (dir === 2) { rotateMatrix(myGame.player.matrix, 1); rotateMatrix(myGame.player.matrix, 1); }

    const tests = (dir === 2) ? WK_TESTS_180 : WK_TESTS_90;
    let success = false;
    for (let test of tests) {
        myGame.player.pos.x = origX + test.dx; myGame.player.pos.y = origY + test.dy;
        if (!collide(myGame.board, myGame.player)) { success = true; myGame.lockDelayTimer = 0; break; }
    }
    if (!success) {
        myGame.player.pos.x = origX; myGame.player.pos.y = origY;
        if (dir === 1) rotateMatrix(myGame.player.matrix, -1);
        else if (dir === -1) rotateMatrix(myGame.player.matrix, 1);
        else if (dir === 2) { rotateMatrix(myGame.player.matrix, 1); rotateMatrix(myGame.player.matrix, 1); }
    } else { sendGameSync(); }
}

function myPlayerHold() {
    if (!gameActive || !myGame.canSwap) return;
    if (myGame.holdType === null) {
        myGame.holdType = myGame.player.type; 
        myPlayerReset();
    } else {
        const currentType = myGame.player.type; const tempType = myGame.holdType;
        myGame.holdType = currentType;
        myGame.player.matrix = SHAPES[tempType].matrix.map(row => [...row]);
        myGame.player.color = SHAPES[tempType].color; myGame.player.type = tempType;
        myGame.player.pos.y = 0; myGame.player.pos.x = Math.floor((myGame.board[0].length - myGame.player.matrix[0].length) / 2);
    }
    myGame.canSwap = false;
    drawHold(myGame.holdCtx, myGame.holdCanvas, myGame.holdType);
    sendGameSync();
}

function myHardDrop() {
    if (!gameActive) return;
    while (!collide(myGame.board, myGame.player)) { myGame.player.pos.y++; }
    myGame.player.pos.y--;
    mergeAndSweep();
}

function updateAttackGauge(element, lines) {
    const percentage = Math.min((lines / 20) * 100, 100);
    element.style.height = percentage + '%';
}

function updateAttackGauges() {
    const myPercent = Math.min((myGame.pendingAttacks / 20) * 100, 100);
    document.getElementById('my-attack-gauge').style.height = myPercent + '%';
    const oppPercent = Math.min((oppGame.pendingAttacks / 20) * 100, 100);
    document.getElementById('opp-attack-gauge').style.height = oppPercent + '%';
}

function sendGameSync() {
    if (!roomId || isSoloMode) return;
    socket.emit('sync_game', {
        roomId: roomId, board: myGame.board, score: myGame.score,
        playerPos: myGame.player.pos, playerMatrix: myGame.player.matrix, playerColor: myGame.player.color,
        holdType: myGame.holdType, nextQueue: myGame.nextQueue.map(m => getPieceType(m)),
        attackLinesReceived: myGame.pendingAttacks
    });
}

function resetAllBoardStates() {
    if (sprintTimerInterval) clearInterval(sprintTimerInterval); // 기존 잔여 타이머가 있다면 삭제
    myGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    myGame.score = 0; 
    if (myGame.scoreElement) myGame.scoreElement.innerText = 0; 
    myGame.holdType = null; myGame.nextQueue = []; myGame.currentBag = [];
    myGame.pendingAttacks = 0; myComboCount = -1;
    updateAttackGauge(myGame.gaugeElement, 0);
    
    oppGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    oppGame.score = 0; oppGame.scoreElement.innerText = 0;
    oppGame.holdType = null; oppGame.nextQueue = []; oppGame.player.matrix = null;
    oppGame.pendingAttacks = 0;
    updateAttackGauge(oppGame.gaugeElement, 0);

    drawHold(myGame.holdCtx, myGame.holdCanvas, null);
    drawHold(oppGame.holdCtx, oppGame.holdCanvas, null);
}

function updateNextPreview() {
    const types = myGame.nextQueue.slice(0, 4).map(m => getPieceType(m));
    drawNext(myGame.nextCtx, myGame.nextCanvas, types);
}

// 💡 [타이머 실시간 출력 유틸 함수]
function startSprintRealtimeTimer() {
    if (sprintTimerInterval) clearInterval(sprintTimerInterval);
    
    sprintTimerInterval = setInterval(() => {
        if (!gameActive) return;
        const now = performance.now();
        const currentSec = ((now - sprintStartTime) / 1000).toFixed(2);
        document.getElementById('status-msg').innerText = `⏱️ 스프린트 진행 중 | 시간: ${currentSec}s | 줄: ${sprintLinesCleared} / ${SPRINT_TARGET_LINES}`;
    }, 30); // 약 30ms 간격으로 소수점 2자리 갱신 루프 활성화
}

document.getElementById('btn-start').addEventListener('click', () => {
    resetAllBoardStates();
    isSoloMode = false;
    document.getElementById('opp-section').style.opacity = "0.3";
    document.getElementById('status-msg').innerText = "상대 플레이어를 검색 중입니다...";
    socket.emit('request_match'); 
});

// ⏱️ 혼자하기(스프린트) 버튼 클릭 핸들러
document.getElementById('btn-solo').addEventListener('click', () => {
    resetAllBoardStates();
    isSoloMode = true; 
    gameActive = true;
    
    sprintLinesCleared = 0;
    sprintStartTime = performance.now(); 
    
    document.getElementById('opp-section').style.opacity = "0.1";
    
    myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    myPlayerReset();
    startSprintRealtimeTimer(); // 💡 실시간 타이머 가동!
});

document.getElementById('btn-restart').addEventListener('click', () => {
    resetAllBoardStates();
    myGame.pendingAttacks = 0; oppGame.pendingAttacks = 0; myComboCount = -1; 
    updateAttackGauges();

    if (isSoloMode) {
        gameActive = true;
        sprintLinesCleared = 0;
        sprintStartTime = performance.now();
        myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
        myPlayerReset();
        startSprintRealtimeTimer(); // 💡 재시작 시 타이머 새로 가동!
    } else {
        gameActive = false;
        document.getElementById('opp-section').style.opacity = "0.3"; 
        document.getElementById('status-msg').innerText = "매칭을 다시 잡으려면 '시작하기'를 누르세요.";
    }
});

socket.on('receive_attack', (data) => {
    if (isSoloMode) return; 
    myGame.pendingAttacks = (myGame.pendingAttacks || 0) + data.lines;
    updateAttackGauges(); 
});

socket.on('opponent_sync', (data) => {
    oppGame.board = data.board; oppGame.score = data.score;
    oppGame.player.pos = data.playerPos; oppGame.player.matrix = data.playerMatrix; oppGame.player.color = data.playerColor;
    oppGame.holdType = data.holdType; oppGame.nextQueue = data.nextQueue;
    oppGame.pendingAttacks = data.attackLinesReceived;

    oppGame.scoreElement.innerText = oppGame.score;
    updateAttackGauge(oppGame.gaugeElement, oppGame.pendingAttacks);
    drawHold(oppGame.holdCtx, oppGame.holdCanvas, oppGame.holdType);
    drawNext(oppGame.nextCtx, oppGame.nextCanvas, oppGame.nextQueue);
});

socket.on('status', (msg) => { if(!isSoloMode) document.getElementById('status-msg').innerText = msg; });
socket.on('match_start', (data) => {
    roomId = data.roomId; myRole = data.role;
    document.getElementById('status-msg').innerText = "⚔️ 1VS1 실시간 매치 스타트!!";
    document.getElementById('opp-section').style.opacity = "1.0";
    const serverBags = (myRole === 'p1') ? data.initialBags[0] : data.initialBags[1];
    myGame.nextQueue = serverBags.map(type => SHAPES[type].matrix.map(row => [...row]));
    gameActive = true;
    myPlayerReset();
});

function drawGrid(ctx, canvas) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += BLOCK_SIZE) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for (let j = 0; j <= canvas.height; j += BLOCK_SIZE) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke(); }
}   

function drawMatrix(matrix, offset, customColor, ctx, size = BLOCK_SIZE) {
    if (!matrix) return;
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = (value === 8) ? '#555555' : (customColor || COLORS[value]);
                ctx.fillRect((x + offset.x) * size, (y + offset.y) * size, size, size);
                ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
                ctx.strokeRect((x + offset.x) * size, (y + offset.y) * size, size, size);
            }
        });
    });
}

function drawMyGhost() {
    if (!myGame.player.matrix) return;
    let ghostPos = { x: myGame.player.pos.x, y: myGame.player.pos.y };
    while (!collide(myGame.board, {pos: {x: ghostPos.x, y: ghostPos.y + 1}, matrix: myGame.player.matrix})) { ghostPos.y++; }
    myGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                myGame.ctx.globalAlpha = 0.15; myGame.ctx.fillStyle = myGame.player.color; 
                myGame.ctx.fillRect((x + ghostPos.x) * BLOCK_SIZE, (y + ghostPos.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                myGame.ctx.globalAlpha = 0.3; myGame.ctx.strokeStyle = '#fff'; 
                myGame.ctx.strokeRect((x + ghostPos.x) * BLOCK_SIZE, (y + ghostPos.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                myGame.ctx.globalAlpha = 1.0;
            }
        });
    });
}

function drawHold(ctx, canvas, type) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!type || !SHAPES[type]) return;
    const m = SHAPES[type].matrix;
    const offsetX = (canvas.width - m[0].length * 16) / 2 / 16; const offsetY = (canvas.height - m.length * 16) / 2 / 16;
    drawMatrix(m, {x: offsetX, y: offsetY}, SHAPES[type].color, ctx, 16);
}

function drawNext(ctx, canvas, queue) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!queue) return;
    queue.slice(0, 4).forEach((type, index) => {
        if (!SHAPES[type]) return;
        const m = SHAPES[type].matrix; const offsetX = (canvas.width - m[0].length * 14) / 2 / 14;
        
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) {
                ctx.fillStyle = SHAPES[type].color;
                ctx.fillRect((x + offsetX) * 14, (index * 55 + 10 + y * 14), 14, 14);
                ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
                ctx.strokeRect((x + offsetX) * 14, (index * 55 + 10 + y * 14), 14, 14);
            }
        }));
    });
}

function handleContinuousInput(deltaTime) {
    if (keys[37] || keys[39]) {
        dasTimer += deltaTime; 
        if (dasTimer >= DAS_DELAY_MS) {
            if (ARR_FRAME_RATE === 0) {
                const dir = keys[37] ? -1 : 1;
                while (!collide(myGame.board, { pos: { x: myGame.player.pos.x + dir, y: myGame.player.pos.y }, matrix: myGame.player.matrix })) {
                    myGame.player.pos.x += dir;
                }
                myGame.lockDelayTimer = 0;
            } else {
                arrTimer += deltaTime;
                const arrInterval = ARR_FRAME_RATE * 16.6;
                if (arrTimer >= arrInterval) { myPlayerMove(keys[37] ? -1 : 1); arrTimer = 0; }
            }
        }
    } else { dasTimer = 0; arrTimer = 0; }

    if (keys[40]) {
        if (SOFT_DROP_RATE === 0) { while (myPlayerDrop()) {} } 
        else {
            softDropTimer += deltaTime;
            if (softDropTimer >= SOFT_DROP_RATE) { myPlayerDrop(); softDropTimer = 0; }
        }
    } else { softDropTimer = 0; }
}

document.addEventListener('keydown', e => {
    if (e.repeat || !gameActive) return;
    keys[e.keyCode] = true;
    
    if (e.keyCode === 37) { dasTimer = 0; arrTimer = 0; myPlayerMove(-1); }
    if (e.keyCode === 39) { dasTimer = 0; arrTimer = 0; myPlayerMove(1); }
    if (e.keyCode === 40) myPlayerDrop();
    if (e.keyCode === 88 || e.keyCode === 38) myPlayerRotate(1);  
    if (e.keyCode === 90) myPlayerRotate(-1); 
    if (e.keyCode === 65) myPlayerRotate(2);  
    if (e.keyCode === 67) myPlayerHold();     
    if (e.keyCode === 32) myHardDrop();       
});

document.addEventListener('keyup', e => { 
    delete keys[e.keyCode]; 
    if (e.keyCode === 37 || e.keyCode === 39) { dasTimer = 0; arrTimer = 0; }
});

function sendAttackToOpponent(rowsCleared, isTSpin, isPerfectClear, finalPower = 0) {
    if (isSoloMode || !roomId) return; 
    if (finalPower > 0) {
        socket.emit('send_attack', { roomId: roomId, lines: finalPower });
        myGame.score += finalPower;
        if (myGame.scoreElement) myGame.scoreElement.innerText = myGame.score;
    }
}

function applyPendingAttacks() {
    let currentPending = myGame.pendingAttacks || 0;
    if (isSoloMode || currentPending <= 0) {
        myGame.pendingAttacks = 0; updateAttackGauges(); return;
    }
    const linesToRise = currentPending;
    myGame.pendingAttacks = 0; updateAttackGauges();

    const displacedRows = myGame.board.slice(0, linesToRise);
    myGame.board.splice(0, linesToRise);
    
    for (let i = 0; i < linesToRise; i++) {
        let garbageRow = Array(10).fill(8); let holeIndex = Math.floor(Math.random() * 10);
        garbageRow[holeIndex] = 0; myGame.board.push(garbageRow);
    }
    if (displacedRows.some(row => row.some(val => val !== 0))) {
        if (sprintTimerInterval) clearInterval(sprintTimerInterval);
        alert("💥 쓰레기 블록 폭격으로 인한 GAME OVER 💥");
        gameActive = false; return;
    }
    sendGameSync(); 
}

function mergeAndSweep() {
    let isTSpin = false;
    if (myGame.player.type === 'T') {
        const cx = myGame.player.pos.x + 1; const cy = myGame.player.pos.y + 1; 
        const corners = [{dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: 1, dy: 1}];
        let occupiedCount = 0;
        corners.forEach(c => {
            const targetX = cx + c.dx; const targetY = cy + c.dy;
            if (targetX < 0 || targetX >= 10 || targetY >= 20) { occupiedCount++; } 
            else if (targetY >= 0 && myGame.board[targetY][targetX] !== 0) { occupiedCount++; }
        });
        if (occupiedCount >= 3) isTSpin = true;
    }

    myGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0 && myGame.player && myGame.player.pos) { 
                myGame.board[y + myGame.player.pos.y][x + myGame.player.pos.x] = value; 
            }
        });
    });
    
    let rowsCleared = 0;
    outer: for (let y = myGame.board.length - 1; y > 0; --y) {
        for (let x = 0; x < myGame.board[y].length; ++x) { if (myGame.board[y][x] === 0) continue outer; }
        const row = myGame.board.splice(y, 1)[0].fill(0); myGame.board.unshift(row);
        ++y; rowsCleared++; 
    }
    
    let isPerfectClear = myGame.board.every(row => row.every(val => val === 0));
    if (rowsCleared > 0) { myComboCount++; } else { myComboCount = -1; }

    let myPower = 0;
    if (rowsCleared === 2) myPower = 1;
    else if (rowsCleared === 3) myPower = 2;
    else if (rowsCleared === 4) myPower = 4; 

    if (isTSpin) {
        if (rowsCleared === 1) myPower = 2;
        else if (rowsCleared === 2) myPower = 5;
        else if (rowsCleared === 3) myPower = 7;
    }
    if (rowsCleared > 0 && myComboCount > 0) myPower += Math.floor(myComboCount / 2);
    if (isPerfectClear) myPower += 10;

    // 🎯 [스프린트 실시간 마감 처리 구역]
    if (isSoloMode && rowsCleared > 0) {
        sprintLinesCleared += rowsCleared;
        if (myGame.scoreElement) myGame.scoreElement.innerText = sprintLinesCleared;

        if (sprintLinesCleared >= SPRINT_TARGET_LINES) {
            gameActive = false; // 1. 블록 입력을 멈추고 게임 상태를 완전 동결
            if (sprintTimerInterval) clearInterval(sprintTimerInterval); // 2. 타이머 백그라운드 인터벌을 죽여 시간 고정!
            
            const endTime = performance.now();
            const finalTimeSec = ((endTime - sprintStartTime) / 1000).toFixed(2);
            
            // 3. 💥 alert창 없이 상단 바에 완주 기록을 딱 박제합니다.
            document.getElementById('status-msg').innerText = `🏁 SPRINT FINISH! 기록: ${finalTimeSec}초 🏁`;
            return;
        }
    }

    if (myPower > 0 && myGame.pendingAttacks > 0) {
        if (myGame.pendingAttacks >= myPower) { myGame.pendingAttacks -= myPower; myPower = 0; } 
        else { myPower -= myGame.pendingAttacks; myGame.pendingAttacks = 0; }
        updateAttackGauges(); 
    }
    if (myPower > 0 && (rowsCleared > 0 || isPerfectClear)) sendAttackToOpponent(rowsCleared, isTSpin, isPerfectClear, myPower);
    if (rowsCleared === 0 && !isPerfectClear) applyPendingAttacks(); 

    myPlayerReset();
}

let lastTime = 0;
function mainLoop(time = 0) {
    const deltaTime = time - lastTime; lastTime = time;
    if (gameActive) {
        handleContinuousInput(deltaTime); 
        if (myGame.player && myGame.player.matrix) {
            let tempPlayer = { pos: { x: myGame.player.pos.x, y: myGame.player.pos.y + 1 }, matrix: myGame.player.matrix };
            if (collide(myGame.board, tempPlayer)) {
                myGame.lockDelayTimer += deltaTime; myGame.lockTotalHighestTimer += deltaTime;
                if (myGame.lockDelayTimer >= 1000 || myGame.lockTotalHighestTimer >= 3000) { mergeAndSweep(); }
            } else {
                myGame.lockDelayTimer = 0; myGame.lockTotalHighestTimer = 0;
                if (!keys[40]) {
                    myGame.dropCounter += deltaTime;
                    if (myGame.dropCounter > myGame.dropInterval) { myPlayerDrop(); myGame.dropCounter = 0; }
                }
            }
        }
    }
    
    drawGrid(myGame.ctx, myGame.canvas); drawMatrix(myGame.board, {x:0, y:0}, null, myGame.ctx); drawMyGhost();
    if (myGame.player) { drawMatrix(myGame.player.matrix, myGame.player.pos, myGame.player.color, myGame.ctx); }
    drawGrid(oppGame.ctx, oppGame.canvas); drawMatrix(oppGame.board, {x:0, y:0}, null, oppGame.ctx);
    if (oppGame.player) { drawMatrix(oppGame.player.matrix, oppGame.player.pos, oppGame.player.color, oppGame.ctx); }

    requestAnimationFrame(mainLoop);
}
mainLoop();