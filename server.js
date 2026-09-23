const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================== 静态文件服务 ====================
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // 处理跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 构建文件路径
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// ==================== WebSocket 服务器 ====================
const wss = new WebSocket.Server({ server });

// 房间管理
const rooms = new Map();
const playerConnections = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generatePlayerId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildDeck() {
  const deck = [];
  for (let i = 0; i < 36; i++) {
    deck.push({ type: 'number', value: i % 6 });
  }
  for (let i = 0; i < 6; i++) {
    deck.push({ type: 'boss' });
  }
  for (let i = 0; i < 6; i++) {
    deck.push({ type: 'dog' });
  }
  for (let i = 0; i < 7; i++) {
    deck.push({ type: 'greedy' });
  }
  return shuffle(deck);
}

// 赃物配置：每轮都有 0,1,2,3,3,3,4,5 加上老板
// 白点分布规则：
// 第1轮：0有2个白点，其他没有，老板没有
// 第2轮：0有2个白点，1有1个白点，其他没有，老板没有
// 第3轮：0有2个白点，1有1个白点，2有1个白点，其他没有，老板没有
// 第4轮：0有2个白点，1,2,4,5各有1个白点，3没有，老板没有
const LOOT_POOLS = [
  // 第1轮：素描
  [
    { id: 'r1-0', value: 0, alibi: true, alibiCount: 2, isBoss: false },
    { id: 'r1-1', value: 1, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-2', value: 2, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-3a', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-3b', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-3c', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-4', value: 4, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-5', value: 5, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r1-boss', value: 5, alibi: false, alibiCount: 0, isBoss: true }
  ],
  // 第2轮：雕塑
  [
    { id: 'r2-0', value: 0, alibi: true, alibiCount: 2, isBoss: false },
    { id: 'r2-1', value: 1, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r2-2', value: 2, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-3a', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-3b', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-3c', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-4', value: 4, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-5', value: 5, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r2-boss', value: 5, alibi: false, alibiCount: 0, isBoss: true }
  ],
  // 第3轮：绘画
  [
    { id: 'r3-0', value: 0, alibi: true, alibiCount: 2, isBoss: false },
    { id: 'r3-1', value: 1, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r3-2', value: 2, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r3-3a', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r3-3b', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r3-3c', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r3-4', value: 4, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r3-5', value: 5, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r3-boss', value: 5, alibi: false, alibiCount: 0, isBoss: true }
  ],
  // 第4轮：文物
  [
    { id: 'r4-0', value: 0, alibi: true, alibiCount: 2, isBoss: false },
    { id: 'r4-1', value: 1, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r4-2', value: 2, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r4-3a', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r4-3b', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r4-3c', value: 3, alibi: false, alibiCount: 0, isBoss: false },
    { id: 'r4-4', value: 4, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r4-5', value: 5, alibi: true, alibiCount: 1, isBoss: false },
    { id: 'r4-boss', value: 5, alibi: false, alibiCount: 0, isBoss: true }
  ]
];

function createGameState(playerNames) {
  const players = playerNames.map((name, idx) => ({
    id: 'player_' + idx,
    name: name,
    hand: [],
    loot: [],
    lootThisRound: [],
    alibi: 0,
    score: 0,
    cardCount: 0
  }));
  
  const deck = buildDeck();
  
  // 发牌
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < players.length; j++) {
      if (deck.length > 0) {
        players[j].hand.push(deck.pop());
        players[j].cardCount = players[j].hand.length;
      }
    }
  }
  
  return {
    players,
    currentPlayerIndex: 0,
    roundIndex: 0,
    deck,
    discardPile: [],
    centralLoot: JSON.parse(JSON.stringify(LOOT_POOLS[0])),
    bossOwner: null,
    dogOwner: null,
    dogInCenter: true,
    roundFinished: false,
    gameFinished: false
  };
}

function broadcastToRoom(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.players.forEach(p => {
    // 断线玩家 p.ws 为 null，跳过避免空指针
    if (!p.ws) return;
    if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(message));
    }
  });
}

function sendPlayerList(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const playerList = room.players.map(p => ({
    id: p.id,
    name: p.name,
    isOnline: !!p.ws && p.ws.readyState === WebSocket.OPEN
  }));

  broadcastToRoom(roomCode, {
    type: 'playerList',
    players: playerList
  });
}

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleMessage(ws, msg);
    } catch (err) {
      console.error('Invalid message:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    handleDisconnect(ws);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'createRoom':
      handleCreateRoom(ws, msg);
      break;

    case 'joinRoom':
      handleJoinRoom(ws, msg);
      break;

    case 'startGame':
      handleStartGame(ws, msg);
      break;

    case 'reconnect':
      handleReconnect(ws, msg);
      break;

    case 'action':
      handleAction(ws, msg);
      break;

    case 'animation':
      handleAnimation(ws, msg);
      break;

    case 'log':
      handleLog(ws, msg);
      break;

    case 'dogDefense':
      handleDogDefense(ws, msg);
      break;

    case 'gameEnd':
      handleGameEnd(ws, msg);
      break;

    case 'emoji':
      handleEmoji(ws, msg);
      break;
  }
}

function handleCreateRoom(ws, msg) {
  const roomCode = generateRoomCode();
  const playerId = generatePlayerId();
  
  rooms.set(roomCode, {
    players: [{
      id: playerId,
      name: msg.nickname,
      ws,
      isHost: true
    }],
    gameState: null
  });
  
  playerConnections.set(ws, { roomCode, playerId, playerIndex: 0 });
  
  ws.send(JSON.stringify({
    type: 'roomCreated',
    roomCode,
    playerId
  }));
  
  sendPlayerList(roomCode);
  console.log(`Room ${roomCode} created by ${msg.nickname}`);
}

function handleJoinRoom(ws, msg) {
  const room = rooms.get(msg.roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
    return;
  }
  
  if (room.players.length >= 5) {
    ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
    return;
  }
  
  if (room.gameState) {
    ws.send(JSON.stringify({ type: 'error', message: '游戏已开始' }));
    return;
  }
  
  const playerId = generatePlayerId();
  const playerIndex = room.players.length;
  
  room.players.push({
    id: playerId,
    name: msg.nickname,
    ws,
    isHost: false
  });
  
  playerConnections.set(ws, { roomCode: msg.roomCode, playerId, playerIndex });
  
  ws.send(JSON.stringify({
    type: 'joinedRoom',
    roomCode: msg.roomCode,
    playerId
  }));
  
  sendPlayerList(msg.roomCode);
  console.log(`${msg.nickname} joined room ${msg.roomCode}`);
}

function handleStartGame(ws, msg) {
  const room = rooms.get(msg.roomCode);
  
  if (!room) return;
  
  const conn = playerConnections.get(ws);
  if (!conn || room.players[0].id !== conn.playerId) {
    ws.send(JSON.stringify({ type: 'error', message: '只有房主可以开始游戏' }));
    return;
  }
  
  if (room.players.length < 2) {
    ws.send(JSON.stringify({ type: 'error', message: '至少需要2人' }));
    return;
  }
  
  const playerNames = room.players.map(p => p.name);
  room.gameState = createGameState(playerNames);
  
  // 为每个玩家分配ID
  room.players.forEach((p, idx) => {
    room.gameState.players[idx].id = p.id;
  });

  // 关键修复：发送游戏开始消息时按玩家视角过滤，避免泄露其他玩家手牌
  room.players.forEach((p, idx) => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: 'gameStarted',
        gameState: {
          ...buildPlayerViewOfGameState(room.gameState, idx),
          myPlayerIndex: idx
        }
      }));
    }
  });
  
  console.log(`Game started in room ${msg.roomCode} with ${room.players.length} players`);
}

// 关键修复：构造按玩家视角过滤的 gameState
// 其他玩家的手牌字段被清空，仅保留自己手牌，避免房主客户端泄露全手牌信息
function buildPlayerViewOfGameState(gameState, playerIndex) {
  if (!gameState) return null;
  // 浅拷贝 + players 数组单独处理，避免深拷贝开销
  const view = { ...gameState };
  view.players = gameState.players.map((p, i) => {
    if (i === playerIndex) return { ...p, handCount: p.hand ? p.hand.length : 0 }; // 自己保留完整数据（含手牌）
    // 其他玩家隐藏手牌内容，但保留手牌数量供 UI 显示
    return {
      ...p,
      hand: [],
      handCount: p.hand ? p.hand.length : 0
    };
  });
  return view;
}

function handleAction(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;

  const conn = playerConnections.get(ws);
  if (!conn) return;
  const senderIndex = conn.playerIndex;

  // 关键修复：合并状态而不是直接覆盖。
  // 发送方本地副本里其他玩家的 hand 已被过滤成 []（防偷看），
  // 如果直接存，会导致其他玩家手牌"蒸发"。
  // 正确做法：出牌者自己的手牌以发送方为准，其他玩家手牌以服务器存档为准。
  if (msg.gameState) {
    const incoming = msg.gameState;
    const prev = room.gameState;
    const merged = { ...incoming };
    merged.players = incoming.players.map((p, i) => {
      if (i === senderIndex) return p; // 发送方自己的手牌是最新的
      const serverP = prev && prev.players && prev.players[i];
      return { ...p, hand: serverP ? serverP.hand : p.hand };
    });
    room.gameState = merged;
  }

  // 按玩家视角过滤后再广播，避免泄露其他玩家手牌
  room.players.forEach((p, idx) => {
    if (!p.ws || p.ws.readyState !== WebSocket.OPEN) return;
    if (p.ws === ws) return; // 发送方自己保留本地最新状态
    p.ws.send(JSON.stringify({
      type: 'action',
      action: msg.action,
      gameState: buildPlayerViewOfGameState(room.gameState, idx)
    }));
  });
}

// 处理动画消息 - 广播给房间所有玩家
function handleAnimation(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  
  // 广播动画给房间所有其他玩家
  broadcastToRoom(msg.roomCode, {
    type: 'animation',
    animation: msg.animation
  }, ws);
}

// 处理日志消息 - 广播给房间所有玩家
function handleLog(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  
  // 广播日志给房间所有其他玩家
  broadcastToRoom(msg.roomCode, {
    type: 'log',
    message: msg.message
  }, ws);
}

// 关键修复：处理看门狗防御请求
function handleDogDefense(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  
  const conn = playerConnections.get(ws);
  if (!conn) return;
  
  // 更新游戏状态
  if (msg.gameState) {
    room.gameState = msg.gameState;
  }
  
  // 如果是初始请求（没有action），转发给被抢者
  if (!msg.action) {
    // 找到被抢者的连接
    const victimPlayer = room.players[msg.victimIndex];
    if (victimPlayer && victimPlayer.ws.readyState === WebSocket.OPEN) {
      victimPlayer.ws.send(JSON.stringify({
        type: 'dogDefense',
        attackerIndex: msg.attackerIndex,
        victimIndex: msg.victimIndex,
        value: msg.value,
        isBoss: msg.isBoss
      }));
    }
  } else {
    // 被抢者做出了选择，广播给所有玩家（包括发送者）
    room.players.forEach(p => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({
          type: 'robResult',
          attackerIndex: msg.attackerIndex,
          victimIndex: msg.victimIndex,
          value: msg.value,
          isBoss: msg.isBoss,
          action: msg.action,
          lootId: msg.lootId
        }));
      }
    });
  }
}

// 关键修复：处理游戏结束，按玩家视角广播给所有玩家
function handleGameEnd(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;

  // 更新游戏状态
  if (msg.gameState) {
    room.gameState = msg.gameState;
  }

  // 按视角广播给所有玩家（包括发送者）
  room.players.forEach((p, idx) => {
    if (!p.ws || p.ws.readyState !== WebSocket.OPEN) return;
    p.ws.send(JSON.stringify({
      type: 'gameEnd',
      gameState: buildPlayerViewOfGameState(room.gameState, idx)
    }));
  });
}

// Emoji表情消息处理
function handleEmoji(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  
  // 广播给所有玩家（包括发送者）
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: 'emoji',
        playerIndex: msg.playerIndex,
        emoji: msg.emoji
      }));
    }
  });
}

// 关键修复：断线重连。handleDisconnect 只标记断线时间，不立即删除玩家，
// 给玩家 5 分钟重连窗口期，超时后才彻底清理。
const DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

function handleReconnect(ws, msg) {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已关闭' }));
    return;
  }

  const player = room.players.find(p => p.id === msg.playerId);
  if (!player) {
    ws.send(JSON.stringify({ type: 'error', message: '玩家身份不存在，请重新加入房间' }));
    return;
  }

  // 恢复玩家连接
  player.ws = ws;
  player.disconnectedAt = null;
  playerConnections.set(ws, { roomCode: msg.roomCode, playerId: player.id, playerIndex: room.players.indexOf(player) });

  // 推送重连成功 + 当前状态（按视角过滤）
  const playerIndex = room.players.indexOf(player);
  ws.send(JSON.stringify({
    type: 'reconnected',
    roomCode: msg.roomCode,
    playerId: player.id,
    myPlayerIndex: playerIndex,
    gameState: buildPlayerViewOfGameState(room.gameState, playerIndex)
  }));

  // 同时通知房间内其他玩家该玩家已重连
  sendPlayerList(msg.roomCode);
  console.log(`Player ${player.name} reconnected to room ${msg.roomCode}`);
}

function handleDisconnect(ws) {
  const conn = playerConnections.get(ws);
  if (!conn) return;

  const room = rooms.get(conn.roomCode);
  if (room) {
    const player = room.players.find(p => p.id === conn.playerId);
    if (player) {
      // 标记为断线，但保留在玩家列表中（给重连窗口期）
      player.ws = null;
      player.disconnectedAt = Date.now();

      // 如果房主断线，自动指定新房主（按列表顺序找第一个还在线的）
      if (player.isHost) {
        const newHost = room.players.find(p => p.id !== player.id && p.ws && p.ws.readyState === WebSocket.OPEN);
        if (newHost) {
          player.isHost = false;
          newHost.isHost = true;
        }
      }

      // 通知其他在线玩家该玩家已暂时离开
      sendPlayerList(conn.roomCode);

      // 启动超时清理：5 分钟内不重连则彻底移除
      setTimeout(() => {
        const currentRoom = rooms.get(conn.roomCode);
        if (!currentRoom) return;
        const stillDown = currentRoom.players.find(p => p.id === conn.playerId);
        if (stillDown && stillDown.disconnectedAt) {
          currentRoom.players = currentRoom.players.filter(p => p.id !== conn.playerId);
          if (currentRoom.players.length === 0) {
            rooms.delete(conn.roomCode);
            console.log(`Room ${conn.roomCode} deleted (empty after timeout)`);
          } else {
            sendPlayerList(conn.roomCode);
          }
          console.log(`Player ${conn.playerId} removed after timeout`);
        }
      }, DISCONNECT_TIMEOUT_MS);
    } else {
      // 玩家已不存在，直接清理房间
      if (room.players.length === 0) {
        rooms.delete(conn.roomCode);
      }
    }
  }

  playerConnections.delete(ws);
  console.log('Player disconnected (waiting for reconnect)');
}

// ==================== 启动服务器 ====================
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
