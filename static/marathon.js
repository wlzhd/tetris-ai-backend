// marathon.js
console.log("🏆 클래식 마라톤 챌린지 엔진 V1.1 가동 (속도 제한 전면 철거 & 무한 가속도 시스템 런칭).");

let marathonActive = false;
let marathonLines = 0;
let marathonLevel = 1;
let marathonScore = 0;
let marathonCombo = -1;
const MARATHON_BLOCK_SIZE = 24;

const maraKeys = {};

let maraDasTimer = 0;      
let maraArrTimer = 0;      
let maraSoftDropTimer = 0; 

let MARA_DAS_DELAY_MS = 150;  
let MARA_ARR_FRAME_RATE = 1;  
let MARA_SOFT_DROP_RATE = 25; 

// 💡 [개혁] 구형 LEVEL_SPEEDS 테이블은 전면 삭제하고 실시간 무한 가속 공식으로 대체합니다!

let marathonGame = {
    canvas: document.getElementById('marathon-tetris'), ctx: document.getElementById('marathon-tetris').getContext('2d'),
    holdCanvas: document.getElementById('marathon-hold'), holdCtx: document.getElementById('marathon-hold').getContext('2d'),
    nextCanvas: document.getElementById('marathon-next'), nextCtx: document.getElementById('marathon-next').getContext('2d'),
    board: Array.from({length: 20}, () => Array(10).fill(0)),
    player: { pos: {x: 0, y: 0}, matrix: null, color: '', type: '' },
    nextQueue: [], holdType: null, canSwap: true, dropCounter: 0, dropInterval: 1000,
    lockDelayTimer: 0, lockTotalHighestTimer: 0
};

// 감도 제어부 바인딩
document.getElementById('marathon-setting-arr').addEventListener('input', (e) => {
    const val = parseInt(e.target.value); MARA_ARR_FRAME_RATE = Math.floor(val / 20); 
    document.getElementById('marathon-val-arr').innerText = val;
});
document.getElementById('marathon-setting-softdrop').addEventListener('input', (e) => {
    const val = parseInt(e.target.value); MARA_SOFT_DROP_RATE = val; 
    document.getElementById('marathon-val-softdrop').innerText = val;
});

// 키보드 입출력 컨트롤러
document.addEventListener('keydown', e => {
    if (!marathonActive || !document.getElementById('view-marathon').classList.contains('active')) return;
    if (e.repeat) return; maraKeys[e.keyCode] = true;
    if (e.keyCode === 37) { maraDasTimer = 0; maraArrTimer = 0; maraPlayerMove(-1); }
    if (e.keyCode === 39) { maraDasTimer = 0; maraArrTimer = 0; maraPlayerMove(1); }
    if (e.keyCode === 40) maraPlayerDrop();
    if (e.keyCode === 88 || e.keyCode === 38) maraPlayerRotate(1); 
    if (e.keyCode === 90) maraPlayerRotate(-1);                   
    if (e.keyCode === 65) maraPlayerRotate(2); 
    if (e.keyCode === 32) maraHardDrop();                         
    if (e.keyCode === 67) maraPlayerHold();                       
});

document.addEventListener('keyup', e => { 
    if (!document.getElementById('view-marathon').classList.contains('active')) return;
    delete maraKeys[e.keyCode]; if (e.keyCode === 37 || e.keyCode === 39) { maraDasTimer = 0; maraArrTimer = 0; }
});

function handleMaraContinuousInput(deltaTime) {
    if (maraKeys[37] || maraKeys[39]) {
        maraDasTimer += deltaTime;
        if (maraDasTimer >= MARA_DAS_DELAY_MS) {
            if (MARA_ARR_FRAME_RATE === 0) {
                const dir = maraKeys[37] ? -1 : 1;
                while (!aiCollide(marathonGame.board, { pos: { x: marathonGame.player.pos.x + dir, y: marathonGame.player.pos.y }, matrix: marathonGame.player.matrix })) { marathonGame.player.pos.x += dir; }
                marathonGame.lockDelayTimer = 0; 
            } else {
                maraArrTimer += deltaTime; const arrInterval = MARA_ARR_FRAME_RATE * 16.6;
                if (maraArrTimer >= arrInterval) { maraPlayerMove(maraKeys[37] ? -1 : 1); maraArrTimer = 0; }
            }
        }
    } else { maraDasTimer = 0; maraArrTimer = 0; }

    if (maraKeys[40]) {
        if (MARA_SOFT_DROP_RATE === 0) { while (maraPlayerDrop()) {} } 
        else {
            maraSoftDropTimer += deltaTime;
            if (maraSoftDropTimer >= MARA_SOFT_DROP_RATE) { maraPlayerDrop(); maraSoftDropTimer = 0; }
        }
    } else { maraSoftDropTimer = 0; }
}

// 🏆 마라톤 시작 버튼 리스너 (포커스 락 완벽 분쇄 가드 포함)
document.getElementById('btn-marathon-start').addEventListener('click', (e) => {
    if (e.target) e.target.blur(); 

    if (typeof gameActive !== 'undefined') gameActive = false;
    if (typeof aiGameActive !== 'undefined') aiGameActive = false;
    
    marathonActive = true;
    marathonLines = 0;
    marathonLevel = 1;
    marathonScore = 0;
    marathonCombo = -1;
    
    marathonGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    marathonGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    marathonGame.holdType = null;
    marathonGame.canSwap = true;
    marathonGame.dropInterval = 1000; // 초기 속도 1000ms 고정
    marathonGame.lockDelayTimer = 0;
    marathonGame.lockTotalHighestTimer = 0;
    marathonGame.pieceDropCount = 0; // 지진 카운터 초기화
    
    document.getElementById('marathon-lines-val').innerText = 0;
    document.getElementById('marathon-level-val').innerText = 1;
    document.getElementById('marathon-score-val').innerText = 0;
    document.getElementById('marathon-level-gauge').style.height = '0%';
    document.getElementById('marathon-status-msg').innerText = "🏆 클래식 마라톤 스타트! 기록을 경신해 보세요!";
    
    maraDrawHold(); maraDrawNextPreview();
    maraPlayerReset();
});

function maraPlayerReset() {
    if (marathonGame.nextQueue.length < 7) marathonGame.nextQueue.push(...generateSharedBag());
    marathonGame.player.matrix = marathonGame.nextQueue.shift();
    marathonGame.player.type = getPieceType(marathonGame.player.matrix);
    marathonGame.player.color = SHAPES[marathonGame.player.type].color;
    marathonGame.player.pos.y = 0;
    marathonGame.player.currentFacing = 0; 
    
    const baseStartX = Math.floor(10 / 2) - Math.floor(marathonGame.player.matrix[0].length / 2);
    if (marathonGame.player.type !== 'I' && marathonGame.player.type !== 'O') {
        marathonGame.player.pos.x = baseStartX - 1;
    } else {
        marathonGame.player.pos.x = baseStartX;
    }
    
    if (aiCollide(marathonGame.board, marathonGame.player)) {
        marathonActive = false;
        document.getElementById('marathon-status-msg').innerText = `💥 GAME OVER (최종 레벨: ${marathonLevel} | 스코어: ${marathonScore})`;
        alert(`🏆 MARATHON FINISH! 🏆\n최종 레벨: ${marathonLevel}\n최종 점수: ${marathonScore}`);
    }
    marathonGame.canSwap = true; maraDrawNextPreview();
}

function maraPlayerMove(dir) {
    marathonGame.player.pos.x += dir;
    if (aiCollide(marathonGame.board, marathonGame.player)) marathonGame.player.pos.x -= dir;
    else { marathonGame.lockDelayTimer = 0; } 
}

function maraPlayerDrop() {
    marathonGame.player.pos.y++;
    if (aiCollide(marathonGame.board, marathonGame.player)) { marathonGame.player.pos.y--; return false; }
    marathonGame.lockDelayTimer = 0; return true;
}

function maraHardDrop() {
    while (!aiCollide(marathonGame.board, marathonGame.player)) marathonGame.player.pos.y++;
    marathonGame.player.pos.y--; maraMergeAndSweep();
}

function maraPlayerRotate(dir) {
    if (!marathonActive || !marathonGame.player.matrix) return;

    const origX = marathonGame.player.pos.x;
    const origY = marathonGame.player.pos.y;
    const origMat = marathonGame.player.matrix;
    const pieceType = marathonGame.player.type;

    if (pieceType === 'O') return;

    let currentFacing = marathonGame.player.currentFacing !== undefined ? marathonGame.player.currentFacing : 0;

    let nextFacing = currentFacing;
    if (dir === 1) nextFacing = (currentFacing + 1) % 4;        
    else if (dir === -1) nextFacing = (currentFacing + 3) % 4;   
    else if (dir === 2) nextFacing = (currentFacing + 2) % 4;    

    const nextMatrix = getRotatedMatrix(origMat, dir);

    let testPlayer = {
        pos: { x: origX, y: origY },
        matrix: nextMatrix
    };

    const kickKey = `${currentFacing}->${nextFacing}`;
    const kicks = (pieceType === 'I') ? (SRS_I_KICK_DATA[kickKey] || [{x:0, y:0}]) : (SRS_KICK_DATA[kickKey] || [{x: 0, y: 0}]);

    let success = false;
    for (let kick of kicks) {
        testPlayer.pos.x = origX + kick.x;
        testPlayer.pos.y = origY + kick.y; 
        if (!aiCollide(marathonGame.board, testPlayer)) { success = true; break; }

        testPlayer.pos.x = origX - kick.x;
        testPlayer.pos.y = origY + kick.y; 
        if (!aiCollide(marathonGame.board, testPlayer)) { success = true; break; }

        testPlayer.pos.x = origX + kick.x;
        testPlayer.pos.y = origY - kick.y; 
        if (testPlayer.pos.y >= origY) {
            if (!aiCollide(marathonGame.board, testPlayer)) { success = true; break; }
        }
    }

    if (success) {
        marathonGame.player.matrix = nextMatrix;
        marathonGame.player.pos.x = testPlayer.pos.x;
        marathonGame.player.pos.y = testPlayer.pos.y;
        marathonGame.player.currentFacing = nextFacing; 
        marathonGame.lockDelayTimer = 0;
    } else {
        marathonGame.player.pos.x = origX; marathonGame.player.pos.y = origY; marathonGame.player.matrix = origMat;
    }
}

function maraPlayerHold() {
    if (!marathonGame.canSwap) return;
    if (marathonGame.holdType === null) {
        marathonGame.holdType = marathonGame.player.type; maraPlayerReset();
    } else {
        const temp = marathonGame.holdType; marathonGame.holdType = marathonGame.player.type;
        marathonGame.player.matrix = SHAPES[temp].matrix.map(row => [...row]);
        marathonGame.player.type = temp; marathonGame.player.color = SHAPES[temp].color;
        marathonGame.player.pos.y = 0; 
        const baseStartX = Math.floor(10 / 2) - Math.floor(marathonGame.player.matrix[0].length / 2);
        if (marathonGame.player.type !== 'I' && marathonGame.player.type !== 'O') { marathonGame.player.pos.x = baseStartX - 1; } 
        else { marathonGame.player.pos.x = baseStartX; }
    }
    marathonGame.canSwap = false; maraDrawHold();
}

function maraMergeAndSweep() {
    let isTSpin = false;
    if (marathonGame.player.type === 'T') {
        const cx = marathonGame.player.pos.x + 1; const cy = marathonGame.player.pos.y + 1;
        const corners = [{dx:-1,dy:-1}, {dx:1,dy:-1}, {dx:-1,dy:1}, {dx:1,dy:1}];
        let cCount = 0;
        corners.forEach(c => {
            const tx = cx + c.dx; const ty = cy + c.dy;
            if (tx < 0 || tx >= 10 || ty >= 20 || (ty >= 0 && marathonGame.board[ty][tx] !== 0)) cCount++;
        });
        if (cCount >= 3) isTSpin = true;
    }

    marathonGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) marathonGame.board[y + marathonGame.player.pos.y][x + marathonGame.player.pos.x] = value;
        });
    });
    
    let rowsCleared = 0;
    outer: for (let y = 20 - 1; y > 0; --y) {
        for (let x = 0; x < 10; ++x) { if (marathonGame.board[y][x] === 0) continue outer; }
        const row = marathonGame.board.splice(y, 1)[0].fill(0); marathonGame.board.unshift(row);
        ++y; rowsCleared++;
    }
    
    // 점수 시스템 정산
    if (rowsCleared > 0) {
        marathonCombo++;
        let basePoints = 0;
        if (isTSpin) {
            if (rowsCleared === 1) basePoints = 800;
            else if (rowsCleared === 2) basePoints = 1200;
            else if (rowsCleared === 3) basePoints = 1600; 
        } else {
            if (rowsCleared === 1) basePoints = 100;
            else if (rowsCleared === 2) basePoints = 300;
            else if (rowsCleared === 3) basePoints = 500;
            else if (rowsCleared === 4) basePoints = 800;  
        }
        marathonScore += basePoints * marathonLevel + (marathonCombo > 0 ? marathonCombo * 50 * marathonLevel : 0);
        marathonLines += rowsCleared;
        
        // 🚀 [무한 상한선 철거 및 급진적 가속도 엔진 구동]
        let targetLevel = Math.floor(marathonLines / 10) + 1;
        if (targetLevel > marathonLevel) {
            marathonLevel = targetLevel; // 15 상한선 삭제! 무한 레벨업 활성화
            
            // 🔥 [지수 함수형 무한 가속 공식] 레벨당 이전 레벨 속도의 80% 수준으로 복리 가속(20%씩 고속 단축)
            // 공식: 1000 * (0.80 ^ (Level - 1))
            let dynamicSpeed = Math.round(1000 * Math.pow(0.80, marathonLevel - 1));
            
            // 조작 불능을 방지하기 위해 최소 물리 프레임 하한선(15ms) 가드만 설정
            marathonGame.dropInterval = Math.max(dynamicSpeed, 15);
            
            document.getElementById('marathon-status-msg').innerText = `🎉 LEVEL UP! 레벨: ${marathonLevel} (속도: ${marathonGame.dropInterval}ms) 🎉`;
        }
    } else {
        marathonCombo = -1;
    }

    // 🌋 레벨 8 이상 생존자 전용 쓰레기 블록 습격 시스템
    if (marathonLevel >= 8) {
        if (marathonGame.pieceDropCount === undefined) marathonGame.pieceDropCount = 0;
        marathonGame.pieceDropCount++;

        if (marathonGame.pieceDropCount >= 7) {
            marathonGame.pieceDropCount = 0; 
            marathonGame.board.shift(); 
            
            let garbageRow = Array(10).fill(8); 
            let holeIndex = Math.floor(Math.random() * 10); 
            garbageRow[holeIndex] = 0;
            
            marathonGame.board.push(garbageRow);
            document.getElementById('marathon-status-msg').innerHTML = `⚠️ <span style="color: #e74c3c; font-weight: bold;">[지진 발생] 쓰레기 블록 1줄이 솟구쳤습니다!</span>`;
        }
    }

    // UI 동기화
    document.getElementById('marathon-lines-val').innerText = marathonLines;
    document.getElementById('marathon-level-val').innerText = marathonLevel;
    document.getElementById('marathon-score-val').innerText = marathonScore;
    
    let nextProgress = (marathonLines % 10) * 10;
    document.getElementById('marathon-level-gauge').style.height = nextProgress + '%';
    
    maraPlayerReset();
}

function maraDrawHold() {
    let ctx = marathonGame.holdCtx; ctx.fillStyle = '#000'; ctx.fillRect(0,0,80,80);
    if (marathonGame.holdType) {
        const m = SHAPES[marathonGame.holdType].matrix;
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) { ctx.fillStyle = SHAPES[marathonGame.holdType].color; ctx.fillRect(x*16+10, y*16+10, 16, 16); }
        }));
    }
}

function maraDrawNextPreview() {
    let ctx = marathonGame.nextCtx; ctx.fillStyle = '#000'; ctx.fillRect(0,0,80,240);
    marathonGame.nextQueue.slice(0, 4).forEach((matrix, i) => {
        const type = getPieceType(matrix);
        matrix.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) { 
                ctx.fillStyle = SHAPES[type].color; ctx.fillRect(x*14+10, i*55 + y*14 + 10, 14, 14); 
                ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(x*14+10, i*55 + y*14 + 10, 14, 14);
            }
        }));
    });
}

function drawMaraGhost() {
    if (!marathonGame.player.matrix) return; let ghostPos = { x: marathonGame.player.pos.x, y: marathonGame.player.pos.y };
    while (!aiCollide(marathonGame.board, { pos: { x: ghostPos.x, y: ghostPos.y + 1 }, matrix: marathonGame.player.matrix })) { ghostPos.y++; }
    marathonGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                marathonGame.ctx.globalAlpha = 0.15; marathonGame.ctx.fillStyle = marathonGame.player.color; 
                marathonGame.ctx.fillRect((x + ghostPos.x) * MARATHON_BLOCK_SIZE, (y + ghostPos.y) * MARATHON_BLOCK_SIZE, MARATHON_BLOCK_SIZE, MARATHON_BLOCK_SIZE);
                marathonGame.ctx.globalAlpha = 0.3; marathonGame.ctx.strokeStyle = '#fff'; 
                marathonGame.ctx.strokeRect((x + ghostPos.x) * MARATHON_BLOCK_SIZE, (y + ghostPos.y) * MARATHON_BLOCK_SIZE, MARATHON_BLOCK_SIZE, MARATHON_BLOCK_SIZE);
                marathonGame.ctx.globalAlpha = 1.0; 
            }
        });
    });
}

let maraLastTime = 0;
function marathonMainLoop(time = 0) {
    const deltaTime = time - maraLastTime; maraLastTime = time;
    if (marathonActive && document.getElementById('view-marathon').classList.contains('active')) {
        handleMaraContinuousInput(deltaTime); 
        if (marathonGame.player && marathonGame.player.matrix) {
            let tempPlayer = { pos: { x: marathonGame.player.pos.x, y: marathonGame.player.pos.y + 1 }, matrix: marathonGame.player.matrix };
            if (aiCollide(marathonGame.board, tempPlayer)) {
                marathonGame.lockDelayTimer += deltaTime; marathonGame.lockTotalHighestTimer += deltaTime;
                if (marathonGame.lockDelayTimer >= 1000 || marathonGame.lockTotalHighestTimer >= 3000) { maraMergeAndSweep(); }
            } else {
                marathonGame.lockDelayTimer = 0; marathonGame.lockTotalHighestTimer = 0;
                if (!maraKeys[40]) {
                    marathonGame.dropCounter += deltaTime;
                    if (marathonGame.dropCounter > marathonGame.dropInterval) { maraPlayerDrop(); marathonGame.dropCounter = 0; }
                }
            }
        }
    }
    
    drawGrid(marathonGame.ctx, marathonGame.canvas); drawMatrix(marathonGame.board, {x:0, y:0}, null, marathonGame.ctx); drawMaraGhost();
    if (marathonGame.player && marathonGame.player.matrix) { drawMatrix(marathonGame.player.matrix, marathonGame.player.pos, marathonGame.player.color, marathonGame.ctx); }
    requestAnimationFrame(marathonMainLoop);
}

marathonMainLoop();