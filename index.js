const express = require('express');
const app = express();
const http = require('http').Server(app);
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// 创建Socket.io服务器，监听3008端口，配置CORS
const io = new Server(http, {
  cors: {
    origin: ['https://chat.31tu.com', 'http://localhost:3000'], // 允许您的Vercel前端域名以及本地开发环境
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 简单的HTTP路由
app.get('/', (req, res) => {
  res.send('Socket.io Server Running');
});

// 存储聊天消息历史
let messageHistory = [];

// 存储在线用户
let onlineUsers = new Map();

// 游戏词语库
const gameWords = [
  // 普通词汇
  '苹果', '香蕉', '西瓜', '葡萄', '菠萝', '草莓', '橙子', '柠檬', '火龙果', '猕猴桃',
  '手机', '电脑', '相机', '耳机', '键盘', '鼠标', '显示器', '冰箱', '洗衣机', '空调',
  '篮球', '足球', '乒乓球', '网球', '排球', '棒球', '高尔夫', '羽毛球', '台球', '保龄球',
  '春天', '夏天', '秋天', '冬天', '阳光', '雨水', '雪花', '风暴', '雾霾', '彩虹',
  '锁骨', '美腿', '翘臀', '腹肌', '马甲线', '人鱼线', '红唇', '喉结', 
  '腰窝', '体香', '肌肉',
  '亲吻', '拥抱', '湿吻', '舌吻', '调情', '暧昧', '搭讪', '约会', 
  '壁咚', '摸头', '咬唇', '媚眼', '撒娇', '吃醋', '暗恋', '表白', 
  '同居', '情侣', '夫妻', '前任', '备胎', '心动', '脸红', '心跳', 
  '诱惑', '欲望', '冲动', '激情', '浪漫', '温柔', '体贴', '秘密', 
  '禁忌', '出轨', '捉奸',
  '酒店', '双人床', '泡泡浴', '按摩', '夜店', '酒吧', '微醺', '醉酒',
  '黄瓜', '香蕉', '草莓', '奶油', '冰淇淋', '棒棒糖', '车震',
  '内衣', '内裤', '胸罩', '文胸', '睡衣', '浴袍', '丝袜', '长筒袜', 
  '高跟鞋', '比基尼', '丁字裤', '情趣', '领带', '项圈', '手铐', 
  '眼罩', '口红', '香水', '蜡烛', '红酒', '钻戒', '玫瑰', '纹身',
  
  // 程序员词汇
  '算法', '数据结构', '变量', '函数', '对象', '类', '接口', '继承', '多态', '封装',
  '前端', '后端', '全栈', '框架', '库', '模块', '组件', '插件', '依赖', '包管理',
  '用户体验', '交互设计', '响应式', '自适应', '渐进式', '无障碍', '国际化', '本地化', '性能优化', '安全加固'
];

// 导入动物头像库
const { animalAvatars, aiAvatarUrl } = require('./src/utils/animalAvatars');

// 用户头像映射
let userAvatars = new Map();

// 为AI预先分配头像
userAvatars.set('AI', aiAvatarUrl);

// 游戏状态
const gameState = {
  isActive: false,
  currentBoss: null, // socketId
  currentBossNickname: null,
  currentWord: null,
  hint: null,
  remainingHintTime: 30, // 从15秒改为30秒
  remainingGuessTime: 30, // 倒计时30秒
  phase: 'waiting', // waiting, hinting, guessing, evaluating
  players: new Map(), // socketId -> {nickname, score, isOnline}
  ratings: {
    good: new Set(),
    bad: new Set()
  },
  lastReminderTime: 0, // 上次发送提醒的时间
  bossQueue: [], // BOSS角色轮换队列
  lastBossIndex: -1 // 上一次BOSS的索引
};

// AI API密钥轮询
const AI_API_KEYS = [
  'sk-oslnjqqafdpznjsanwvxzfyiwvsxkwszwxkrzfprgerzostm',
  'sk-fdjvzrjggrbvwibbggxzbzygzfpjkrupxvkpfuloihmtsvdr',
  'sk-daojiwvjmasvwikrllkvyliofvysibcxkmpnzioxclcirgtk'
];
let currentKeyIndex = 0;

// 获取下一个API密钥
function getNextApiKey() {
  const key = AI_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % AI_API_KEYS.length;
  return key;
}

// 调用AI API
async function callAiApi(prompt) {
  try {
    const apiKey = getNextApiKey();
    console.log('调用AI API，提示词:', prompt);
    const response = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: 'Qwen/QwQ-32B-Preview',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      console.log('AI API响应成功');
      return response.data.choices[0].message.content;
    } else {
      console.error('AI API响应格式错误:', response.data);
      return '抱歉，AI服务返回格式错误，请稍后再试。';
    }
  } catch (error) {
    console.error('AI API调用失败:', error.message);
    return '抱歉，AI服务暂时不可用，请稍后再试。';
  }
}

// 敏感词过滤系统
const sensitiveWords = ['习近平', '习包子', '独裁', '中共', '支那', '老习', '温家宝', '江泽民', '胡锦涛', '共产党', '共党', '老毛', '毛腊肉', '毛泽东', '习仲勋', '薄熙来', '暴乱', '台湾国', '独立', '法沦功', '法论', '中南海', '阿共', '老共', '共产', '政府', '兼职', '招聘', '收U', '出U', '出售', '小姐', '发票', '客服', '炸药', '毒品', '海洛因', '摇头丸', '手枪', '气枪', '迷药', 'www', 'http', 'com', 'xyz', 'net', 'cc', '傻逼', '操你妈', '垃圾', '废物', '滚蛋'];

// 用户封禁状态
let bannedUsers = new Map();

// 检查消息是否包含敏感词
function containsSensitiveWords(message) {
  if (!message || typeof message !== 'string') return false;
  
  // 预处理消息文本，移除特殊字符和多余空格
  let processedMessage = message
    .toLowerCase()
    .replace(/[\s!@#$%^&*()_+\-=\[\]{};:'",.<>?~！@#￥%……&*（）——+\-=【】{};：'"，。、？]/g, '')
    .trim();
  
  // 对每个敏感词进行检查
  for (const word of sensitiveWords) {
    // 预处理敏感词
    const processedWord = word.toLowerCase();
    // 检查是否包含敏感词
    if (processedMessage.includes(processedWord)) {
      return true;
    }
  }
  
  return false;
}

// 清理过期的封禁
function cleanupBannedUsers() {
  const now = Date.now();
  for (const [socketId, banInfo] of bannedUsers.entries()) {
    if (now > banInfo.expireAt) {
      bannedUsers.delete(socketId);
    }
  }
}

// 定期清理封禁用户（每分钟检查一次）
setInterval(cleanupBannedUsers, 60 * 1000);

// 限制消息历史记录数量
function limitMessageHistory() {
  if (messageHistory.length > 100) {
    messageHistory = messageHistory.slice(messageHistory.length - 100);
  }
}

// 处理清空消息
function clearMessages(password) {
  if (password === '55665566') {
    messageHistory = [];
    io.emit('clear_messages');
    return true;
  }
  return false;
}

// ===================== 游戏相关函数 =====================

// 生成随机词语
function getRandomWord() {
  const randomIndex = Math.floor(Math.random() * gameWords.length);
  return gameWords[randomIndex];
}

// 检查提示词是否合法（不能包含答案中的字）
function isValidHint(hint, word) {
  if (!hint || !word) return false;
  
  // 将提示词和答案转为字符数组
  const hintChars = Array.from(hint);
  const wordChars = Array.from(word);
  
  // 检查提示词中是否包含答案中的任何字
  for (const char of wordChars) {
    if (hintChars.includes(char)) {
      return false;
    }
  }
  
  return true;
}

// 存储永久排行榜数据
let permanentLeaderboard = new Map();

// 获取排行榜数据
function getLeaderboard() {
  // 从永久排行榜生成排行榜数据
  const players = Array.from(permanentLeaderboard.entries())
    .map(([nickname, data]) => ({
      nickname,
      score: data.score,
      isOnline: data.isOnline
    }))
    .sort((a, b) => b.score - a.score) // 按分数从高到低排序
    .slice(0, 10); // 只返回前10名
  
  console.log("当前排行榜:", players);
  return players;
}

// 开始新的游戏轮次
function startNewRound() {
  // 获取所有在线玩家
  const onlinePlayers = Array.from(gameState.players.entries())
    .filter(([socketId, playerData]) => {
      // 确保玩家在线并且存在于onlineUsers列表中
      return playerData.isOnline && onlineUsers.has(socketId);
    });
  
  if (onlinePlayers.length < 2) {
    // 不能开始游戏，至少需要2个在线玩家
    io.emit('game_status_update', {
      isActive: false,
      message: '需要至少2个在线玩家才能开始游戏'
    });
    gameState.isActive = false;
    gameState.phase = 'waiting';
    return;
  }
  
  // 重置评价
  gameState.ratings = {
    good: new Set(),
    bad: new Set()
  };
  
  // 更新BOSS队列，确保包含所有当前在线玩家
  updateBossQueue(onlinePlayers);
  
  // 选择下一个BOSS
  const nextBossInfo = selectNextBoss();
  if (!nextBossInfo) {
    console.log('无法选择BOSS，重新安排队列');
    // 重新安排队列
    updateBossQueue(onlinePlayers);
    const retryBossInfo = selectNextBoss();
    if (!retryBossInfo) {
      console.log('仍然无法选择BOSS，使用随机方式');
      // 随机选择一个作为BOSS（作为备选方案）
      const randomIndex = Math.floor(Math.random() * onlinePlayers.length);
      const [bossId, bossData] = onlinePlayers[randomIndex];
      gameState.currentBoss = bossId;
      gameState.currentBossNickname = bossData.nickname;
    } else {
      // 使用重试选择的BOSS
      const [bossId, bossNickname] = retryBossInfo;
      gameState.currentBoss = bossId;
      gameState.currentBossNickname = bossNickname;
    }
  } else {
    // 使用轮换选择的BOSS
    const [bossId, bossNickname] = nextBossInfo;
    gameState.currentBoss = bossId;
    gameState.currentBossNickname = bossNickname;
  }
  
  gameState.currentWord = getRandomWord();
  gameState.hint = null;
  gameState.remainingHintTime = 30; // 从15秒改为30秒
  gameState.remainingGuessTime = 30;
  gameState.phase = 'hinting';
  gameState.isActive = true;
  
  console.log(`新一轮游戏开始，BOSS是: ${gameState.currentBossNickname}，词语是: ${gameState.currentWord}`);
  
  // 通知所有人游戏开始
  io.emit('game_round_start', {
    bossNickname: gameState.currentBossNickname,
    phase: 'hinting',
    remainingTime: gameState.remainingHintTime
  });
  
  // 特别通知BOSS他是BOSS并给他词语
  io.to(gameState.currentBoss).emit('game_boss_word', {
    word: gameState.currentWord,
    remainingTime: gameState.remainingHintTime
  });
  
  // 开始提示阶段倒计时
  startHintCountdown();
}

// 更新BOSS队列
function updateBossQueue(onlinePlayers) {
  // 创建新的队列，只包含当前在线的玩家
  const newQueue = [];
  
  // 首先添加已有队列中仍然在线的玩家，保持原有顺序
  for (const [socketId, nickname] of gameState.bossQueue) {
    if (onlinePlayers.some(([id]) => id === socketId)) {
      newQueue.push([socketId, nickname]);
    }
  }
  
  // 然后添加队列中不存在的新玩家
  for (const [socketId, playerData] of onlinePlayers) {
    if (!newQueue.some(([id]) => id === socketId)) {
      newQueue.push([socketId, playerData.nickname]);
    }
  }
  
  // 更新队列
  gameState.bossQueue = newQueue;
  console.log("更新后的BOSS队列:", gameState.bossQueue.map(item => item[1]));
}

// 选择下一个BOSS
function selectNextBoss() {
  if (gameState.bossQueue.length === 0) {
    return null;
  }
  
  // 从上一个BOSS的位置开始，选择下一个
  let nextIndex = (gameState.lastBossIndex + 1) % gameState.bossQueue.length;
  
  // 记录新的BOSS索引
  gameState.lastBossIndex = nextIndex;
  
  // 返回选中的BOSS信息 [socketId, nickname]
  return gameState.bossQueue[nextIndex];
}

// 提示阶段倒计时
function startHintCountdown() {
  const hintInterval = setInterval(() => {
    gameState.remainingHintTime--;
    
    // 通知所有玩家倒计时更新
    io.emit('game_countdown', {
      phase: 'hinting',
      remainingTime: gameState.remainingHintTime
    });
    
    if (gameState.remainingHintTime <= 0 || gameState.phase !== 'hinting') {
      clearInterval(hintInterval);
      
      // 如果还在hinting阶段且时间到了，自动进入猜词阶段
      if (gameState.phase === 'hinting') {
        if (!gameState.hint) {
          // BOSS没有提供提示，自动结束本轮
          io.emit('game_boss_timeout', {
            bossNickname: gameState.currentBossNickname,
            word: gameState.currentWord
          });
          
          // 重新开始
          setTimeout(startNewRound, 5000);
        } else {
          // 有提示，进入猜词阶段
          gameState.phase = 'guessing';
          gameState.remainingGuessTime = 30;
          
          io.emit('game_phase_change', {
            phase: 'guessing',
            hint: gameState.hint,
            remainingTime: gameState.remainingGuessTime
          });
          
          startGuessCountdown();
        }
      }
    }
  }, 1000);
}

// 猜词阶段倒计时
function startGuessCountdown() {
  const guessInterval = setInterval(() => {
    gameState.remainingGuessTime--;
    
    // 通知所有玩家倒计时更新
    io.emit('game_countdown', {
      phase: 'guessing',
      remainingTime: gameState.remainingGuessTime
    });
    
    if (gameState.remainingGuessTime <= 0 || gameState.phase !== 'guessing') {
      clearInterval(guessInterval);
      
      // 如果还在guessing阶段且时间到了，则BOSS获胜
      if (gameState.phase === 'guessing') {
        gameState.phase = 'evaluating';
        
        // BOSS获胜，加10分
        if (gameState.players.has(gameState.currentBoss)) {
          const bossData = gameState.players.get(gameState.currentBoss);
          bossData.score += 10;
          gameState.players.set(gameState.currentBoss, bossData);
          
          console.log(`BOSS ${gameState.currentBossNickname} 获胜，获得10分，当前分数: ${bossData.score}`);
        }
        
        // 通知所有人BOSS获胜
        io.emit('game_boss_win', {
          bossNickname: gameState.currentBossNickname,
          word: gameState.currentWord,
          hint: gameState.hint
        });
        
        // 发送系统消息
        io.emit('system_message', {
          id: uuidv4(),
          text: `${gameState.currentBossNickname} 在"你说我猜"游戏中获得了胜利！答案是: ${gameState.currentWord}`,
          timestamp: Date.now()
        });
        
        // 进入评价阶段，确保包含答案和BOSS信息
        io.emit('game_phase_change', {
          phase: 'evaluating',
          word: gameState.currentWord,
          hint: gameState.hint,
          bossNickname: gameState.currentBossNickname
        });
        
        // 10秒后开始新的一轮
        setTimeout(() => {
          // 检查评价结果
          processRatings();
          // 更新永久排行榜
          updatePermanentLeaderboard();
          startNewRound();
        }, 10000);
      }
    }
  }, 1000);
}

// 处理对BOSS提示的评价
function processRatings() {
  const goodCount = gameState.ratings.good.size;
  const badCount = gameState.ratings.bad.size;
  
  if (badCount >= 2) {
    // 至少两个人评价为差，取消BOSS的得分
    if (gameState.players.has(gameState.currentBoss)) {
      const bossData = gameState.players.get(gameState.currentBoss);
      bossData.score -= 10; // 扣回之前加的分
      gameState.players.set(gameState.currentBoss, bossData);
      
      console.log(`BOSS ${gameState.currentBossNickname} 提示词被评价为差，扣除10分，当前分数: ${bossData.score}`);
      
      // 广播消息
      io.emit('system_message', {
        id: uuidv4(),
        text: `${gameState.currentBossNickname} 玩家作为Boss,提示词水平较差！不计分！`,
        timestamp: Date.now()
      });
    }
  } else if (goodCount >= 2) {
    // 至少两个人评价为好，BOSS额外得5分
    if (gameState.players.has(gameState.currentBoss)) {
      const bossData = gameState.players.get(gameState.currentBoss);
      bossData.score += 5; // 额外加5分
      gameState.players.set(gameState.currentBoss, bossData);
      
      console.log(`BOSS ${gameState.currentBossNickname} 提示词被评价为好，额外获得5分，当前分数: ${bossData.score}`);
      
      // 广播消息
      io.emit('system_message', {
        id: uuidv4(),
        text: `${gameState.currentBossNickname} 玩家作为Boss,提示词优秀，获得了15分！`,
        timestamp: Date.now()
      });
    }
  }
  
  // 评价后立即更新排行榜数据
  updatePermanentLeaderboard();
  // 刷新排行榜显示
  io.emit('game_leaderboard_update', {
    players: getLeaderboard()
  });
}

// 连接事件处理
io.on('connection', (socket) => {
  console.log('用户已连接:', socket.id);
  
  // 处理心跳请求
  socket.on('ping', () => {
    socket.emit('pong');
    console.log('收到心跳请求，已响应');
  });
  
  // 处理清空消息请求
  socket.on('clear_messages', (data) => {
    console.log('收到清空消息请求，密码:', data);
    const { password } = data;
    const cleared = clearMessages(password);
    if (cleared) {
      console.log('聊天记录已被管理员清空');
    } else {
      console.log('清空消息失败：密码错误');
      // 通知用户密码错误
      socket.emit('system_message', {
        id: uuidv4(),
        text: '清空聊天记录失败：密码错误',
        timestamp: Date.now()
      });
    }
  });
  
  // 用户加入聊天室
  socket.on('join', (data) => {
    const { nickname } = data;
    console.log(`用户 ${nickname} 尝试加入聊天室`);
    
    // 检查昵称是否已被使用
    let isNicknameUsed = false;
    for (const [socketId, userData] of onlineUsers.entries()) {
      if (userData.nickname === nickname && socketId !== socket.id) {
        isNicknameUsed = true;
        break;
      }
    }
    
    if (isNicknameUsed) {
      // 通知用户昵称已被使用
      socket.emit('nickname_used', {
        message: '该昵称已被使用，请换一个昵称'
      });
      return;
    }
    
    // 为新用户分配固定动物头像
    if (!userAvatars.has(nickname)) {
      // 使用昵称的哈希值来确定头像索引，这样同一用户总是获得相同的头像
      const hashCode = nickname.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const avatarIndex = hashCode % animalAvatars.length;
      userAvatars.set(nickname, animalAvatars[avatarIndex]);
      console.log(`为用户 ${nickname} 分配新头像: ${animalAvatars[avatarIndex]}`);
    } else {
      console.log(`用户 ${nickname} 使用已有头像: ${userAvatars.get(nickname)}`);
    }

    // 存储用户信息
    onlineUsers.set(socket.id, {
      nickname,
      joinTime: Date.now(),
      avatar: userAvatars.get(nickname)
    });
    
    console.log(`当前在线用户数: ${onlineUsers.size}`);
    
    // 广播在线人数更新
    io.emit('online_count', onlineUsers.size);
    
    // 发送系统消息通知新用户加入
    const systemMessage = {
      id: uuidv4(),
      text: `${nickname} 加入了聊天室`,
      timestamp: Date.now()
    };
    
    io.emit('system_message', systemMessage);
    
    // 发送历史消息给新用户
    console.log(`向用户 ${nickname} 发送 ${messageHistory.length} 条历史消息`);
    messageHistory.forEach(msg => {
      socket.emit('message', msg);
    });
    
    // 发送游戏状态给新用户
    socket.emit('game_status_update', {
      isActive: gameState.isActive,
      phase: gameState.phase,
      players: getLeaderboard(),
      currentBossNickname: gameState.currentBossNickname,
      hint: gameState.hint,
      remainingTime: gameState.phase === 'hinting' ? gameState.remainingHintTime : gameState.remainingGuessTime
    });
  });
  
  // 处理用户发送的消息
  socket.on('message', async (data) => {
    const { nickname, text, isAiEnabled } = data;
    console.log(`收到来自 ${nickname} 的消息:`, text);
    console.log('是否启用AI回复:', isAiEnabled);
    
    // 检查用户是否被封禁
    if (bannedUsers.has(socket.id)) {
      console.log(`用户 ${nickname} 已被封禁，消息被拦截`);
      return;
    }
    
    // 检查消息是否包含敏感词
    if (containsSensitiveWords(text)) {
      console.log(`用户 ${nickname} 的消息包含敏感词，已拦截`);
      // 发送提示消息
      socket.emit('system_message', {
        id: uuidv4(),
        text: '您的消息包含敏感词，已被拦截。请注意文明用语，修改后重新发送。',
        timestamp: Date.now()
      });
      return; // 直接返回，不发送消息
    }
    
    // 创建消息对象
    const message = {
      id: uuidv4(),
      nickname,
      text,
      timestamp: Date.now(),
      avatar: userAvatars.get(nickname) // 添加用户头像
    };
    
    console.log(`广播消息 ID: ${message.id}, 头像: ${message.avatar}`);
    
    // 添加到历史记录
    messageHistory.push(message);
    limitMessageHistory();
    
    // 广播消息给所有用户
    io.emit('message', message);
    
    // 如果游戏正在进行且处于猜词阶段，检查是否猜对了答案
    if (gameState.isActive && gameState.phase === 'guessing') {
      // 检查是否匹配正确答案(使用更灵活的匹配方式)
      const isCorrectAnswer = checkAnswer(text, gameState.currentWord);
      
      if (isCorrectAnswer) {
        // 用户猜对了答案
        const playerSocketId = socket.id;
        
        // 确保猜对的人不是BOSS自己
        if (playerSocketId !== gameState.currentBoss) {
          // 玩家获胜，加5分
          if (gameState.players.has(playerSocketId)) {
            const playerData = gameState.players.get(playerSocketId);
            playerData.score += 5;
            gameState.players.set(playerSocketId, playerData);
            
            console.log(`玩家 ${nickname} 猜对答案，获得5分，当前分数: ${playerData.score}`);
          }
          
          // 进入评价阶段
          gameState.phase = 'evaluating';
          
          // 通知所有人有玩家猜对了
          io.emit('game_player_win', {
            playerNickname: nickname,
            word: gameState.currentWord,
            hint: gameState.hint
          });
          
          // 发送系统消息
          io.emit('system_message', {
            id: uuidv4(),
            text: `${nickname} 在"你说我猜"游戏中猜对了答案: ${gameState.currentWord}`,
            timestamp: Date.now()
          });
          
          // 进入评价阶段，确保包含答案和BOSS信息
          io.emit('game_phase_change', {
            phase: 'evaluating',
            word: gameState.currentWord,
            hint: gameState.hint,
            bossNickname: gameState.currentBossNickname
          });
          
          // 10秒后开始新的一轮
          setTimeout(() => {
            // 检查评价结果
            processRatings();
            // 更新永久排行榜
            updatePermanentLeaderboard();
            startNewRound();
          }, 10000);
        }
      }
    }
    
    // 如果启用了AI，调用AI API并发送回复
    if (isAiEnabled) {
      try {
        console.log(`为用户 ${nickname} 生成AI回复，提示词: ${text}`);
        // 调用AI API获取回复
        const aiResponse = await callAiApi(text);
        console.log('AI回复内容:', aiResponse);
        
        // 创建AI回复消息
        const aiMessage = {
          id: uuidv4(),
          nickname: 'AI',
          text: `@${nickname} ${aiResponse}`,
          timestamp: Date.now(),
          avatar: userAvatars.get('AI') // 确保使用预设的AI头像
        };
        
        console.log(`发送AI消息 ID: ${aiMessage.id}, 头像: ${aiMessage.avatar}`);
        
        // 添加到历史记录
        messageHistory.push(aiMessage);
        limitMessageHistory();
        
        // 广播AI回复给所有用户
        io.emit('message', aiMessage);
      } catch (error) {
        console.error('AI处理失败:', error);
        // 发送AI错误消息
        socket.emit('system_message', {
          id: uuidv4(),
          text: '很抱歉，AI回复生成失败，请稍后再试。',
          timestamp: Date.now()
        });
      }
    }
  });
  
  // ========== 游戏相关事件处理 ==========
  
  // 加入游戏
  socket.on('join_game', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    // 将用户添加到游戏玩家列表
    gameState.players.set(socket.id, {
      nickname: user.nickname,
      score: 0,
      isOnline: true
    });
    
    console.log(`用户 ${user.nickname} 加入了游戏`);
    
    // 将新玩家添加到BOSS队列中
    if (!gameState.bossQueue.some(([id]) => id === socket.id)) {
      gameState.bossQueue.push([socket.id, user.nickname]);
      console.log(`将用户 ${user.nickname} 添加到BOSS队列`);
    }
    
    // 通知所有人有新玩家加入
    io.emit('game_player_joined', {
      nickname: user.nickname,
      players: getLeaderboard()
    });
    
    // 如果游戏未激活且有足够的玩家，开始游戏
    if (!gameState.isActive && gameState.players.size >= 2) {
      startNewRound();
    } else {
      // 发送当前游戏状态给新加入的玩家
      socket.emit('game_status_update', {
        isActive: gameState.isActive,
        phase: gameState.phase,
        players: getLeaderboard(),
        currentBossNickname: gameState.currentBossNickname,
        hint: gameState.hint,
        remainingTime: gameState.phase === 'hinting' ? gameState.remainingHintTime : gameState.remainingGuessTime
      });
      
      // 如果当前玩家是BOSS，发送词语
      if (gameState.currentBoss === socket.id) {
        socket.emit('game_boss_word', {
          word: gameState.currentWord,
          remainingTime: gameState.remainingHintTime
        });
      }
    }
  });
  
  // 离开游戏
  socket.on('leave_game', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    
    // 从游戏玩家列表中移除
    if (gameState.players.has(socket.id)) {
      console.log(`用户 ${user.nickname} 离开了游戏`);
      
      // 完全删除玩家数据，而不是标记为离线
      gameState.players.delete(socket.id);
      
      // 从BOSS队列中移除
      gameState.bossQueue = gameState.bossQueue.filter(([id]) => id !== socket.id);
      console.log(`将用户 ${user.nickname} 从BOSS队列中移除`);
      
      // 如果当前离开的玩家是最后一个BOSS，需要调整lastBossIndex
      if (gameState.lastBossIndex >= gameState.bossQueue.length) {
        gameState.lastBossIndex = gameState.bossQueue.length - 1;
      }
      
      // 通知所有人有玩家离开
      io.emit('game_player_left', {
        nickname: user.nickname,
        players: getLeaderboard()
      });
      
      // 如果当前玩家是BOSS，且游戏正在进行，重新开始游戏
      if (gameState.currentBoss === socket.id && gameState.isActive) {
        io.emit('game_boss_left', {
          bossNickname: user.nickname
        });
        
        // 延迟2秒后开始新游戏
        setTimeout(startNewRound, 2000);
      }
      
      // 如果游戏中没有足够的玩家，停止游戏
      if (gameState.players.size < 2) {
        gameState.isActive = false;
        gameState.phase = 'waiting';
        io.emit('game_status_update', {
          isActive: false,
          message: '玩家数量不足，游戏暂停'
        });
      }
    }
  });
  
  // BOSS提交提示词
  socket.on('submit_hint', (data) => {
    const { hint } = data;
    const user = onlineUsers.get(socket.id);
    if (!user || gameState.currentBoss !== socket.id || gameState.phase !== 'hinting') return;
    
    console.log(`BOSS ${user.nickname} 提交了提示词: ${hint}`);
    
    // 检查提示词是否合法
    if (!isValidHint(hint, gameState.currentWord)) {
      socket.emit('hint_invalid', {
        message: '提示词不能包含答案中的字，请重新输入'
      });
      return;
    }
    
    // 保存提示词
    gameState.hint = hint;
    
    // 进入猜词阶段
    gameState.phase = 'guessing';
    gameState.remainingGuessTime = 30;
    
    // 通知所有人进入猜词阶段
    io.emit('game_phase_change', {
      phase: 'guessing',
      hint: hint,
      remainingTime: gameState.remainingGuessTime
    });
    
    // 开始猜词阶段倒计时
    startGuessCountdown();
  });
  
  // 提交对BOSS的评价
  socket.on('rate_boss', (data) => {
    const { rating } = data; // 'good' 或 'bad'
    const user = onlineUsers.get(socket.id);
    if (!user || gameState.phase !== 'evaluating' || socket.id === gameState.currentBoss) return;
    
    console.log(`用户 ${user.nickname} 对BOSS的评价: ${rating}`);
    
    if (rating === 'good') {
      gameState.ratings.good.add(socket.id);
      gameState.ratings.bad.delete(socket.id); // 确保不会同时存在于两个集合中
    } else if (rating === 'bad') {
      gameState.ratings.bad.add(socket.id);
      gameState.ratings.good.delete(socket.id); // 确保不会同时存在于两个集合中
    }
    
    // 通知所有人评价更新
    io.emit('game_ratings_update', {
      good: gameState.ratings.good.size,
      bad: gameState.ratings.bad.size
    });
  });
  
  // 处理用户离开
  socket.on('disconnect', () => {
    // 检查是否是已登记的用户
    if (onlineUsers.has(socket.id)) {
      const user = onlineUsers.get(socket.id);
      const nickname = user.nickname;
      
      console.log(`用户 ${nickname} 断开连接`);
      
      // 从在线用户列表中移除
      onlineUsers.delete(socket.id);
      
      // 如果用户是游戏玩家，完全从游戏中移除
      if (gameState.players.has(socket.id)) {
        // 完全删除玩家而不是标记为离线
        gameState.players.delete(socket.id);
        
        // 从BOSS队列中移除
        gameState.bossQueue = gameState.bossQueue.filter(([id]) => id !== socket.id);
        console.log(`将用户 ${nickname} 从BOSS队列中移除（断开连接）`);
        
        // 如果当前离开的玩家是最后一个BOSS，需要调整lastBossIndex
        if (gameState.lastBossIndex >= gameState.bossQueue.length) {
          gameState.lastBossIndex = gameState.bossQueue.length - 1;
        }
        
        // 通知所有人有玩家离开游戏
        io.emit('game_player_left', {
          nickname: nickname,
          players: getLeaderboard()
        });
        
        // 如果用户是当前BOSS，重新开始游戏
        if (gameState.currentBoss === socket.id && gameState.isActive) {
          io.emit('game_boss_left', {
            bossNickname: nickname
          });
          
          // 延迟2秒后开始新游戏
          setTimeout(startNewRound, 2000);
        }
      }
      
      console.log(`当前在线用户数: ${onlineUsers.size}`);
      
      // 广播在线人数更新
      io.emit('online_count', onlineUsers.size);
      
      // 广播用户离开消息
      io.emit('system_message', {
        id: uuidv4(),
        text: `${nickname} 离开了聊天室`,
        timestamp: Date.now()
      });
    } else {
      console.log('未注册用户断开连接');
    }
  });

  // 处理用户修改昵称
  socket.on('change_nickname', (data, callback) => {
    const { oldNickname, newNickname } = data;
    console.log(`用户 ${oldNickname} 尝试修改昵称为 ${newNickname}`);
    
    try {
      // 检查新昵称是否合法
      if (!newNickname || newNickname.length < 2 || newNickname.length > 12) {
        console.log('昵称长度不合法');
        callback({ success: false, message: '昵称长度必须在2-12个字符之间' });
        return;
      }
      
      // 检查新昵称是否包含敏感词
      if (containsSensitiveWords(newNickname)) {
        console.log('昵称包含敏感词');
        callback({ success: false, message: '昵称包含敏感词，请换一个' });
        return;
      }
      
      // 检查新昵称是否已被使用
      let isNicknameUsed = false;
      for (const [socketId, userData] of onlineUsers.entries()) {
        if (userData.nickname === newNickname && socketId !== socket.id) {
          isNicknameUsed = true;
          break;
        }
      }
      
      if (isNicknameUsed) {
        console.log('昵称已被使用');
        callback({ success: false, message: '该昵称已被使用，请换一个' });
        return;
      }
      
      // 保存旧昵称以便发送系统消息
      const oldUserData = onlineUsers.get(socket.id);
      if (!oldUserData) {
        callback({ success: false, message: '未找到用户信息' });
        return;
      }
      
      // 更新用户昵称
      const newUserData = {
        ...oldUserData,
        nickname: newNickname
      };
      onlineUsers.set(socket.id, newUserData);
      
      // 如果是游戏玩家，更新游戏玩家昵称
      if (gameState.players.has(socket.id)) {
        const playerData = gameState.players.get(socket.id);
        playerData.nickname = newNickname;
        gameState.players.set(socket.id, playerData);
        
        // 如果是当前BOSS，更新BOSS昵称
        if (gameState.currentBoss === socket.id) {
          gameState.currentBossNickname = newNickname;
        }
      }
      
      // 更新永久排行榜中的昵称
      if (permanentLeaderboard.has(oldNickname)) {
        const userData = permanentLeaderboard.get(oldNickname);
        permanentLeaderboard.delete(oldNickname);
        permanentLeaderboard.set(newNickname, userData);
        console.log(`永久排行榜中用户 ${oldNickname} 的昵称已更新为 ${newNickname}`);
        
        // 更新并广播排行榜
        io.emit('game_leaderboard_update', {
          players: getLeaderboard()
        });
      }
      
      // 发送系统消息通知昵称修改
      io.emit('system_message', {
        id: uuidv4(),
        text: `${oldNickname} 修改昵称为 ${newNickname}`,
        timestamp: Date.now()
      });
      
      // 广播昵称变更事件
      io.emit('nickname_changed', {
        oldNickname,
        newNickname,
        avatar: userAvatars.get(newNickname) // 添加头像信息
      });
      
      // 返回成功
      callback({ success: true, message: '昵称修改成功' });
    } catch (error) {
      console.error('处理修改昵称请求时出错:', error);
      callback({ success: false, message: '服务器处理请求时出错，请稍后再试' });
    }
  });

  // 在connection内添加轮盘游戏的socket事件处理
  
  // 加入轮盘游戏
  socket.on('join_roulette', () => {
    try {
      const userData = onlineUsers.get(socket.id);
      if (!userData) return;
      
      // 检查玩家是否已在游戏中
      if (!rouletteState.players.has(socket.id)) {
        // 新玩家加入游戏，初始筹码10000
        rouletteState.players.set(socket.id, {
          nickname: userData.nickname,
          chips: 10000,
          bets: []
        });
        
        console.log(`用户 ${userData.nickname} 加入轮盘游戏，初始筹码: 10000`);
        
        // 如果是第一个玩家加入，启动游戏
        if (rouletteState.players.size === 1 && !rouletteState.gameStarted) {
          startRouletteGame();
        }
      }
      
      // 向玩家发送当前游戏状态
      const playerData = rouletteState.players.get(socket.id);
      socket.emit('roulette_join_success', {
        chips: playerData.chips,
        bettingOpen: rouletteState.bettingOpen,
        spinning: rouletteState.spinning,
        lastResult: rouletteState.lastSpinResult,
        bettingTimeRemaining: rouletteState.bettingTimeRemaining
      });
      
      // 获取所有玩家的下注情况
      const allBets = Array.from(rouletteState.players.entries()).map(([id, player]) => {
        return {
          nickname: player.nickname,
          bets: player.bets
        };
      });
      
      // 向玩家发送当前所有下注
      socket.emit('roulette_all_bets', {
        bets: allBets
      });
      
      // 发送轮盘排行榜
      socket.emit('roulette_leaderboard_update', {
        players: getRouletteLeaderboard()
      });
      
      // 通知所有人新玩家加入
      io.emit('roulette_player_joined', {
        nickname: userData.nickname
      });
    } catch (error) {
      console.error('处理加入轮盘游戏请求时出错:', error);
    }
  });
  
  // 离开轮盘游戏
  socket.on('leave_roulette', () => {
    try {
      const userData = onlineUsers.get(socket.id);
      if (!userData) return;
      
      // 检查玩家是否在游戏中
      if (rouletteState.players.has(socket.id)) {
        // 从游戏中移除玩家
        rouletteState.players.delete(socket.id);
        
        console.log(`用户 ${userData.nickname} 离开轮盘游戏`);
        
        // 通知所有人玩家离开
        io.emit('roulette_player_left', {
          nickname: userData.nickname
        });
      }
    } catch (error) {
      console.error('处理离开轮盘游戏请求时出错:', error);
    }
  });
  
  // 下注
  socket.on('place_bet', (data, callback) => {
    try {
      // 验证投注数据
      const { type, number, numbers, column, dozen, amount } = data;
      
      // 检查游戏状态
      if (!rouletteState.bettingOpen || rouletteState.spinning) {
        callback({
          success: false,
          message: '当前不能下注，请等待下一轮'
        });
        return;
      }
      
      // 检查玩家是否在游戏中
      if (!rouletteState.players.has(socket.id)) {
        callback({
          success: false,
          message: '请先加入游戏'
        });
        return;
      }
      
      const playerData = rouletteState.players.get(socket.id);
      
      // 检查下注金额
      if (amount < rouletteState.minBet || amount > rouletteState.maxBet) {
        callback({
          success: false,
          message: `下注金额必须在 ${rouletteState.minBet} 到 ${rouletteState.maxBet} 之间`
        });
        return;
      }
      
      // 检查玩家筹码是否足够
      if (playerData.chips < amount) {
        callback({
          success: false,
          message: '筹码不足'
        });
        return;
      }
      
      // 验证下注类型
      let betData = { type, amount };
      
      switch (type) {
        case 'straight':
          if (number === undefined || (number !== 0 && number !== '00' && (number < 1 || number > 36))) {
            callback({
              success: false,
              message: '无效的数字'
            });
            return;
          }
          betData.number = number;
          break;
          
        case 'split':
        case 'street':
        case 'corner':
        case 'line':
          if (!Array.isArray(numbers) || numbers.length < 2) {
            callback({
              success: false,
              message: '无效的数字组合'
            });
            return;
          }
          betData.numbers = numbers;
          break;
          
        case 'dozen':
          if (!['first', 'second', 'third'].includes(dozen)) {
            callback({
              success: false,
              message: '无效的数字区间'
            });
            return;
          }
          betData.dozen = dozen;
          break;
          
        case 'column':
          if (!['first', 'second', 'third'].includes(column)) {
            callback({
              success: false,
              message: '无效的列'
            });
            return;
          }
          betData.column = column;
          break;
          
        case 'even':
        case 'odd':
        case 'red':
        case 'black':
        case 'low':
        case 'high':
          // 这些类型不需要额外参数
          break;
          
        default:
          callback({
            success: false,
            message: '无效的下注类型'
          });
          return;
      }
      
      // 扣除玩家筹码
      playerData.chips -= amount;
      
      // 添加下注
      playerData.bets.push(betData);
      
      // 更新玩家数据
      rouletteState.players.set(socket.id, playerData);
      
      console.log(`用户 ${playerData.nickname} 下注 ${amount} 筹码在 ${type} 上`);
      
      // 通知玩家下注成功
      callback({
        success: true,
        message: '下注成功',
        newBalance: playerData.chips
      });
      
      // 广播玩家下注信息给所有人
      io.emit('roulette_bet_placed', {
        nickname: playerData.nickname,
        bet: betData
      });
    } catch (error) {
      console.error('处理下注请求时出错:', error);
      callback({
        success: false,
        message: '服务器处理请求时出错'
      });
    }
  });
  
  // 转动轮盘
  socket.on('spin_wheel', (data, callback) => {
    try {
      const userData = onlineUsers.get(socket.id);
      if (!userData) return;
      
      // 检查玩家是否在游戏中
      if (!rouletteState.players.has(socket.id)) {
        callback({
          success: false,
          message: '请先加入游戏'
        });
        return;
      }
      
      // 检查是否有任何下注
      let hasBets = false;
      for (const [, playerData] of rouletteState.players.entries()) {
        if (playerData.bets.length > 0) {
          hasBets = true;
          break;
        }
      }
      
      if (!hasBets) {
        callback({
          success: false,
          message: '至少需要一个玩家下注才能开始'
        });
        return;
      }
      
      // 检查轮盘是否可以转动
      if (rouletteState.spinning) {
        callback({
          success: false,
          message: '轮盘正在转动中'
        });
        return;
      }
      
      // 转动轮盘
      const result = spinRouletteWheel();
      
      if (result === null) {
        callback({
          success: false,
          message: '轮盘不能转动'
        });
      } else {
        callback({
          success: true,
          message: '轮盘开始转动'
        });
      }
    } catch (error) {
      console.error('处理转动轮盘请求时出错:', error);
      callback({
        success: false,
        message: '服务器处理请求时出错'
      });
    }
  });
  
  // 获取筹码余额
  socket.on('get_chips_balance', (data, callback) => {
    try {
      // 检查玩家是否在游戏中
      if (!rouletteState.players.has(socket.id)) {
        callback({
          success: false,
          message: '请先加入游戏',
          balance: 0
        });
        return;
      }
      
      const playerData = rouletteState.players.get(socket.id);
      
      callback({
        success: true,
        balance: playerData.chips
      });
    } catch (error) {
      console.error('处理获取筹码余额请求时出错:', error);
      callback({
        success: false,
        message: '服务器处理请求时出错',
        balance: 0
      });
    }
  });
});

// 启动服务器
const PORT = 3008;
http.listen(PORT, () => {
  console.log(`Socket.io服务器正在运行，端口: ${PORT}`);
});

// 定期打印服务器状态
setInterval(() => {
  console.log(`=== 服务器状态 [${new Date().toLocaleString()}] ===`);
  console.log(`在线用户: ${onlineUsers.size}`);
  console.log(`历史消息: ${messageHistory.length}`);
  console.log(`游戏玩家: ${gameState.players.size}`);
  console.log(`游戏状态: ${gameState.isActive ? '进行中' : '未开始'}`);
  console.log('=====================');
}, 5 * 60 * 1000); // 每5分钟

// 添加定期检查游戏状态的函数
function checkGameStatus() {
  const now = Date.now();
  // 如果游戏处于等待状态且至少有一个玩家
  if (!gameState.isActive && gameState.phase === 'waiting' && gameState.players.size > 0 && gameState.players.size < 2) {
    // 每20秒发送一次提醒
    if (now - gameState.lastReminderTime > 20000) {
      // 获取第一个玩家
      const firstPlayer = Array.from(gameState.players.values())[0];
      
      // 发送系统消息
      io.emit('system_message', {
        id: uuidv4(),
        text: `${firstPlayer.nickname} 正在等待你加入游戏哦！`,
        timestamp: now
      });
      
      // 更新上次提醒时间
      gameState.lastReminderTime = now;
    }
  }
}

// 每5秒检查一次游戏状态
setInterval(checkGameStatus, 5000);

// 更新永久排行榜数据
function updatePermanentLeaderboard() {
  for (const [socketId, playerData] of gameState.players.entries()) {
    const nickname = playerData.nickname;
    const score = playerData.score;
    
    // 如果玩家已经在永久排行榜中，更新分数
    if (permanentLeaderboard.has(nickname)) {
      const existingData = permanentLeaderboard.get(nickname);
      // 更新为最新分数，无论是高还是低
      existingData.score = score;
      existingData.isOnline = onlineUsers.has(socketId);
      permanentLeaderboard.set(nickname, existingData);
      console.log(`更新玩家 ${nickname} 的永久排行榜分数为 ${score}`);
    } else {
      // 否则添加到永久排行榜
      permanentLeaderboard.set(nickname, {
        score: score,
        isOnline: onlineUsers.has(socketId)
      });
      console.log(`添加玩家 ${nickname} 到永久排行榜，分数为 ${score}`);
    }
  }
  
  // 刷新排行榜显示
  io.emit('game_leaderboard_update', {
    players: getLeaderboard()
  });
}

// 轮盘赌博游戏状态
const rouletteState = {
  isActive: false,
  players: new Map(), // socketId -> {nickname, chips, bets: [{type, number, amount}]}
  lastSpinResult: null,
  lastWinners: [], // [{nickname, winAmount}]
  spinning: false,
  spinStartTime: 0,
  spinDuration: 5000, // 5秒转盘时间
  bettingOpen: true,
  minBet: 100,
  maxBet: 10000,
  bettingTimeRemaining: 40, // 从20秒改为40秒
  bettingInterval: null, // 用于存储定时器
  gameStarted: false // 游戏是否已开始
};

// 轮盘永久排行榜
let roulettePermanentLeaderboard = new Map();

// 获取轮盘游戏排行榜
function getRouletteLeaderboard() {
  // 从永久排行榜生成排行榜数据
  const players = Array.from(roulettePermanentLeaderboard.entries())
    .map(([nickname, data]) => ({
      nickname,
      chips: data.chips,
      isOnline: data.isOnline
    }))
    .sort((a, b) => b.chips - a.chips) // 按筹码从高到低排序
    .slice(0, 10); // 只返回前10名
  
  console.log("当前轮盘排行榜:", players);
  return players;
}

// 更新轮盘永久排行榜数据
function updateRoulettePermanentLeaderboard() {
  for (const [socketId, playerData] of rouletteState.players.entries()) {
    const nickname = playerData.nickname;
    const chips = playerData.chips;
    
    // 如果玩家已经在永久排行榜中，更新筹码数
    if (roulettePermanentLeaderboard.has(nickname)) {
      const existingData = roulettePermanentLeaderboard.get(nickname);
      // 只有当当前筹码更多时才更新排行榜
      if (chips > existingData.chips) {
        existingData.chips = chips;
        existingData.isOnline = onlineUsers.has(socketId);
        roulettePermanentLeaderboard.set(nickname, existingData);
        console.log(`更新玩家 ${nickname} 的轮盘永久排行榜筹码为 ${chips}`);
      }
    } else if (chips > 10000) {
      // 只有筹码超过初始值的玩家才加入排行榜
      roulettePermanentLeaderboard.set(nickname, {
        chips: chips,
        isOnline: onlineUsers.has(socketId)
      });
      console.log(`添加玩家 ${nickname} 到轮盘永久排行榜，筹码为 ${chips}`);
    }
  }
  
  // 刷新排行榜显示
  io.emit('roulette_leaderboard_update', {
    players: getRouletteLeaderboard()
  });
}

// 美式轮盘数字和颜色定义
const rouletteNumbers = [
  {number: 0, color: 'green'},
  {number: '00', color: 'green'},
  {number: 1, color: 'red'},
  {number: 2, color: 'black'},
  {number: 3, color: 'red'},
  {number: 4, color: 'black'},
  {number: 5, color: 'red'},
  {number: 6, color: 'black'},
  {number: 7, color: 'red'},
  {number: 8, color: 'black'},
  {number: 9, color: 'red'},
  {number: 10, color: 'black'},
  {number: 11, color: 'black'},
  {number: 12, color: 'red'},
  {number: 13, color: 'black'},
  {number: 14, color: 'red'},
  {number: 15, color: 'black'},
  {number: 16, color: 'red'},
  {number: 17, color: 'black'},
  {number: 18, color: 'red'},
  {number: 19, color: 'red'},
  {number: 20, color: 'black'},
  {number: 21, color: 'red'},
  {number: 22, color: 'black'},
  {number: 23, color: 'red'},
  {number: 24, color: 'black'},
  {number: 25, color: 'red'},
  {number: 26, color: 'black'},
  {number: 27, color: 'red'},
  {number: 28, color: 'black'},
  {number: 29, color: 'black'},
  {number: 30, color: 'red'},
  {number: 31, color: 'black'},
  {number: 32, color: 'red'},
  {number: 33, color: 'black'},
  {number: 34, color: 'red'},
  {number: 35, color: 'black'},
  {number: 36, color: 'red'}
];

// 赔率表 - 用于计算赢得金额
const roulettePayout = {
  straight: 30, // 单个数字(1到36, 0, 00) - 赔率 30:1
  split: 15,    // 两个相邻数字的组合 - 赔率 15:1
  street: 10,   // 三个数字的水平线 - 赔率 10:1
  corner: 7,    // 四个数字的方块 - 赔率 7:1
  line: 5,      // 六个数字的两条水平线 - 赔率 5:1
  dozen: 2,     // 12个数字的区间 (1-12, 13-24, 25-36) - 赔率 2:1
  column: 2,    // 一列12个数字 - 赔率 2:1
  even: 2,      // 偶数 - 赔率 2:1
  odd: 2,       // 奇数 - 赔率 2:1
  red: 2,       // 红色 - 赔率 2:1
  black: 2,     // 黑色 - 赔率 2:1
  low: 2,       // 低数字 (1-18) - 赔率 2:1
  high: 2       // 高数字 (19-36) - 赔率 2:1
};

// 投注类型检查函数
function isWinningBet(bet, result) {
  const resultNumber = result.number;
  const resultColor = result.color;
  
  switch(bet.type) {
    case 'straight':
      return bet.number === resultNumber;
    
    case 'split':
      return bet.numbers.includes(resultNumber);
    
    case 'street':
      return bet.numbers.includes(resultNumber);
    
    case 'corner':
      return bet.numbers.includes(resultNumber);
    
    case 'line':
      return bet.numbers.includes(resultNumber);
    
    case 'dozen':
      if (resultNumber === 0 || resultNumber === '00') return false;
      const num = parseInt(resultNumber);
      if (bet.dozen === 'first') return num >= 1 && num <= 12;
      if (bet.dozen === 'second') return num >= 13 && num <= 24;
      if (bet.dozen === 'third') return num >= 25 && num <= 36;
      return false;
    
    case 'column':
      if (resultNumber === 0 || resultNumber === '00') return false;
      const column = parseInt(resultNumber) % 3;
      if (bet.column === 'first') return column === 1;
      if (bet.column === 'second') return column === 2;
      if (bet.column === 'third') return column === 0;
      return false;
    
    case 'even':
      if (resultNumber === 0 || resultNumber === '00') return false;
      return parseInt(resultNumber) % 2 === 0;
    
    case 'odd':
      if (resultNumber === 0 || resultNumber === '00') return false;
      return parseInt(resultNumber) % 2 === 1;
    
    case 'red':
      return resultColor === 'red';
    
    case 'black':
      return resultColor === 'black';
    
    case 'low':
      if (resultNumber === 0 || resultNumber === '00') return false;
      return parseInt(resultNumber) >= 1 && parseInt(resultNumber) <= 18;
    
    case 'high':
      return parseInt(resultNumber) >= 19 && parseInt(resultNumber) <= 36;
    
    default:
      return false;
  }
}

// 启动轮盘游戏循环
function startRouletteGame() {
  // 无论是否已启动，都重置游戏状态
  clearInterval(rouletteState.bettingInterval);
  
  rouletteState.gameStarted = true;
  rouletteState.bettingOpen = true;
  rouletteState.spinning = false;
  rouletteState.bettingTimeRemaining = 40; // 从20秒改为40秒
  
  // 通知所有玩家游戏开始，但不发送系统消息，只更新游戏状态
  io.emit('roulette_game_started', {
    bettingTimeRemaining: rouletteState.bettingTimeRemaining
  });
  
  // 开始下注倒计时
  rouletteState.bettingInterval = setInterval(() => {
    rouletteState.bettingTimeRemaining--;
    
    // 广播倒计时，但不发送系统消息，只更新游戏状态
    io.emit('roulette_betting_countdown', {
      timeRemaining: rouletteState.bettingTimeRemaining
    });
    
    // 当倒计时结束，自动转动轮盘
    if (rouletteState.bettingTimeRemaining <= 0) {
      clearInterval(rouletteState.bettingInterval);
      
      // 检查是否有玩家下注
      let hasBets = false;
      for (const [, playerData] of rouletteState.players.entries()) {
        if (playerData.bets.length > 0) {
          hasBets = true;
          break;
        }
      }
      
      if (hasBets) {
        // 有玩家下注，转动轮盘
        spinRouletteWheel();
      } else {
        // 无人下注，重新开始新一轮
        setTimeout(() => {
          startRouletteGame();
        }, 2000);
      }
    }
  }, 1000);
}

// 轮盘随机转动
function spinRouletteWheel() {
  if (rouletteState.spinning) return null;
  
  // 关闭下注
  rouletteState.bettingOpen = false;
  rouletteState.spinning = true;
  rouletteState.spinStartTime = Date.now();
  
  // 通知所有玩家轮盘开始转动
  io.emit('roulette_spin_start', {
    message: '轮盘转动中...'
  });
  
  // 设置定时器，模拟转盘时间
  setTimeout(() => {
    // 随机选择一个结果
    const randomIndex = Math.floor(Math.random() * rouletteNumbers.length);
    const result = rouletteNumbers[randomIndex];
    rouletteState.lastSpinResult = result;
    
    // 处理所有玩家的投注
    processRouletteBets(result);
    
    // 通知所有玩家结果
    io.emit('roulette_spin_result', {
      result: result,
      winners: rouletteState.lastWinners
    });
    
    // 重置状态
    rouletteState.spinning = false;
    rouletteState.bettingOpen = true;
    rouletteState.lastWinners = [];
    
    // 等待几秒后开始新一轮
    setTimeout(() => {
      startRouletteGame();
    }, 5000);
  }, rouletteState.spinDuration);
  
  return true;
}

// 处理投注结果
function processRouletteBets(result) {
  rouletteState.lastWinners = [];
  
  // 遍历所有玩家
  for (const [socketId, playerData] of rouletteState.players.entries()) {
    let totalWinAmount = 0;
    
    // 检查每个投注
    for (const bet of playerData.bets) {
      const isWinner = isWinningBet(bet, result);
      if (isWinner) {
        // 计算赢得金额 = 投注额 * 赔率
        const winAmount = bet.amount * roulettePayout[bet.type];
        totalWinAmount += winAmount;
      }
    }
    
    // 支付赢得的筹码
    if (totalWinAmount > 0) {
      playerData.chips += totalWinAmount;
      rouletteState.lastWinners.push({
        nickname: playerData.nickname,
        winAmount: totalWinAmount
      });
      
      // 通知玩家
      io.to(socketId).emit('roulette_win', {
        amount: totalWinAmount,
        newBalance: playerData.chips
      });
    }
    
    // 清空玩家投注
    playerData.bets = [];
    rouletteState.players.set(socketId, playerData);
  }
  
  // 更新永久排行榜
  updateRoulettePermanentLeaderboard();
}

// 检查答案是否匹配
function checkAnswer(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) return false;
  
  // 去除空格和标点符号，转为小写进行比较
  const normalizeText = (text) => {
    return text.toLowerCase()
      .replace(/\s+/g, '')  // 移除所有空格
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ''); // 移除标点符号
  };
  
  const normalizedUserAnswer = normalizeText(userAnswer);
  const normalizedCorrectAnswer = normalizeText(correctAnswer);
  
  // 完全匹配
  if (normalizedUserAnswer === normalizedCorrectAnswer) {
    return true;
  }
  
  // 包含匹配（如果用户答案包含了完整的正确答案）
  if (normalizedUserAnswer.includes(normalizedCorrectAnswer)) {
    return true;
  }
  
  // 答案包含在消息中（适用于长句子）
  if (normalizedUserAnswer.length > normalizedCorrectAnswer.length * 2 && 
      normalizedUserAnswer.includes(normalizedCorrectAnswer)) {
    return true;
  }
  
  return false;
}