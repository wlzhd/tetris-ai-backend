# main.py
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles # 💡 HTML 화면을 뿌려주기 위한 도구
import socketio
import numpy as np
import os

print("🚀 [실서비스 배포 버전] 1vs1 멀티플레이 및 초고지능 AI 통합 서버 가동.")

# ----------------------------------------------------------------------
# 🌐 [FastAPI 및 실시간 웹소켓 서버 레이어 설정]
# ----------------------------------------------------------------------
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()

# 💡 [핵심 패치] static 폴더 안에 있는 aaa.html, aaa.js 등을 인터넷 주소로 뿌려줍니다!
app.mount("/game", StaticFiles(directory="static", html=True), name="static")
app.mount('/', socketio.ASGIApp(sio))

# ----------------------------------------------------------------------
# 🤝 [1vs1 실시간 대전 멀티플레이 매칭 및 룸 매니저 로직]
# ----------------------------------------------------------------------
waiting_player = None  # 대기 중인 유저의 소켓 ID
rooms = {}            # 현재 가동 중인 매치 룸 데이터베이스

@sio.event
async def connect(sid, environ):
    print(f"✅ 유저 접속 성공! ID: {sid}")

@sio.event
async def disconnect(sid):
    global waiting_player
    print(f"❌ 유저 접속 종료: {sid}")
    if waiting_player == sid:
        waiting_player = None
    
    # 만약 게임 중에 탈주했다면 상대방에게 승리 알림
    for room_id, room in list(rooms.items()):
        if sid in room['players']:
            opp_id = room['players'][1] if room['players'][0] == sid else room['players'][0]
            await sio.emit('status', "상대방이 게임을 떠났습니다.", to=opp_id)
            if room_id in rooms: del rooms[room_id]

# ⚔️ 유저가 '시작하기(1vs1 매칭)' 버튼을 눌렀을 때 작동
@sio.on('request_match')
async def handle_match_request(sid):
    global waiting_player
    if waiting_player is None:
        waiting_player = sid
        await sio.emit('status', "상대 플레이어를 기다리는 중입니다...", to=sid)
    else:
        if waiting_player == sid: return
        p1 = waiting_player
        p2 = sid
        waiting_player = None
        
        room_id = f"room_{p1}_{p2}"
        rooms[room_id] = { 'players': [p1, p2] }
        
        # 7-Bag 랜덤 블록 소환 가이드라인 사전 생성 후 양쪽에 공평하게 송출
        def gen_bag():
            bag = ['I', 'O', 'T', 'L', 'J', 'S', 'Z']
            np.random.shuffle(bag)
            return list(bag)
        initial_bags = [gen_bag(), gen_bag()]
        
        await sio.emit('match_start', {'roomId': room_id, 'role': 'p1', 'initialBags': initial_bags}, to=p1)
        await sio.emit('match_start', {'roomId': room_id, 'role': 'p2', 'initialBags': initial_bags}, to=p2)
        print(f"⚔️ [매치 생성 완료] {p1} VS {p2} ➔ 룸 ID: {room_id}")

@sio.on('sync_game')
async def handle_sync(sid, data):
    room_id = data.get('roomId')
    if room_id in rooms:
        for p in rooms[room_id]['players']:
            if p != sid:
                await sio.emit('opponent_sync', data, to=p)

@sio.on('send_attack')
async def handle_attack(sid, data):
    room_id = data.get('roomId')
    if room_id in rooms:
        for p in rooms[room_id]['players']:
            if p != sid:
                await sio.emit('receive_attack', data, to=p)

# ----------------------------------------------------------------------
# 🧠 [초고지능 AI 백엔드 연산 레이어] (기존 코드 그대로 탑재)
# ----------------------------------------------------------------------
SHAPE_MATRICES = {
    'I': [[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]], [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]], [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]],
    'O': [[[2,2],[2,2]], [[2,2],[2,2]], [[2,2],[2,2]], [[2,2],[2,2]]],
    'T': [[[0,3,0],[3,3,3],[0,0,0]], [[0,3,0],[0,3,3],[0,3,0]], [[0,0,0],[3,3,3],[0,3,0]], [[0,3,0],[3,3,0],[0,3,0]]],
    'L': [[[0,0,4],[4,4,4],[0,0,0]], [[0,4,0],[0,4,0],[0,4,2]], [[0,0,0],[4,4,4],[4,0,0]], [[4,4,0],[0,4,0],[0,4,0]]],
    'J': [[[5,0,0],[5,5,5],[0,0,0]], [[0,5,5],[0,5,0],[0,5,0]], [[0,0,0],[5,5,5],[0,0,5]], [[0,5,0],[0,5,0],[5,5,0]]],
    'S': [[[0,6,6],[6,6,0],[0,0,0]], [[0,6,0],[0,6,6],[0,0,6]], [[0,0,0],[0,6,6],[6,6,0]], [[6,0,0],[6,6,0],[0,6,0]]],
    'Z': [[[7,7,0],[0,7,7],[0,0,0]], [[0,0,7],[0,7,7],[0,7,0]], [[0,0,0],[7,7,0],[0,7,7]], [[0,7,0],[7,7,0],[7,0,0]]]
}
CFG = { 'height': 0.6, 'hole': 55.0, 'bump': 0.3 }

def evaluate_piece_move(grid, piece, target_rot, target_x):
    rotations = SHAPE_MATRICES.get(piece, [[[1]]])
    if target_rot >= len(rotations): return -999999, 0
    mat = np.array(rotations[target_rot])
    mask = (mat != 0)
    if not np.any(mask): return -999999, 0
    ys, xs = np.where(mask)
    if target_x < -xs.min() or target_x > (10 - xs.max() - 1): return -999999, 0
    drop_y = -1
    for y in range(0, 21 - mat.shape[0]):
        collision = False
        for my in range(mat.shape[0]):
            for mx in range(mat.shape[1]):
                if mat[my][mx] != 0:
                    if y + my >= 20 or grid[y + my][target_x + mx] != 0:
                        collision = True
                        break
            if collision: break
        if collision: break
        drop_y = y
    if drop_y < 0: return -999999, 0
    temp_grid = grid.copy()
    for my in range(mat.shape[0]):
        for mx in range(mat.shape[1]):
            if mat[my][mx] != 0: temp_grid[drop_y + my][target_x + mx] = 1
    col_heights = []
    holes = 0
    for cx in range(10):
        found = False
        h = 0
        for cy in range(20):
            if temp_grid[cy][cx] != 0:
                if not found:
                    h = 20 - cy
                    found = True
            elif found and temp_grid[cy][cx] == 0: holes += 1
        col_heights.append(h)
    bumpiness = sum(abs(col_heights[i] - col_heights[i+1]) for i in range(9))
    total_height = sum(col_heights)
    score = -(total_height * CFG['height']) - (holes * CFG['hole']) - (bumpiness * CFG['bump'])
    return score, drop_y

def predict_best_move_with_hold(board, current_piece, hold_piece, can_swap):
    grid = np.array(board)
    best_score_current = -999999
    best_x_current = 4
    best_rot_current = 0
    rotations_cur = SHAPE_MATRICES.get(current_piece, [[[1]]])
    for r in range(len(rotations_cur)):
        mat = np.array(rotations_cur[r])
        ys, xs = np.where(mat != 0)
        for x in range(-xs.min(), 10 - xs.max()):
            sc, dy = evaluate_piece_move(grid, current_piece, r, x)
            if sc > best_score_current and sc != -999999:
                best_score_current = sc
                best_x_current = x
                best_rot_current = r
    best_score_hold = -999999
    best_x_hold = 4
    best_rot_hold = 0
    if can_swap and hold_piece and hold_piece in SHAPE_MATRICES:
        rotations_h = SHAPE_MATRICES.get(hold_piece, [[[1]]])
        for r in range(len(rotations_h)):
            mat = np.array(rotations_h[r])
            ys, xs = np.where(mat != 0)
            for x in range(-xs.min(), 10 - xs.max()):
                sc, dy = evaluate_piece_move(grid, hold_piece, r, x)
                if sc > best_score_hold and sc != -999999:
                    best_score_hold = sc
                    best_x_hold = x
                    best_rot_hold = r
    if can_swap and hold_piece and best_score_hold > best_score_current and best_score_hold != -999999:
        return best_x_hold, best_rot_hold, True
    else:
        if best_score_current == -999999: return 4, 0, False
        return best_x_current, best_rot_current, False

@sio.on("ask_ai_decision")
async def handle_ai_request(sid, data):
    board = data.get("board", [])          
    current_piece = data.get("currentPiece", "I") 
    hold_piece = data.get("holdPiece", None)  
    can_swap = data.get("canSwap", True)      
    best_x, best_rot, should_swap = predict_best_move_with_hold(board, current_piece, hold_piece, can_swap)
    await sio.emit("response_ai_decision", {"bestX": best_x, "bestRot": best_rot, "shouldSwap": should_swap}, to=sid)

# ----------------------------------------------------------------------
# 🚀 [가동부 환경 파싱 및 포트 트리거]
# ----------------------------------------------------------------------
if __name__ == "__main__":
    # Render 클라우드가 지정하는 동적 포트를 수용하도록 세팅합니다!
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)