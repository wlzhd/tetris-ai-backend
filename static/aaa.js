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
    if (sprintTimerInterval) clearInterval(sprintTimerInterval);
    
    // 1. 내 보드판 데이터 완전 청소
    myGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    myGame.score = 0; 
    if (myGame.scoreElement) myGame.scoreElement.innerText = 0; 
    myGame.holdType = null; myGame.nextQueue = []; myGame.currentBag = [];
    myGame.pendingAttacks = 0; myComboCount = -1;
    updateAttackGauge(myGame.gaugeElement, 0);
    
    // 2. 상대방 보드판 데이터 완전 청소
    oppGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    oppGame.score = 0; 
    if (oppGame.scoreElement) oppGame.scoreElement.innerText = 0;
    oppGame.holdType = null; oppGame.nextQueue = []; 
    oppGame.player = { pos: {x: 0, y: 0}, matrix: null, color: '' }; 
    oppGame.pendingAttacks = 0;
    updateAttackGauge(oppGame.gaugeElement, 0);

    // 미니 캔버스들 청소
    drawHold(myGame.holdCtx, myGame.holdCanvas, null);
    drawHold(oppGame.holdCtx, oppGame.holdCanvas, null);

    // 🚫 [철저 방어] 원래 있던 roomId = null; 과 myRole = null; 구문을 의도적으로 제거했습니다!
    // 이 함수가 실행되어도 방 코드 메모리는 철통같이 보호됩니다.
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

document.getElementById('btn-solo').addEventListener('click', () => {
    // 💡 기존 방 정보 임시 백업
    const savedRoomId = roomId;
    const savedMyRole = myRole;

    // 보드판 도화지 청소 (이제 내부에서 roomId를 지우지 않습니다!)
    resetAllBoardStates();
    
    // 안전하게 방 데이터 유지
    roomId = savedRoomId;
    myRole = savedMyRole;
    
    isSoloMode = true; 
    gameActive = true;
    sprintLinesCleared = 0;
    sprintStartTime = performance.now(); 
    
    // 상대방 화면 반투명 처리
    document.getElementById('opp-section').style.opacity = "0.1";
    
    myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    myPlayerReset();
    startSprintRealtimeTimer(); 

    // 🏠 상단 안내 메시지에 방 코드 박제
    if (savedRoomId) {
        const pureNum = savedRoomId.replace("room_", "");
        document.getElementById('status-msg').innerHTML = 
            `🏠 유지 중인 방 코드: <span style="color: #f1c40f; font-size: 20px; font-weight: bold; background: #000; padding: 2px 8px; border-radius: 4px;">${pureNum}</span> (혼자 연습 중...)<br>` +
            `<span style="color: #2ecc71; font-size: 12px; font-weight: bold;">상대방이 이 코드를 치고 들어오면 대전 버튼이 다시 활성화됩니다!</span>`;
    } else {
        document.getElementById('status-msg').innerText = "⏱️ 연습 모드 가동 중...";
    }
});

// 🔄 방에서 [다시시작] 버튼을 눌렀을 때 실행되는 재경기 요청 함수
if (document.getElementById('btn-restart')) {
    document.getElementById('btn-restart').onclick = function() {
        // 만약 지금 방 코드가 존재하는 '멀티플레이 방' 상태라면?
        if (typeof roomId !== 'undefined' && roomId) {
            document.getElementById('status-msg').innerHTML = `🔄 상대방에게 재대결 요청을 보내는 중...`;
            // 서버로 재대결 요청 신호를 보냅니다.
            socket.emit('request_rematch', { room_id: roomId, role: myRole });
        } else {
            // 방 코드가 없다면 기존 연습모드(혼자하기) 다시시작 로직 실행
            if (typeof resetGame === 'function') resetGame(); 
        }
    };
}

// 🔔 서버로부터 "상대가 재경기를 원한다"는 신호를 받았을 때 화면 처리
socket.on('rematch_triggered', function(data) {
    document.getElementById('status-msg').innerHTML = `⚔️ <span style="color: #e74c3c; font-weight:bold;">리턴 매치 성사!</span> 곧 다음 판이 시작됩니다!`;
    
    // 🎮 기존 aaa.js에 있는 전체 보드 초기화 함수 실행
    resetAllBoardStates();
    
    // 멀티플레이어 환경이므로 연습모드(isSoloMode) 해제 후 섹션 불빛 복구
    isSoloMode = false;
    document.getElementById('opp-section').style.opacity = "1.0";
    gameActive = true;
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
    // 🔥 [★초초초핵심] 시작 신호나 재경기 신호가 오면 무조건 기존 도화지부터 깨끗하게 닦습니다!
    resetAllBoardStates();

    roomId = data.roomId; 
    myRole = data.role;
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

let customRoomNum = null;   // 💡 빠른매칭/연습모드와 절대 꼬이지 않는 독립된 방 번호 메모리
let customRoomRole = null;

// 1. 방 만들기 (방장)
function createCustomRoom() {
    resetAllBoardStates();
    customRoomNum = Math.floor(1000 + Math.random() * 9000).toString();
    customRoomRole = 'p1'; 
    roomId = "custom_room_" + customRoomNum; 
    myRole = 'p1';
    document.getElementById('status-msg').innerHTML = 
        `🏠 생성된 방 코드: <span style="color: #f1c40f; font-size: 22px; font-weight: bold; background: #000; padding: 2px 8px; border-radius: 4px;">${customRoomNum}</span> (상대 대기 중...)<br>` +
        `<span style="color: #ff9f43; font-size: 12px; font-weight: bold;">상대방에게 이 숫자를 알려주세요! 혼자하기(연습)를 하며 기다려도 코드는 유지됩니다!</span>`;
    
    socket.emit('create_custom_room', { room_id: customRoomNum });
}

// 2. 방 참가하기 (도전자)
function joinCustomRoom() {
    const inputVal = document.getElementById('input-room-id').value.trim();
    if (!inputVal) { alert("방 코드를 입력해주세요!"); return; }
    
    resetAllBoardStates();
    
    customRoomNum = inputVal;
    customRoomRole = 'p2';
    
    roomId = "custom_room_" + customRoomNum;
    myRole = 'p2';
    
    document.getElementById('status-msg').innerHTML = `⏳ <span style="color: #3498db; font-weight:bold;">[방 ${inputVal}번]</span>에 참가 요청을 보냈습니다...`;
    socket.emit('join_custom_room', { room_id: inputVal });
}

// 3. 동일한 방에 두 사람이 모였을 때 트리거
socket.on('opponent_joined', function(data) {
    if (customRoomRole === 'p1') {
        document.getElementById('status-msg').innerHTML = 
            `👥 <span style="color: #2ecc71; font-weight:bold;">도전자가 입장했습니다!</span> 대전을 시작할 준비가 되었습니다.<br><br>` +
            `<button class="menu-btn" onclick="startCustomMatch()" style="background: #e74c3c; border-color: #c0392b; font-size: 16px; padding: 12px 30px; font-weight: bold; color: white; cursor: pointer; border-radius: 8px; box-shadow: 0 0 15px rgba(231,76,60,0.6);">🚀 대전 시작하기 (클릭!)</button>`;
    } else if (customRoomRole === 'p2') {
        document.getElementById('status-msg').innerHTML = `🤝 <span style="color: #f1c40f; font-weight:bold;">방에 정상 입장했습니다!</span><br>방장 플레이어가 게임을 시작하기를 기다리는 중... ⏳`;
    }
});

function startCustomMatch() {
    if (!customRoomNum) return;
    socket.emit('start_custom_match', { room_id: customRoomNum });
}

// 💡 5. [ match_start ] 이벤트 수신부 보완 (서버에서 들어오는 변수 처리 안정화)
socket.on('match_start_custom', function(data) {
    resetAllBoardStates();
    
    roomId = data.roomId;
    myRole = data.role;
    customRoomRole = data.role; // 싱크 동기화 복구
    
    document.getElementById('status-msg').innerText = "⚔️ 1VS1 실시간 매치 스타트!!";
    document.getElementById('opp-section').style.opacity = "1.0";
    
    const serverBags = (myRole === 'p1') ? data.initialBags[0] : data.initialBags[1];
    myGame.nextQueue = serverBags.map(type => SHAPES[type].matrix.map(row => [...row]));
    gameActive = true;
    myPlayerReset();
});

mainLoop();