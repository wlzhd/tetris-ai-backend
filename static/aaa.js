// aaa.js
console.log(window.location.origin);
const socket = io(window.location.origin);

let roomId = null;
let myRole = null;
let gameActive = false;
let isSoloMode = false;
let myComboCount = -1;

let lastActionWasRotate = false; // 💡 T-Spin 검증용: 마지막 행동이 회전이었는가?
let myBackToBackActive = false;  // 💡 B2B 연속 보너스 플래그

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

// ==========================================================================
// 🔄 [글로벌 표준 사양] 공식 SRS (Super Rotation System) 킥 데이터 엔진
// ==========================================================================
// T, L, J, S, Z 일반 미노용 표준 5단계 킥 매핑 데이터 테이블
const SRS_KICK_DATA = {
    '0->1': [{x:0, y:0}, {x:-1, y:0}, {x:-1, y:-1}, {x:0, y:2}, {x:-1, y:2}],
    '1->0': [{x:0, y:0}, {x:1, y:0}, {x:1, y:1}, {x:0, y:-2}, {x:1, y:-2}],
    '1->2': [{x:0, y:0}, {x:1, y:0}, {x:1, y:1}, {x:0, y:-2}, {x:1, y:-2}],
    '2->1': [{x:0, y:0}, {x:-1, y:0}, {x:-1, y:-1}, {x:0, y:2}, {x:-1, y:2}],
    '2->3': [{x:0, y:0}, {x:1, y:0}, {x:1, y:-1}, {x:0, y:2}, {x:1, y:2}],
    '3->2': [{x:0, y:0}, {x:-1, y:0}, {x:-1, y:1}, {x:0, y:-2}, {x:-1, y:-2}],
    '3->0': [{x:0, y:0}, {x:-1, y:0}, {x:-1, y:1}, {x:0, y:-2}, {x:-1, y:-2}],
    '0->3': [{x:0, y:0}, {x:1, y:0}, {x:1, y:-1}, {x:0, y:2}, {x:1, y:2}]
};

// 💡 [초핵심 패치] 누락되었던 일자(I) 블록 전용 독자 SRS 벽차기 오프셋 테이블 완벽 탑재!
const SRS_I_KICK_DATA = {
    '0->1': [{x:0, y:0}, {x:-2, y:0}, {x:1, y:0}, {x:-2, y:1}, {x:1, y:-2}],
    '1->0': [{x:0, y:0}, {x:2, y:0}, {x:-1, y:0}, {x:2, y:-1}, {x:-1, y:2}],
    '1->2': [{x:0, y:0}, {x:-1, y:0}, {x:2, y:0}, {x:-1, y:-2}, {x:2, y:1}],
    '2->1': [{x:0, y:0}, {x:1, y:0}, {x:-2, y:0}, {x:1, y:2}, {x:-2, y:-1}],
    '2->3': [{x:0, y:0}, {x:2, y:0}, {x:-1, y:0}, {x:2, y:-1}, {x:-1, y:2}],
    '3->2': [{x:0, y:0}, {x:-2, y:0}, {x:1, y:0}, {x:-2, y:1}, {x:1, y:-2}],
    '3->0': [{x:0, y:0}, {x:1, y:0}, {x:-2, y:0}, {x:1, y:2}, {x:-2, y:-1}],
    '0->3': [{x:0, y:0}, {x:-1, y:0}, {x:2, y:0}, {x:-1, y:-2}, {x:2, y:1}]
};

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

// 🔄 블록 소환 및 회전 차수(Facing) 완벽 초기화 리셋 엔진
function myPlayerReset() {
    if (myGame.nextQueue.length < 7) {
        myGame.nextQueue.push(...generateSharedBag());
    }
    
    myGame.player.matrix = myGame.nextQueue.shift();
    myGame.player.type = getPieceType(myGame.player.matrix); 
    myGame.player.color = SHAPES[myGame.player.type] ? SHAPES[myGame.player.type].color : '#fff';
    
    // 💡 [초핵심] 새 블록이 하늘에서 등장할 때는 무조건 회전 방향을 0(정방향)으로 완벽 세척 고정합니다!
    myGame.player.currentFacing = 0; 
    
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
                if (sprintTimerInterval) clearInterval(sprintTimerInterval); 

                if (!isSoloMode && roomId) {
                    socket.emit('game_over_event', { roomId: roomId });
                } else {
                    showControlButtonsAgain();
                    alert("💥 블록 소환 불가로 인한 GAME OVER 💥");
                    gameActive = false;
                }
                return;
            }
        }
    }
    myGame.canSwap = true;
    updateNextPreview(); 
    sendGameSync();
}

// 🔄 매트릭스 내부 블록 고유 번호로 타입을 100% 탐지해내는 고정밀 판정 엔진
function getPieceType(matrix) {
    if (!matrix) return 'I';
    if (matrix.length === 4) return 'I';
    if (matrix.length === 2) return 'O';
    
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            let val = matrix[y][x];
            if (val === 1) return 'I';
            if (val === 2) return 'O';
            if (val === 3) return 'T';
            if (val === 4) return 'L';
            if (val === 5) return 'J';
            if (val === 6) return 'S';
            if (val === 7) return 'Z';
        }
    }
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
    else { myGame.lockDelayTimer = 0; lastActionWasRotate = false; sendGameSync(); }
}

function myPlayerDrop() {
    if (!gameActive) return;
    myGame.player.pos.y++;
    if (collide(myGame.board, myGame.player)) {
        myGame.player.pos.y--;
        return false;
    }
    myGame.lockDelayTimer = 0;
    lastActionWasRotate = false;
    sendGameSync();
    return true;
}

function getRotatedMatrix(matrix, dir) {
    if (!matrix) return null;
    let n = matrix.length;
    // 원본 데이터 오염 방지를 위해 깊은 사본(Deep Copy) 생성
    let temp = matrix.map(row => [...row]);
    
    // 💡 [초핵심 개혁] 180도 회전(dir === 2)은 전치 연산을 거치면 축이 파괴됩니다!
    // 따라서 90도 회전(시계/반시계)일 때만 행과 열을 뒤바꾸는 전치 연산을 가동합니다.
    if (dir === 1 || dir === -1) {
        for (let y = 0; y < n; ++y) {
            for (let x = 0; x < y; ++x) {
                [temp[x][y], temp[y][x]] = [temp[y][x], temp[x][y]];
            }
        }
    }
    
    // 🎨 회전 방향 차수에 따른 최종 대칭 매핑
    if (dir === 1) {
        temp.forEach(row => row.reverse()); // 시계 90도 (X 키, ↑ 화살표)
    } else if (dir === -1) {
        temp.reverse();                     // 반시계 90도 (Z 키)
    } else if (dir === 2) {
        // ✨ 순정 180도 점대칭 공식: 전치 없이 배열 전체 상하 반전 후 모든 행 좌우 반전!
        temp.reverse(); 
        temp.forEach(row => row.reverse()); // 180도 회전 (A 키)
    }
    return temp;
}

// 🎯 [벽면 굳음 및 I블록 먹통 완벽 해결] 시뮬레이션 기반 통합 SRS 회전 컨트롤러
function myPlayerRotate(dir) {
    if (!gameActive || !myGame.player.matrix) return;

    const origX = myGame.player.pos.x;
    const origY = myGame.player.pos.y;
    const origMat = myGame.player.matrix;
    const pieceType = myGame.player.type;

    if (pieceType === 'O') {
        lastActionWasRotate = true;
        sendGameSync();
        return;
    }

    // 1. 현재 회전 상태 추적 (undefined 일 시 0)
    let currentFacing = myGame.player.currentFacing !== undefined ? myGame.player.currentFacing : 0;

    // 2. 입력 키(dir)에 따른 다음 회전 타겟 계산 (0:상, 1:우, 2:하, 3:좌)
    let nextFacing = currentFacing;
    if (dir === 1) nextFacing = (currentFacing + 1) % 4;        // 시계 (X, ↑ 화살표)
    else if (dir === -1) nextFacing = (currentFacing + 3) % 4;   // 반시계 (Z)
    else if (dir === 2) nextFacing = (currentFacing + 2) % 4;    // 180도 (A)

    // 3. 가상 회전 복사본 생성
    const nextMatrix = getRotatedMatrix(origMat, dir);

    // 선 충돌 제거: 오직 회전 후 사본 미노 상태만 가지고 목적지 최종 검증
    let testPlayer = {
        pos: { x: origX, y: origY },
        matrix: nextMatrix
    };

    // 4. 블록 유형에 맞춰 킥 딕셔너리 조준
    const kickKey = `${currentFacing}->${nextFacing}`;
    const kicks = (pieceType === 'I') ? (SRS_I_KICK_DATA[kickKey] || [{x:0, y:0}]) : (SRS_KICK_DATA[kickKey] || [{x: 0, y: 0}]);

    let success = false;
    for (let kick of kicks) {
        // 💡 [초핵심 정밀 보정 1] 왼쪽 TST('3->0')나 반대 방향 킥일 때 
        // 가로축(X)이 벽이나 지형에 막히지 않고 반대편 빈 공간으로 유연하게 탈출하도록 
        // 1차적으로 기본 오프셋을 부드럽게 대입합니다.
        testPlayer.pos.x = origX + kick.x;
        testPlayer.pos.y = origY + kick.y; 

        if (!collide(myGame.board, testPlayer)) {
            success = true;
            break;
        }

        // 💡 [초핵심 정밀 보정 2] 왼쪽 벽면 마찰 꼬임 해결 가드
        // 만약 대칭축 에러로 충돌했다면, X축을 강제로 반전(-kick.x)시켜 
        // 블록을 벽 안쪽이 아닌 오른쪽 빈틈으로 밀어 넣으며 아래로 관통시킵니다!
        testPlayer.pos.x = origX - kick.x;
        testPlayer.pos.y = origY + kick.y; 

        if (!collide(myGame.board, testPlayer)) {
            success = true;
            break;
        }

        // 💡 [초핵심 정밀 보정 3] 위로 튕김 방지 가드 
        testPlayer.pos.x = origX + kick.x;
        testPlayer.pos.y = origY - kick.y; 
        if (testPlayer.pos.y >= origY) { // 오직 아래쪽이거나 제자리일 때만 승인!
            if (!collide(myGame.board, testPlayer)) {
                success = true;
                break;
            }
        }
    }

    // 5. 시뮬레이션 최종 대성공 시에만 유저 실제 조각 데이터 변형 최종 승인!
    if (success) {
        myGame.player.matrix = nextMatrix;
        myGame.player.pos.x = testPlayer.pos.x;
        myGame.player.pos.y = testPlayer.pos.y;
        myGame.player.currentFacing = nextFacing; // 현재 회전 상태 갱신
        myGame.lockDelayTimer = 0;
        lastActionWasRotate = true; // T-Spin 판정 추적 활성화
        sendGameSync();
    } else {
        // 모든 필터 실패 시 안전 보존
        myGame.player.pos.x = origX;
        myGame.player.pos.y = origY;
        myGame.player.matrix = origMat;
    }
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
    lastActionWasRotate = false;
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
    
    myGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    myGame.score = 0; 
    if (myGame.scoreElement) myGame.scoreElement.innerText = 0; 
    myGame.holdType = null; myGame.nextQueue = []; myGame.currentBag = [];
    myGame.pendingAttacks = 0; myComboCount = -1;
    updateAttackGauge(myGame.gaugeElement, 0);
    
    oppGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    oppGame.score = 0; 
    if (oppGame.scoreElement) oppGame.scoreElement.innerText = 0;
    oppGame.holdType = null; oppGame.nextQueue = []; 
    oppGame.player = { pos: {x: 0, y: 0}, matrix: null, color: '' }; 
    oppGame.pendingAttacks = 0;
    updateAttackGauge(oppGame.gaugeElement, 0);

    drawHold(myGame.holdCtx, myGame.holdCanvas, null);
    drawHold(oppGame.holdCtx, oppGame.holdCanvas, null);

    const logBox = document.getElementById('chat-log-box');
    if (logBox) {
        logBox.innerHTML = `<div style="color: #666; font-style: italic; text-align: center; font-size: 11px; margin-top: 180px;">[ 대기실 / 인게임 통합 채팅 채널 ]</div>`;
    }
}

function updateNextPreview() {
    const types = myGame.nextQueue.slice(0, 4).map(m => getPieceType(m));
    drawNext(myGame.nextCtx, myGame.nextCanvas, types);
}

function startSprintRealtimeTimer() {
    if (sprintTimerInterval) clearInterval(sprintTimerInterval);
    
    sprintTimerInterval = setInterval(() => {
        if (!gameActive) return;
        const now = performance.now();
        const currentSec = ((now - sprintStartTime) / 1000).toFixed(2);
        document.getElementById('status-msg').innerText = `⏱️ 스프린트 진행 중 | 시간: ${currentSec}s | 줄: ${sprintLinesCleared} / ${SPRINT_TARGET_LINES}`;
    }, 30); 
}

document.getElementById('btn-start').addEventListener('click', () => {
    resetAllBoardStates();
    isSoloMode = false;
    
    customRoomNum = null; 
    customRoomRole = null;
    roomId = null;
    myRole = null;

    const roomDisplay = document.getElementById('custom-room-display');
    if (roomDisplay) roomDisplay.innerHTML = "";

    document.getElementById('opp-section').style.opacity = "0.3";
    document.getElementById('status-msg').innerText = "상대 플레이어를 검색 중입니다...";
    socket.emit('request_match'); 
});

document.getElementById('btn-solo').addEventListener('click', () => {
    const savedRoomId = roomId;
    const savedMyRole = myRole;

    resetAllBoardStates();
    
    roomId = savedRoomId;
    myRole = savedMyRole;
    
    isSoloMode = true; 
    gameActive = true;
    sprintLinesCleared = 0;
    sprintStartTime = performance.now(); 
    
    document.getElementById('opp-section').style.opacity = "0.1";
    
    myGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    myPlayerReset();
    startSprintRealtimeTimer(); 

    if (savedRoomId) {
        const pureNum = savedRoomId.replace("room_", "");
        document.getElementById('status-msg').innerHTML = 
            `🏠 유지 중인 방 코드: <span style="color: #f1c40f; font-size: 20px; font-weight: bold; background: #000; padding: 2px 8px; border-radius: 4px;">${pureNum}</span> (혼자 연습 중...)<br>` +
            `<span style="color: #2ecc71; font-size: 12px; font-weight: bold;">상대방이 이 코드를 치고 들어오면 대전 버튼이 다시 활성화됩니다!</span>`;
    } else {
        document.getElementById('status-msg').innerText = "⏱️ 연습 모드 가동 중...";
    }
});

if (document.getElementById('btn-restart')) {
    document.getElementById('btn-restart').onclick = function() {
        if (typeof roomId !== 'undefined' && roomId) {
            document.getElementById('status-msg').innerHTML = `🔄 상대방에게 재대결 요청을 보내는 중...`;
            socket.emit('request_rematch', { room_id: roomId, role: myRole });
        } else {
            if (typeof resetGame === 'function') resetGame(); 
        }
    };
}

socket.on('rematch_triggered', function(data) {
    document.getElementById('status-msg').innerHTML = `⚔️ <span style="color: #e74c3c; font-weight:bold;">리턴 매치 성사!</span> 곧 다음 판이 시작됩니다!`;
    resetAllBoardStates();
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
    if (customRoomNum) {
        console.log("⚠️ 커스텀 방 모드 활성화 중이므로 공용 status 메시지를 무시합니다:", msg);
        return; 
    }
    if(!isSoloMode) document.getElementById('status-msg').innerText = msg; 
});

socket.on('match_start', (data) => {
    resetAllBoardStates();

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
        
        if (!isSoloMode && roomId) {
            socket.emit('game_over_event', { roomId: roomId });
        } else {
            showControlButtonsAgain();
            alert("💥 쓰레기 블록 폭격으로 인한 GAME OVER 💥");
            gameActive = false; 
        }
    return;
}
    sendGameSync(); 
}

function mergeAndSweep() {
    let isTSpin = false;
    let isTSpinMini = false;

    if (myGame.player.type === 'T' && lastActionWasRotate) {
        const px = myGame.player.pos.x;
        const py = myGame.player.pos.y;
        
        const cx = px + 1;
        const cy = py + 1;

        const corners = [
            {x: cx - 1, y: cy - 1}, 
            {x: cx + 1, y: cy - 1}, 
            {x: cx - 1, y: cy + 1}, 
            {x: cx + 1, y: cy + 1}  
        ];

        let occupiedCount = 0;
        corners.forEach(c => {
            if (c.x < 0 || c.x >= 10 || c.y >= 20) { occupiedCount++; }
            else if (c.y >= 0 && myGame.board[c.y][c.x] !== 0) { occupiedCount++; }
        });

        if (occupiedCount >= 3) {
            const mat = myGame.player.matrix;
            let facing = 0; 
            if (mat[0][1] !== 0) facing = 0;
            else if (mat[1][2] !== 0) facing = 1;
            else if (mat[2][1] !== 0) facing = 2;
            else if (mat[1][0] !== 0) facing = 3;

            let faceCorners = [];
            if (facing === 0) faceCorners = [0, 1];      
            else if (facing === 1) faceCorners = [1, 3]; 
            else if (facing === 2) faceCorners = [2, 3]; 
            else if (facing === 3) faceCorners = [0, 2]; 

            let faceOccupied = 0;
            faceCorners.forEach(idx => {
                const c = corners[idx];
                if (c.x < 0 || c.x >= 10 || c.y >= 20) { faceOccupied++; }
                else if (c.y >= 0 && myGame.board[c.y][c.x] !== 0) { faceOccupied++; }
            });

            if (faceOccupied === 2) {
                isTSpin = true;
            } else {
                isTSpin = true;
                isTSpinMini = true;
            }
        }
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
    let technicalName = "";

    if (isTSpin) {
        if (rowsCleared === 0) { myPower = 0; technicalName = "T-Spin Status"; }
        else if (rowsCleared === 1) { myPower = isTSpinMini ? 0 : 2; technicalName = isTSpinMini ? "T-Spin Mini Single" : "T-Spin Single"; }
        else if (rowsCleared === 2) { myPower = 4; technicalName = "T-Spin Double"; }
        else if (rowsCleared === 3) { myPower = 6; technicalName = "🔥 T-Spin Triple 🔥"; } 
    } else {
        if (rowsCleared === 1) myPower = 0;
        else if (rowsCleared === 2) myPower = 1;
        else if (rowsCleared === 3) myPower = 2;
        else if (rowsCleared === 4) { myPower = 4; technicalName = "⚡ TETRIS ⚡"; }
    }

    let isDifficultAction = (rowsCleared === 4 || (isTSpin && rowsCleared > 0));
    if (rowsCleared > 0) {
        if (isDifficultAction) {
            if (myBackToBackActive) {
                myPower += 1; 
                technicalName = "✨ B2B " + technicalName;
            }
            myBackToBackActive = true;
        } else {
            myBackToBackActive = false; 
        }
    }

    if (rowsCleared > 0 && myComboCount > 0) {
        if (myComboCount >= 1 && myComboCount <= 2) myPower += 1;
        else if (myComboCount >= 3 && myComboCount <= 4) myPower += 2;
        else if (myComboCount >= 5 && myComboCount <= 6) myPower += 3;
        else if (myComboCount >= 7) myPower += 4;
    }

    if (isPerfectClear) {
        myPower += 10;
        technicalName = "🎆 PERFECT CLEAR 🎆";
    }

    if (technicalName && rowsCleared > 0 && !isSoloMode) {
        document.getElementById('status-msg').innerHTML = `<span style="color:#f1c40f; font-weight:bold; font-size:16px;">${technicalName} 발동! (+${myPower} Line Attack)</span>`;
    }

    if (isSoloMode && rowsCleared > 0) {
        sprintLinesCleared += rowsCleared;
        if (myGame.scoreElement) myGame.scoreElement.innerText = sprintLinesCleared;

        if (sprintLinesCleared >= SPRINT_TARGET_LINES) {
            gameActive = false;
            if (sprintTimerInterval) clearInterval(sprintTimerInterval);
            const endTime = performance.now();
            const finalTimeSec = ((endTime - sprintStartTime) / 1000).toFixed(2);
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

    lastActionWasRotate = false;
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

let customRoomNum = null;   
let customRoomRole = null;

function createCustomRoom() {
    resetAllBoardStates();

    customRoomNum = Math.floor(1000 + Math.random() * 9000).toString();
    customRoomRole = 'p1'; 
    roomId = "custom_room_" + customRoomNum; 
    myRole = 'p1';

    showControlButtonsAgain();

    document.getElementById('status-msg').innerText = "🏠 새로운 커스텀 대기실이 개설되었습니다.";
    document.getElementById('custom-room-display').innerHTML = 
        `방 코드: <span style="color: #fff; background: #9b59b6; padding: 3px 10px; border-radius: 4px; font-size: 16px; font-weight: bold;">${customRoomNum}</span> (상대 대기 중...)`;
    
    socket.emit('create_custom_room', { room_id: customRoomNum });
}

let isJoinProcessing = false; 

function joinCustomRoom() {
    if (isJoinProcessing) return;
    isJoinProcessing = true;

    const inputVal = document.getElementById('input-room-id').value.trim();
    if (!inputVal) { alert("방 코드를 입력해주세요!"); isJoinProcessing = false; return; }
    
    if (customRoomNum === inputVal && customRoomRole === 'p2') {
        console.log("⚠️ [안심 복구] 이미 접속된 방입니다. 서버 패킷 송출을 차단하고 UI를 고정합니다.");
        
        document.getElementById('status-msg').innerHTML = `🤝 <span style="color: #f1c40f; font-weight:bold;">방에 정상 입장했습니다!</span><br><span style="font-size: 13px; color: #ccc;">방장 플레이어의 게임 시작을 기다리는 중... ⏳</span>`;
        document.getElementById('custom-room-display').innerHTML = `접속 중인 방: <span style="color: #2ecc71; font-weight: bold;">${customRoomNum}</span>`;
        
        isJoinProcessing = false;
        return;
    }
    
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

function startCustomMatch() {
    let pureNum = customRoomNum;
    if (!pureNum && roomId) {
        pureNum = roomId.replace("custom_room_", "").replace("room_", "");
    }
    if (!pureNum) return;

    socket.emit('start_custom_match', { room_id: pureNum.trim() });
}

socket.on('match_start_custom', function(data) {
    isJoinProcessing = false; 
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
    
    oppGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    oppGame.score = 0;
    if (oppGame.scoreElement) oppGame.scoreElement.innerText = 0;
    oppGame.holdType = null;
    oppGame.nextQueue = [];
    oppGame.pendingAttacks = 0;
    
    oppGame.player = null;
    
    if (oppGame.gaugeElement) updateAttackGauge(oppGame.gaugeElement, 0);

    drawGrid(oppGame.ctx, oppGame.canvas);
    drawMatrix(oppGame.board, {x:0, y:0}, null, oppGame.ctx);

    if (oppGame.holdCtx && oppGame.holdCanvas) {
        oppGame.holdCtx.fillStyle = '#000';
        oppGame.holdCtx.fillRect(0, 0, oppGame.holdCanvas.width, oppGame.holdCanvas.height);
    }
    if (oppGame.nextCtx && oppGame.nextCanvas) {
        oppGame.nextCtx.fillStyle = '#000';
        oppGame.nextCtx.fillRect(0, 0, oppGame.nextCanvas.width, oppGame.nextCanvas.height);
    }
    
    const oppSec = document.getElementById('opp-section');
    if (oppSec) oppSec.style.opacity = "0.2";
    
    gameActive = false;
});

mainLoop();

// ==========================================================================
// 💬 [JIKONG TRIS 우측 독립 패널 전용 실시간 웹소켓 채팅 엔진 - ★진짜 100% 최종장]
// ==========================================================================

window.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input-field');
    const chatBtn = document.querySelector('#jikong-chat-panel button.menu-btn');

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation(); 
            if (e.keyCode === 13) { 
                executeSendChatMessage();
            }
        });
    }

    if (chatBtn) {
        chatBtn.removeAttribute('onclick'); 
        chatBtn.addEventListener('click', () => {
            executeSendChatMessage();
        });
    }
});

function executeSendChatMessage() {
    const inputField = document.getElementById('chat-input-field');
    if (!inputField) return;
    
    const message = inputField.value.trim();
    if (!message) return; 
    
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

socket.off('receive_room_chat'); 
socket.on('receive_room_chat', function(data) {
    console.log("📥 [JIKONG CHAT] 화면 주입 패킷 실제 도달 ➔", data);
    
    const logBox = document.getElementById('chat-log-box');
    if (!logBox) return;
    
    if (logBox.innerHTML.includes('통합 채팅 채널')) {
        logBox.innerHTML = '';
    }

    let badgeColor = '#e67e22'; 
    let badgeName = '[p2]';
    
    if (data.role && data.role.toString().includes('p1')) {
        badgeColor = '#3498db'; 
        badgeName = '[p1]';
    }
    
    let textStyle = "color: #ffffff; font-weight: bold;"; 

    const newChatRowHtml = `<div style="margin: 5px 0; word-break: break-all; text-align: left;"><span style="color: ${badgeColor}; font-weight: bold; margin-right: 6px;">${badgeName}</span><span style="${textStyle}">${data.msg}</span></div>`;
    
    logBox.innerHTML += newChatRowHtml;
    
    logBox.scrollTop = logBox.scrollHeight; 
});

socket.on('match_finished_trigger', function(data) {
    console.log("💥 실시간 배틀 라운드가 공식 종료되었습니다. 대기실 제어권을 복구합니다.");
    
    gameActive = false;
    if (sprintTimerInterval) clearInterval(sprintTimerInterval);

    showControlButtonsAgain();

    if (socket.id === data.loser) {
        document.getElementById('status-msg').innerHTML = 
            `<span style="color: #e74c3c; font-weight:bold; font-size: 18px;">DEFEAT (패배) 😭</span><br>` +
            `<span style="font-size: 12px; color: #aaa;">다시 시작하려면 [다시시작] 버튼이나 방장의 재경기 신호를 기다리세요.</span>`;
    } else {
        document.getElementById('status-msg').innerHTML = 
            `<span style="color: #2ecc71; font-weight:bold; font-size: 18px;">🎉 WINNER WINNER! 승리했습니다! 🎉</span><br>` +
            `<span style="font-size: 12px; color: #aaa;">우측 [다시시작] 버튼을 눌러 리턴 매치를 요청할 수 있습니다.</span>`;
    }
});