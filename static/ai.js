// ai/ai.js
console.log("🤖 지능형 AI 랩 엔진 V7.1 가동 (천장 멈춤 버그 및 홀드 UI 동기화 완료).");

// const aiServerScoket = io("http://127.0.0.1:5000");
const aiServerScoket = io(window.location.origin);

let aiGameActive = false;
let aiBotTimer = null;
let aiMyCombo = -1;
let aiBotCombo = -1;
const AI_BLOCK_SIZE = 24;

const aiKeys = {};

let aiDasTimer = 0;      
let aiArrTimer = 0;      
let aiSoftDropTimer = 0; 

let AI_DAS_DELAY_MS = 150;  
let AI_ARR_FRAME_RATE = 1;  
let AI_SOFT_DROP_RATE = 25; 

const AI_WK_TESTS_90 = [
    {dx: 0, dy: 0}, {dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: 0, dy: 1},   
    {dx: -1, dy: 1}, {dx: 1, dy: 1}, {dx: 0, dy: -1}, {dx: -2, dy: 0}, {dx: 2, dy: 0}    
];

let aiMyGame = {
    canvas: document.getElementById('ai-my-tetris'), ctx: document.getElementById('ai-my-tetris').getContext('2d'),
    holdCanvas: document.getElementById('ai-my-hold'), holdCtx: document.getElementById('ai-my-hold').getContext('2d'),
    nextCanvas: document.getElementById('ai-my-next'), nextCtx: document.getElementById('ai-my-next').getContext('2d'),
    board: Array.from({length: 20}, () => Array(10).fill(0)),
    player: { pos: {x: 0, y: 0}, matrix: null, color: '', type: '' },
    nextQueue: [], holdType: null, canSwap: true, dropCounter: 0, dropInterval: 1000,
    lockDelayTimer: 0, lockTotalHighestTimer: 0, pendingAttacks: 0, attackCounter: 0 
};

let botGame = {
    canvas: document.getElementById('bot-tetris'), ctx: document.getElementById('bot-tetris').getContext('2d'),
    holdCanvas: document.getElementById('bot-hold'), holdCtx: document.getElementById('bot-hold').getContext('2d'),
    nextCanvas: document.getElementById('bot-next'), nextCtx: document.getElementById('bot-next').getContext('2d'),
    board: Array.from({length: 20}, () => Array(10).fill(0)),
    player: { pos: {x: 0, y: 0}, matrix: null, color: '', type: '' },
    nextQueue: [], holdType: null, pendingAttacks: 0, attackCounter: 0, speed: 140 
};

document.getElementById('ai-setting-arr').addEventListener('input', (e) => {
    const val = parseInt(e.target.value); AI_ARR_FRAME_RATE = Math.floor(val / 20); 
    document.getElementById('ai-val-arr').innerText = val;
});
document.getElementById('ai-setting-softdrop').addEventListener('input', (e) => {
    const val = parseInt(e.target.value); AI_SOFT_DROP_RATE = val; 
    document.getElementById('ai-val-softdrop').innerText = val;
});

document.addEventListener('keydown', e => {
    if (!aiGameActive || !document.getElementById('view-ai').classList.contains('active')) return;
    if (e.repeat) return; aiKeys[e.keyCode] = true;
    if (e.keyCode === 37) { aiDasTimer = 0; aiArrTimer = 0; aiPlayerMove(-1); }
    if (e.keyCode === 39) { aiDasTimer = 0; aiArrTimer = 0; aiPlayerMove(1); }
    if (e.keyCode === 40) aiPlayerDrop();
    if (e.keyCode === 88 || e.keyCode === 38) aiPlayerRotate(1); 
    if (e.keyCode === 90) aiPlayerRotate(-1);                   
    if (e.keyCode === 32) aiHardDrop();                         
    if (e.keyCode === 67) aiPlayerHold();                       
});

document.addEventListener('keyup', e => { 
    if (!document.getElementById('view-ai').classList.contains('active')) return;
    delete aiKeys[e.keyCode]; if (e.keyCode === 37 || e.keyCode === 39) { aiDasTimer = 0; aiArrTimer = 0; }
});

function handleAiContinuousInput(deltaTime) {
    if (aiKeys[37] || aiKeys[39]) {
        aiDasTimer += deltaTime;
        if (aiDasTimer >= AI_DAS_DELAY_MS) {
            if (AI_ARR_FRAME_RATE === 0) {
                const dir = aiKeys[37] ? -1 : 1;
                while (!aiCollide(aiMyGame.board, { pos: { x: aiMyGame.player.pos.x + dir, y: aiMyGame.player.pos.y }, matrix: aiMyGame.player.matrix })) { aiMyGame.player.pos.x += dir; }
                aiMyGame.lockDelayTimer = 0; 
            } else {
                aiArrTimer += deltaTime; const arrInterval = AI_ARR_FRAME_RATE * 16.6;
                if (aiArrTimer >= arrInterval) { aiPlayerMove(aiKeys[37] ? -1 : 1); aiArrTimer = 0; }
            }
        }
    } else { aiDasTimer = 0; aiArrTimer = 0; }

    if (aiKeys[40]) {
        if (AI_SOFT_DROP_RATE === 0) { while (aiPlayerDrop()) {} } 
        else {
            aiSoftDropTimer += deltaTime;
            if (aiSoftDropTimer >= AI_SOFT_DROP_RATE) { aiPlayerDrop(); aiSoftDropTimer = 0; }
        }
    } else { aiSoftDropTimer = 0; }
}

document.getElementById('btn-ai-start').addEventListener('click', () => {
    gameActive = false; aiGameActive = true;
    aiMyGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    aiMyGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    aiMyGame.holdType = null; aiMyGame.canSwap = true; aiMyGame.pendingAttacks = 0; aiMyGame.attackCounter = 0;
    aiMyCombo = -1; aiMyGame.lockDelayTimer = 0; aiMyGame.lockTotalHighestTimer = 0;
    document.getElementById('ai-my-attack-count').innerText = 0;
    
    botGame.board = Array.from({length: 20}, () => Array(10).fill(0));
    botGame.nextQueue = [...generateSharedBag(), ...generateSharedBag()];
    botGame.holdType = null; botGame.pendingAttacks = 0; botGame.attackCounter = 0;
    aiBotCombo = -1;
    document.getElementById('bot-attack-count').innerText = 0;
    
    if (currentBotDifficulty === 'easy') botGame.speed = 800;       
    else if (currentBotDifficulty === 'hard') botGame.speed = 140;   
    else botGame.speed = 350;                                        
    
    aiDrawHold(); botDrawHold(); botDrawNextPreview();
    aiPlayerResetUser(); botPlayerReset();
    
    document.getElementById('ai-status-msg').innerText = `🤖 파이썬 AI [ ${currentBotDifficulty.toUpperCase()} ] 봇 대전이 시작되었습니다!`;
});

function runBotAI() {
    if (!aiGameActive || !botGame.player.matrix) return;
    
    const packet = {
        board: botGame.board,
        currentPiece: botGame.player.type,
        holdPiece: botGame.holdType,   
        canSwap: botGame.canSwap === undefined ? true : botGame.canSwap 
    };
    
    aiServerScoket.emit("ask_ai_decision", packet);
}

aiServerScoket.on("response_ai_decision", (decision) => {
    if (!aiGameActive) return;
    
    if (decision.shouldSwap) {
        botPlayerHoldAction(); 
        return; 
    }
    
    const bestX = decision.bestX;
    const bestRot = decision.bestRot;
    
    for (let r = 0; r < bestRot; r++) aiRotateMatrix(botGame.player.matrix, 1);
    
    botGame.player.pos.x = bestX;
    botGame.player.pos.y = 0; 
    
    // 🛡️ 위급 상황 시 무한 루프 프리징 방지용 안전 상향 가드 강화
    let safetyCounter = 0;
    while (aiCollide(botGame.board, botGame.player) && safetyCounter < 15) {
        botGame.player.pos.y--; 
        safetyCounter++;
    }
    
    while (!aiCollide(botGame.board, botGame.player)) { botGame.player.pos.y++; }
    botGame.player.pos.y--;
    
    botMergeAndSweep();
});

function aiPlayerResetUser() {
    if (aiMyGame.nextQueue.length < 7) aiMyGame.nextQueue.push(...generateSharedBag());
    aiMyGame.player.matrix = aiMyGame.nextQueue.shift();
    aiMyGame.player.type = getPieceType(aiMyGame.player.matrix);
    aiMyGame.player.color = SHAPES[aiMyGame.player.type].color;
    aiMyGame.player.pos.y = 0;
    
    const baseStartX = Math.floor(10 / 2) - Math.floor(aiMyGame.player.matrix[0].length / 2);
    if (aiMyGame.player.type !== 'I' && aiMyGame.player.type !== 'O') {
        aiMyGame.player.pos.x = baseStartX - 1;
    } else {
        aiMyGame.player.pos.x = baseStartX;
    }
    
    if (aiCollide(aiMyGame.board, aiMyGame.player)) {
        aiGameActive = false; alert("💥 봇전 패배... 더 훈련해 오세요! 💥");
    }
    aiMyGame.canSwap = true; aiDrawNextPreview();
}

function botPlayerReset() {
    if (botGame.nextQueue.length < 7) botGame.nextQueue.push(...generateSharedBag());
    botGame.player.matrix = botGame.nextQueue.shift();
    botGame.player.type = getPieceType(botGame.player.matrix);
    botGame.player.color = SHAPES[botGame.player.type].color; 
    botGame.player.pos.y = 0; botGame.player.pos.x = 4;
    
    if (aiCollide(botGame.board, botGame.player)) {
        aiGameActive = false; alert("🎉 승리! 인공지능 봇을 격파했습니다! 🎉");
        return;
    }
    botDrawNextPreview();
    botDrawHold(); // 💡 블록이 새로 소환될 때도 홀드 UI를 강제로 다시 그려 백화현상 원천 차단!
    
    botGame.canSwap = true; 
    
    if (aiGameActive) {
        setTimeout(runBotAI, botGame.speed);
    }
}

function aiMergeAndSweepUser() {
    let isTSpin = false;
    if (aiMyGame.player.type === 'T') {
        const cx = aiMyGame.player.pos.x + 1; const cy = aiMyGame.player.pos.y + 1;
        const corners = [{dx:-1,dy:-1}, {dx:1,dy:-1}, {dx:-1,dy:1}, {dx:1,dy:1}];
        let cCount = 0;
        corners.forEach(c => {
            const tx = cx + c.dx; const ty = cy + c.dy;
            if (tx < 0 || tx >= 10 || ty >= 20 || (ty >= 0 && aiMyGame.board[ty][tx] !== 0)) cCount++;
        });
        if (cCount >= 3) isTSpin = true;
    }

    aiMyGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) aiMyGame.board[y + aiMyGame.player.pos.y][x + aiMyGame.player.pos.x] = value;
        });
    });
    
    let rowsCleared = 0;
    outer: for (let y = 20 - 1; y > 0; --y) {
        for (let x = 0; x < 10; ++x) { if (aiMyGame.board[y][x] === 0) continue outer; }
        const row = aiMyGame.board.splice(y, 1)[0].fill(0); aiMyGame.board.unshift(row);
        ++y; rowsCleared++;
    }
    
    let power = 0;
    if (rowsCleared === 2) power = 1;
    if (rowsCleared === 3) power = 2;
    if (rowsCleared === 4) power = 4;
    if (isTSpin && rowsCleared > 0) {
        if (rowsCleared === 1) power = 2; if (rowsCleared === 2) power = 5; if (rowsCleared === 3) power = 7;
    }
    if (rowsCleared > 0) aiMyCombo++; else aiMyCombo = -1;
    if (aiMyCombo > 0) power += Math.floor(aiMyCombo / 2);
    
    if (power > 0) {
        if (aiMyGame.pendingAttacks > 0) {
            if (aiMyGame.pendingAttacks >= power) { aiMyGame.pendingAttacks -= power; power = 0; }
            else { power -= aiMyGame.pendingAttacks; aiMyGame.pendingAttacks = 0; }
        }
        if (power > 0) {
            botGame.pendingAttacks += power; aiMyGame.attackCounter += power;
            document.getElementById('ai-my-attack-count').innerText = aiMyGame.attackCounter;
        }
    }
    if (rowsCleared === 0 && aiMyGame.pendingAttacks > 0) { aiRiseGarbage(aiMyGame); }
    aiPlayerResetUser();
}

function botMergeAndSweep() {
    let isTSpin = false;
    if (botGame.player.type === 'T') {
        const cx = botGame.player.pos.x + 1; const cy = botGame.player.pos.y + 1;
        const corners = [{dx:-1,dy:-1}, {dx:1,dy:-1}, {dx:-1,dy:1}, {dx:1,dy:1}];
        let cCount = 0;
        corners.forEach(c => {
            const tx = cx + c.dx; const ty = cy + c.dy;
            if (tx < 0 || tx >= 10 || ty >= 20 || (ty >= 0 && botGame.board[ty][tx] !== 0)) cCount++;
        });
        if (cCount >= 3) isTSpin = true;
    }

    botGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) botGame.board[y + botGame.player.pos.y][x + botGame.player.pos.x] = value; 
        });
    });
    
    let rowsCleared = 0;
    outer: for (let y = 20 - 1; y > 0; --y) {
        for (let x = 0; x < 10; ++x) { if (botGame.board[y][x] === 0) continue outer; }
        const row = botGame.board.splice(y, 1)[0].fill(0); botGame.board.unshift(row);
        ++y; rowsCleared++;
    }
    
    let power = 0;
    if (rowsCleared === 2) power = 1;
    if (rowsCleared === 3) power = 2;
    if (rowsCleared === 4) power = 4; 
    if (isTSpin && rowsCleared > 0) {
        if (rowsCleared === 1) power = 2; if (rowsCleared === 2) power = 5; if (rowsCleared === 3) power = 7;
    }
    if (rowsCleared > 0) aiBotCombo++; else aiBotCombo = -1;
    if (aiBotCombo > 0) power += Math.floor(aiBotCombo / 2);
    
    if (power > 0) {
        if (botGame.pendingAttacks > 0) {
            if (botGame.pendingAttacks >= power) { botGame.pendingAttacks -= power; power = 0; }
            else { power -= botGame.pendingAttacks; botGame.pendingAttacks = 0; }
        }
        if (power > 0) {
            aiMyGame.pendingAttacks += power; botGame.attackCounter += power;
            document.getElementById('bot-attack-count').innerText = botGame.attackCounter;
        }
    }
    if (rowsCleared === 0 && botGame.pendingAttacks > 0) { aiRiseGarbage(botGame); }
    botPlayerReset();
}

function aiRiseGarbage(gameObj) {
    const lines = gameObj.pendingAttacks; gameObj.pendingAttacks = 0;
    gameObj.board.splice(0, lines);
    for (let i = 0; i < lines; i++) {
        let row = Array(10).fill(8); row[Math.floor(Math.random() * 10)] = 0;
        gameObj.board.push(row);
    }
}

function aiPlayerMove(dir) {
    aiMyGame.player.pos.x += dir;
    if (aiCollide(aiMyGame.board, aiMyGame.player)) aiMyGame.player.pos.x -= dir;
    else { aiMyGame.lockDelayTimer = 0; } 
}
function aiPlayerDrop() {
    aiMyGame.player.pos.y++;
    if (aiCollide(aiMyGame.board, aiMyGame.player)) { aiMyGame.player.pos.y--; return false; }
    aiMyGame.lockDelayTimer = 0; return true;
}
function aiHardDrop() {
    while (!aiCollide(aiMyGame.board, aiMyGame.player)) aiMyGame.player.pos.y++;
    aiMyGame.player.pos.y--; aiMergeAndSweepUser();
}
function aiPlayerRotate(dir) {
    if (!aiGameActive || !aiMyGame.player.matrix) return;
    const origX = aiMyGame.player.pos.x; const origY = aiMyGame.player.pos.y;
    aiRotateMatrix(aiMyGame.player.matrix, dir);
    const tests = AI_WK_TESTS_90; let success = false;
    for (let test of tests) {
        aiMyGame.player.pos.x = origX + test.dx; aiMyGame.player.pos.y = origY + test.dy;
        if (!aiCollide(aiMyGame.board, aiMyGame.player)) { success = true; aiMyGame.lockDelayTimer = 0; break; }
    }
    if (!success) { aiMyGame.player.pos.x = origX; aiMyGame.player.pos.y = origY; aiRotateMatrix(aiMyGame.player.matrix, -dir); }
}
function aiPlayerHold() {
    if (!aiMyGame.canSwap) return;
    if (aiMyGame.holdType === null) {
        aiMyGame.holdType = aiMyGame.player.type; aiPlayerResetUser();
    } else {
        const temp = aiMyGame.holdType; aiMyGame.holdType = aiMyGame.player.type;
        aiMyGame.player.matrix = SHAPES[temp].matrix.map(row => [...row]);
        aiMyGame.player.type = temp; aiMyGame.player.color = SHAPES[temp].color;
        aiMyGame.player.pos.y = 0; 
        const baseStartX = Math.floor(10 / 2) - Math.floor(aiMyGame.player.matrix[0].length / 2);
        if (aiMyGame.player.type !== 'I' && aiMyGame.player.type !== 'O') { aiMyGame.player.pos.x = baseStartX - 1; } 
        else { aiMyGame.player.pos.x = baseStartX; }
    }
    aiMyGame.canSwap = false; aiDrawHold();
}

function aiRotateMatrix(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    if (dir === 1) matrix.forEach(row => row.reverse()); else matrix.reverse();
}

function aiCollide(board, player) {
    const m = player.matrix; const o = player.pos; if (!m) return false;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0) {
                if (!board[y + o.y] || board[y + o.y][x + o.x] === undefined || board[y + o.y][x + o.x] !== 0) return true;
            }
        }
    }
    return false;
}

function aiDrawHold() {
    let ctx = aiMyGame.holdCtx; ctx.fillStyle = '#000'; ctx.fillRect(0,0,80,80);
    if (aiMyGame.holdType) {
        const m = SHAPES[aiMyGame.holdType].matrix;
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) { ctx.fillStyle = SHAPES[aiMyGame.holdType].color; ctx.fillRect(x*16+10, y*16+10, 16, 16); }
        }));
    }
}

function botPlayerHoldAction() {
    if (botGame.canSwap === false) return;
    if (botGame.holdType === null) {
        botGame.holdType = botGame.player.type;
        botPlayerReset();
    } else {
        const currentType = botGame.player.type;
        const tempType = botGame.holdType;
        
        botGame.holdType = currentType;
        botGame.player.matrix = SHAPES[tempType].matrix.map(row => [...row]);
        botGame.player.type = tempType;
        botGame.player.color = SHAPES[tempType].color;
        
        botGame.player.pos.y = 0;
        botGame.player.pos.x = 4;
        
        if (aiGameActive) setTimeout(runBotAI, 50);
    }
    botGame.canSwap = false;
    botDrawHold();
}

function botDrawHold() {
    let ctx = botGame.holdCtx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 80, 80);
    if (botGame.holdType) {
        const m = SHAPES[botGame.holdType].matrix;
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) {
                ctx.fillStyle = SHAPES[botGame.holdType].color;
                ctx.fillRect(x * 16 + 10, y * 16 + 10, 16, 16);
            }
        }));
    }
}

function aiDrawNextPreview() {
    let ctx = aiMyGame.nextCtx; ctx.fillStyle = '#000'; ctx.fillRect(0,0,80,240);
    aiMyGame.nextQueue.slice(0, 4).forEach((matrix, i) => {
        const type = getPieceType(matrix);
        matrix.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) { 
                ctx.fillStyle = SHAPES[type].color; ctx.fillRect(x*14+10, i*55 + y*14 + 10, 14, 14); 
                ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(x*14+10, i*55 + y*14 + 10, 14, 14);
            }
        }));
    });
}

function botDrawNextPreview() {
    let ctx = botGame.nextCtx; ctx.fillStyle = '#000'; ctx.fillRect(0,0,80,240);
    if (!botGame.nextQueue || botGame.nextQueue.length === 0) return;
    botGame.nextQueue.slice(0, 4).forEach((matrix, i) => {
        const type = getPieceType(matrix);
        matrix.forEach((row, y) => row.forEach((v, x) => {
            if (v !== 0) { 
                ctx.fillStyle = SHAPES[type].color; ctx.fillRect(x*14+10, i*55 + y*14 + 10, 14, 14); 
                ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.strokeRect(x*14+10, i*55 + y*14 + 10, 14, 14);
            }
        }));
    });
}

let aiLastTime = 0;
function aiMainLoop(time = 0) {
    const deltaTime = time - aiLastTime; aiLastTime = time;
    if (aiGameActive && document.getElementById('view-ai').classList.contains('active')) {
        handleAiContinuousInput(deltaTime); 
        if (aiMyGame.player && aiMyGame.player.matrix) {
            let tempPlayer = { pos: { x: aiMyGame.player.pos.x, y: aiMyGame.player.pos.y + 1 }, matrix: aiMyGame.player.matrix };
            if (aiCollide(aiMyGame.board, tempPlayer)) {
                aiMyGame.lockDelayTimer += deltaTime; aiMyGame.lockTotalHighestTimer += deltaTime;
                if (aiMyGame.lockDelayTimer >= 1000 || aiMyGame.lockTotalHighestTimer >= 3000) { aiMergeAndSweepUser(); }
            } else {
                aiMyGame.lockDelayTimer = 0; aiMyGame.lockTotalHighestTimer = 0;
                if (!aiKeys[40]) {
                    aiMyGame.dropCounter += deltaTime;
                    if (aiMyGame.dropCounter > aiMyGame.dropInterval) { aiPlayerDrop(); aiMyGame.dropCounter = 0; }
                }
            }
        }
        const myGauge = document.getElementById('ai-my-attack-gauge'); const botGauge = document.getElementById('bot-attack-gauge');
        if (myGauge) { myGauge.style.height = Math.min((aiMyGame.pendingAttacks / 20) * 100, 100) + '%'; }
        if (botGauge) { botGauge.style.height = Math.min((botGame.pendingAttacks / 20) * 100, 100) + '%'; }
    }
    
    drawGrid(aiMyGame.ctx, aiMyGame.canvas); drawMatrix(aiMyGame.board, {x:0, y:0}, null, aiMyGame.ctx); drawAiMyGhost();
    if (aiMyGame.player && aiMyGame.player.matrix) { drawMatrix(aiMyGame.player.matrix, aiMyGame.player.pos, aiMyGame.player.color, aiMyGame.ctx); }
    drawGrid(botGame.ctx, botGame.canvas); drawMatrix(botGame.board, {x:0, y:0}, null, botGame.ctx);
    if (botGame.player && botGame.player.matrix) { drawMatrix(botGame.player.matrix, botGame.player.pos, botGame.player.color, botGame.ctx); }
    requestAnimationFrame(aiMainLoop);
}

function drawAiMyGhost() {
    if (!aiMyGame.player.matrix) return; let ghostPos = { x: aiMyGame.player.pos.x, y: aiMyGame.player.pos.y };
    while (!aiCollide(aiMyGame.board, { pos: { x: ghostPos.x, y: ghostPos.y + 1 }, matrix: aiMyGame.player.matrix })) { ghostPos.y++; }
    aiMyGame.player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                aiMyGame.ctx.globalAlpha = 0.15; aiMyGame.ctx.fillStyle = aiMyGame.player.color; 
                aiMyGame.ctx.fillRect((x + ghostPos.x) * AI_BLOCK_SIZE, (y + ghostPos.y) * AI_BLOCK_SIZE, AI_BLOCK_SIZE, AI_BLOCK_SIZE);
                aiMyGame.ctx.globalAlpha = 0.3; aiMyGame.ctx.strokeStyle = '#fff'; 
                aiMyGame.ctx.strokeRect((x + ghostPos.x) * AI_BLOCK_SIZE, (y + ghostPos.y) * AI_BLOCK_SIZE, AI_BLOCK_SIZE, AI_BLOCK_SIZE);
                aiMyGame.ctx.globalAlpha = 1.0; 
            }
        });
    });
}

aiMainLoop();