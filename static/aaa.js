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

                showControlButtonsAgain();

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
    
    // 🛡️ [추가] 빠른 매칭을 탈 때는 예전 커스텀 방 잔상을 완전히 지워버려 채팅 채널 꼬임을 원천 차단합니다!
    customRoomNum = null; 
    customRoomRole = null;
    roomId = null;
    myRole = null;

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

socket.on('status', (msg) => { 
    // 💡 [초핵심] 내가 커스텀 방 모드(customRoomNum이 존재할 때)일 때는 
    // 연타나 비동기 에러로 인해 날아오는 공용 텍스트 오염을 철저히 씹어버립니다!
    if (customRoomNum) {
        console.log("⚠️ 커스텀 방 모드 활성화 중이므로 공용 status 메시지를 무시합니다:", msg);
        return; 
    }
    
    // 일반 빠른매칭 모드일 때만 정상 작동
    if(!isSoloMode) document.getElementById('status-msg').innerText = msg; 
});

// 🔔 빠른 매칭 성공 수신부 구역 수리
socket.on('match_start', (data) => {
    // 시작 신호가 오면 무조건 도화지 세척
    resetAllBoardStates();

    // 🛡️ [추가] 빠른 매칭 전용 룸 컨텍스트 순정 보존 작업
    customRoomNum = null;
    customRoomRole = null;

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
        
        // 🚨여기에 한 줄을 추가하여 버튼들을 다시 부활시켜 줍니다!
        showControlButtonsAgain();

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
    if (oppGame.player && oppGame.player.matrix) { drawMatrix(oppGame.player.matrix, oppGame.player.pos, oppGame.player.color, oppGame.ctx);}

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

    showControlButtonsAgain();

    document.getElementById('status-msg').innerText = "🏠 새로운 커스텀 대기실이 개설되었습니다.";
    // 💡 2층 독립 디스플레이 공간에 코드를 이쁘게 고정합니다.
    document.getElementById('custom-room-display').innerHTML = 
        `방 코드: <span style="color: #fff; background: #9b59b6; padding: 3px 10px; border-radius: 4px; font-size: 16px; font-weight: bold;">${customRoomNum}</span> (상대 대기 중...)`;
    
    socket.emit('create_custom_room', { room_id: customRoomNum });
}

let isJoinProcessing = false; 

// 2. 방 참가하기 (도전자 - ★재클릭 시 서버 오염 원천 차단 버전)
function joinCustomRoom() {
    if (isJoinProcessing) return;
    isJoinProcessing = true;

    const inputVal = document.getElementById('input-room-id').value.trim();
    if (!inputVal) { alert("방 코드를 입력해주세요!"); isJoinProcessing = false; return; }
    
    // 🛡️ [초핵심 방어막] 내가 이미 이 방 코드로 접속 완료한 도전자('p2') 상태라면?
    // 백엔드로 소켓 신호를 또 날려서 방장의 룸 데이터베이스를 오염시키지 않고, 
    // 브라우저 내부에서 즉시 대기 완료 화면으로 복구 연동합니다!
    if (customRoomNum === inputVal && customRoomRole === 'p2') {
        console.log("⚠️ [안심 복구] 이미 접속된 방입니다. 서버 패킷 송출을 차단하고 UI를 고정합니다.");
        
        document.getElementById('status-msg').innerHTML = `🤝 <span style="color: #f1c40f; font-weight:bold;">방에 정상 입장했습니다!</span><br><span style="font-size: 13px; color: #ccc;">방장 플레이어의 게임 시작을 기다리는 중... ⏳</span>`;
        document.getElementById('custom-room-display').innerHTML = `접속 중인 방: <span style="color: #2ecc71; font-weight: bold;">${customRoomNum}</span>`;
        
        isJoinProcessing = false;
        return;
    }
    
    // 완전히 새로운 방 번호를 입력했을 때만 깨끗하게 초기화 후 서버로 전송
    resetAllBoardStates();
    
    customRoomNum = inputVal;
    customRoomRole = 'p2';
    roomId = "custom_room_" + customRoomNum;
    myRole = 'p2';
    
    document.getElementById('status-msg').innerText = `방 참가 요청 중...⏳`;
    document.getElementById('custom-room-display').innerHTML = `접속 중인 방: <span style="color: #2ecc71; font-weight: bold;">${customRoomNum}</span>`;
    
    socket.emit('join_custom_room', { room_id: inputVal });

    setTimeout(() => {
        isJoinProcessing = false;
    }, 600);
}

// 3. 동일한 방에 두 사람이 모였을 때 트리거 (★무조건 문구 복구 치트키)
socket.on('opponent_joined', function(data) {
    if (sprintTimerInterval) { 
        clearInterval(sprintTimerInterval); 
        sprintTimerInterval = null; 
    }
    isJoinProcessing = false; 

    if (customRoomRole === 'p1') {
        document.getElementById('status-msg').innerHTML = 
            `👥 <span style="color: #2ecc71; font-weight:bold;">도전자가 입장했습니다!</span> 대전을 시작할 준비가 되었습니다.<br>` +
            `<button class="menu-btn" onclick="startCustomMatch()" style="background: #e74c3c; border-color: #c0392b; font-size: 16px; padding: 12px 30px; font-weight: bold; color: white; cursor: pointer; border-radius: 8px; box-shadow: 0 0 15px rgba(231,76,60,0.6); margin-top: 10px;">🚀 대전 시작하기 (클릭!)</button>`;
    } else if (customRoomRole === 'p2') {
        document.getElementById('status-msg').innerHTML = `🤝 <span style="color: #f1c40f; font-weight:bold;">방에 정상 입장했습니다!</span><br><span style="font-size: 13px; color: #ccc;">방장 플레이어의 게임 시작을 기다리는 중... ⏳</span>`;
    }
    
    if (customRoomNum) {
        document.getElementById('custom-room-display').innerHTML = 
            `유지 중인 방 코드: <span style="color: #fff; background: #9b59b6; padding: 3px 10px; border-radius: 4px; font-size: 16px; font-weight: bold;">${customRoomNum}</span>`;
    }
});

// 4. 방장이 [대전 시작하기] 버튼을 눌렀을 때 백엔드로 신호 전송 (★오차 제어 주소 파싱)
function startCustomMatch() {
    // 💡 어떤 상황에서도 룸 주소의 순수한 '숫자' 값만 정확하게 발라내어 백엔드로 전달합니다!
    let pureNum = customRoomNum;
    if (!pureNum && roomId) {
        pureNum = roomId.replace("custom_room_", "").replace("room_", "");
    }
    if (!pureNum) return;

    socket.emit('start_custom_match', { room_id: pureNum.trim() });
}

// 💡 매치 시작 이벤트가 오면 처리 플래그를 깔끔하게 초기화해줍니다.
socket.on('match_start_custom', function(data) {
    isJoinProcessing = false; // 락 해제
    resetAllBoardStates();
    
    roomId = data.roomId;
    myRole = data.role;
    customRoomRole = data.role; 
    isSoloMode = false; 
    
    document.getElementById('status-msg').innerText = "⚔️ 1VS1 실시간 매치 스타트!!";
    document.getElementById('opp-section').style.opacity = "1.0";

    document.getElementById('btn-solo').style.display = "none";
    document.getElementById('btn-start').style.display = "none";
    document.getElementById('btn-restart').style.display = "none";
    document.getElementById('room-join-area').style.display = "none"; 
    
    const serverBags = (myRole === 'p1') ? data.initialBags[0] : data.initialBags[1];
    myGame.nextQueue = serverBags.map(type => SHAPES[type].matrix.map(row => [...row]));
    gameActive = true;
    myPlayerReset();
});

// 💀 6. 게임 종료 후 혼자하기(대기실 스파링) 자동 복구 시스템
function showControlButtonsAgain() {
    isSoloMode = true; 
    gameActive = true; 

    const tempRoomId = roomId || ("custom_room_" + customRoomNum);
    const tempMyRole = myRole || customRoomRole;
    resetAllBoardStates();
    roomId = tempRoomId;
    myRole = tempMyRole;

    document.getElementById('btn-solo').style.display = "inline-block";
    document.getElementById('btn-start').style.display = "inline-block";
    document.getElementById('btn-restart').style.display = "inline-block";
    document.getElementById('room-join-area').style.display = "flex";

    document.getElementById('opp-section').style.opacity = "0.2";
    myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    myPlayerReset();

    if (customRoomNum) {
        document.getElementById('custom-room-display').innerHTML = `유지 중인 방 코드: <span style="color: #fff; background: #9b59b6; padding: 3px 10px; border-radius: 4px; font-size: 16px; font-weight: bold;">${customRoomNum}</span>`;
        if (customRoomRole === 'p1') {
            document.getElementById('status-msg').innerHTML = 
                `<span style="color: #f1c40f; font-weight:bold;">🎮 라운드 종료! 각자 연습 모드로 자동 전환되었습니다.</span><br>` +
                `<button class="menu-btn" onclick="startCustomMatch()" style="background: #e74c3c; border-color: #c0392b; font-size: 15px; padding: 8px 20px; font-weight: bold; color: white; margin-top: 8px;">🚀 다음 판 시작하기 (방장 클릭!)</button>`;
        } else {
            document.getElementById('status-msg').innerHTML = `<span style="color: #3498db; font-weight:bold;">⏳ 각자 연습하며 대기 중...</span><br><span style="font-size:12px; color:#aaa;">방장이 다음 판을 시작하면 즉시 연동됩니다.</span>`;
        }
    }
}

// 💡 7. 혼자하기(연습) 버튼 직접 클릭 시 핸들러
document.getElementById('btn-solo').addEventListener('click', () => {
    const backupNum = customRoomNum;
    const backupRole = customRoomRole;

    resetAllBoardStates();
    
    customRoomNum = backupNum;
    customRoomRole = backupRole;
    if (backupNum) {
        roomId = "custom_room_" + backupNum;
        myRole = backupRole;
    }

    isSoloMode = true; 
    gameActive = true;
    sprintLinesCleared = 0;
    sprintStartTime = performance.now(); 
    
    document.getElementById('opp-section').style.opacity = "0.1";
    myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    myPlayerReset();
    startSprintRealtimeTimer(); 

    if (backupNum) {
        document.getElementById('status-msg').innerText = "⏱️ 연습 모드 가동 중 (상대 난입 대기)...";
        document.getElementById('custom-room-display').innerHTML = 
            `유지 중인 방 코드: <span style="color: #fff; background: #9b59b6; padding: 3px 10px; border-radius: 4px; font-size: 16px; font-weight: bold;">${backupNum}</span>`;
    } else {
        document.getElementById('status-msg').innerText = "⏱️ 연습 모드 가동 중...";
    }
});

socket.on('rematch_triggered', function(data) {
    if (sprintTimerInterval) clearInterval(sprintTimerInterval);
    resetAllBoardStates();
});

socket.on('opponent_left', function() {
    console.log("🔌 상대방의 접속 종료가 감지되어 상대방 화면을 완전히 청소합니다.");
    
    // 1. 메모리에 잔존하는 상대방 지형 데이터 구조 0으로 올 클리어
    oppGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    oppGame.score = 0;
    if (oppGame.scoreElement) oppGame.scoreElement.innerText = 0;
    oppGame.holdType = null;
    oppGame.nextQueue = [];
    oppGame.pendingAttacks = 0;
    
    // 🛡️ [초핵심] 객체 껍데기만 남겨두지 않고 완전한 null로 찢어버려,
    // mainLoop 조건문(if (oppGame.player)) 자체를 원천 탈락시켜 잔상 렌더링을 완전히 차단합니다!
    oppGame.player = null;
    
    // 공격 게이지 물리 리셋
    if (oppGame.gaugeElement) updateAttackGauge(oppGame.gaugeElement, 0);

    // 2. 캔버스 강제 물리 드로잉 리프레시 (검은 도화지로 즉시 덮어쓰기)
    // 이 처리를 수동으로 한 번 해줘야 픽셀 버퍼에 고여있던 유령 블록이 100% 증발합니다.
    drawGrid(oppGame.ctx, oppGame.canvas);
    drawMatrix(oppGame.board, {x:0, y:0}, null, oppGame.ctx);

    // 3. 상대방 미니 프리뷰 캔버스(NEXT, HOLD) 원본 함수 예외 우회 강제 청소
    if (oppGame.holdCtx && oppGame.holdCanvas) {
        oppGame.holdCtx.fillStyle = '#000';
        oppGame.holdCtx.fillRect(0, 0, oppGame.holdCanvas.width, oppGame.holdCanvas.height);
    }
    if (oppGame.nextCtx && oppGame.nextCanvas) {
        oppGame.nextCtx.fillStyle = '#000';
        oppGame.nextCtx.fillRect(0, 0, oppGame.nextCanvas.width, oppGame.nextCanvas.height);
    }
    
    // 4. 상대방 구역 섹션을 반투명하게 흐리게 만들어 빈방임을 가시화
    const oppSec = document.getElementById('opp-section');
    if (oppSec) oppSec.style.opacity = "0.2";
    
    // 5. 내 게임 동결 (연습모드는 멈추지 않되 대전 세션 완전 Off)
    gameActive = false;
});

mainLoop();

// 💡 1. DOM 요소 바인딩 가드 (입력 및 전송 버튼 전용)
window.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input-field');
    const chatBtn = document.querySelector('#jikong-chat-panel button.menu-btn');

    if (chatInput) {
        // 채팅창 입력 중 테트리스 블록 조작키 오염 방지 가드
        chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation(); 
            if (e.keyCode === 13) { 
                executeSendChatMessage();
            }
        });
    }

    if (chatBtn) {
        // [전송] 버튼 클릭 이벤트 연동 (인라인 onclick 흔적 완전 박멸)
        chatBtn.removeAttribute('onclick'); 
        chatBtn.addEventListener('click', () => {
            executeSendChatMessage();
        });
    }
});

// 🚀 2. 채팅 전송 핵심 함수 (글로벌 룸 ID 스냅샷 실시간 추적)
function executeSendChatMessage() {
    const inputField = document.getElementById('chat-input-field');
    if (!inputField) return;
    
    const message = inputField.value.trim();
    if (!message) return; 
    
    // 💡 빠른 매칭 룸 ID(roomId)를 1순위로 강제 징집합니다.
    let activeRoom = roomId || (customRoomNum ? "custom_room_" + customRoomNum : null);
    
    console.log("📤 [JIKONG CHAT 발사] 타겟 채널 주소 ➔", activeRoom);

    if (!activeRoom) { 
        alert("방을 개설하거나 빠른 매칭을 시작한 뒤 대화가 가능합니다!"); 
        return; 
    }

    const currentRole = myRole || customRoomRole || 'p2';

    socket.emit('send_room_chat', {
        roomId: activeRoom,
        role: currentRole,
        msg: message
    });

    inputField.value = ""; 
    inputField.focus();    
}

// 🎯 3. [★초초초핵심 개혁] 변수 꼬임 필터를 완전 삭제한 '글로벌 강제 렌더링' 수신 리스너!
// 💡 가드 바깥으로 독립 배치하여 소켓 패킷 유실을 원천 차단합니다.
socket.off('receive_room_chat'); // 중복 바인딩 버그 완전 세척
socket.on('receive_room_chat', function(data) {
    console.log("📥 [JIKONG CHAT] 화면 주입 패킷 실제 도달 ➔", data);
    
    // 1대1 대전 뷰(#view-pvp) 내부의 진짜 대화창 로그 박스를 정밀 조준합니다![cite: 4]
    const pvpView = document.getElementById('view-pvp');
    if (!pvpView) return;
    const logBox = pvpView.querySelector('#chat-log-box');
    if (!logBox) return;
    
    // 초기 환영 안내문 문구가 들어있다면 최초 한 번 증발[cite: 10]
    if (logBox.innerHTML.includes('통합 채팅 채널')) {
        logBox.innerHTML = '';
    }

    // 💡 [유저님 요청] 방장/도전자 명칭을 전면 폐지하고 p1, p2 태그로 칼성형!
    let badgeColor = '#e67e22'; // p2 기본 컬러 (오렌지)
    let badgeName = '[p2]';
    
    // 데이터의 role 값이 p1 문자를 포함하고 있다면 블루팀 p1으로 고정 판정
    if (data.role && data.role.toString().includes('p1')) {
        badgeColor = '#3498db'; // p1 기본 컬러 (블루)
        badgeName = '[p1]';
    }
    
    // 가독성을 위해 대화 텍스트는 깔끔한 흰색 볼드로 통일
    let textStyle = "color: #ffffff; font-weight: bold;"; 

    // 🎨 도큐먼트 로우 생성 (긴 타자 틀 깨짐 방지 락 포함)[cite: 10]
    const chatRow = document.createElement('div');
    chatRow.style.margin = "5px 0";
    chatRow.style.wordBreak = "break-all"; 
    chatRow.innerHTML = `<span style="color: ${badgeColor}; font-weight: bold; margin-right: 6px;">${badgeName}</span><span style="${textStyle}">${data.msg}</span>`;
    
    // 🚀 진짜 1대1 채팅창 화면에 미련 없이 강제 주입 슛![cite: 10]
    logBox.appendChild(chatRow);
    logBox.scrollTop = logBox.scrollHeight; // 스크롤 하단 자동 고정[cite: 10]
});