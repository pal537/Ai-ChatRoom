import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { EmojiClickData } from 'emoji-picker-react';
import io, { Socket } from 'socket.io-client';
import { RiRobot2Line } from 'react-icons/ri';
import { BsEmojiSmile } from 'react-icons/bs';
import { FaGamepad, FaTrophy, FaThumbsUp, FaThumbsDown } from 'react-icons/fa';

// 动态导入EmojiPicker组件，避免服务器端渲染
const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

type Message = {
  id: string;
  nickname: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
  avatar?: string;
};

type SystemMessage = {
  id: string;
  text: string;
  timestamp: number;
};

type Player = {
  nickname: string;
  score: number;
  isOnline: boolean;
};

type GameState = {
  isActive: boolean;
  phase: 'waiting' | 'hinting' | 'guessing' | 'evaluating';
  currentBossNickname: string | null;
  word: string | null;
  hint: string | null;
  remainingTime: number;
  message?: string;
};

// 轮盘游戏类型定义
type RouletteBet = {
  type: 'straight' | 'split' | 'street' | 'corner' | 'line' | 'dozen' | 'column' | 'even' | 'odd' | 'red' | 'black' | 'low' | 'high';
  amount: number;
  number?: number | string;
  numbers?: (number | string)[];
  dozen?: 'first' | 'second' | 'third';
  column?: 'first' | 'second' | 'third';
};

type RoulettePlayer = {
  nickname: string;
  chips: number;
  bets: RouletteBet[];
};

type RouletteResult = {
  number: number | string;
  color: 'red' | 'black' | 'green';
};

type RouletteState = {
  isActive: boolean;
  spinning: boolean;
  bettingOpen: boolean;
  lastResult: RouletteResult | null;
  winners: {nickname: string, winAmount: number}[];
};

// 轮盘玩家排行榜类型定义
type RouletteLeaderboardPlayer = {
  nickname: string;
  chips: number;
  isOnline: boolean;
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [nickname, setNickname] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banTimeLeft, setBanTimeLeft] = useState(0);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  
  // 游戏相关状态
  const [inGame, setInGame] = useState<boolean>(false);
  const [gameState, setGameState] = useState<GameState>({
    isActive: false,
    phase: 'waiting',
    currentBossNickname: null,
    word: null,
    hint: null,
    remainingTime: 0
  });
  const [gameHint, setGameHint] = useState<string>('');
  const [gamePlayers, setGamePlayers] = useState<Player[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [isBoss, setIsBoss] = useState<boolean>(false);
  const [gameRatings, setGameRatings] = useState<{good: number, bad: number}>({ good: 0, bad: 0 });
  const [hasRated, setHasRated] = useState<boolean>(false);
  const [showGamePanel, setShowGamePanel] = useState<boolean>(false);
  
  // 轮盘游戏相关状态
  const [inRouletteGame, setInRouletteGame] = useState<boolean>(false);
  const [showRoulettePanel, setShowRoulettePanel] = useState<boolean>(false);
  const [rouletteState, setRouletteState] = useState<RouletteState>({
    isActive: false,
    spinning: false,
    bettingOpen: true,
    lastResult: null,
    winners: []
  });
  const [rouletteChips, setRouletteChips] = useState<number>(0);
  const [routlettePlayers, setRoulettePlayers] = useState<RoulettePlayer[]>([]);
  const [currentBet, setCurrentBet] = useState<{type: string, value: any} | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [allBets, setAllBets] = useState<{nickname: string, bet: RouletteBet}[]>([]);
  const [selectedBetType, setSelectedBetType] = useState<string>('');
  const [selectedNumber, setSelectedNumber] = useState<number | string | null>(null);
  const [bettingTimeRemaining, setBettingTimeRemaining] = useState<number>(20);
  const [rouletteRotation, setRouletteRotation] = useState<number>(0);
  const [showRouletteRules, setShowRouletteRules] = useState<boolean>(false);
  const [rouletteLeaderboard, setRouletteLeaderboard] = useState<RouletteLeaderboardPlayer[]>([]);
  const [showRouletteLeaderboard, setShowRouletteLeaderboard] = useState<boolean>(false);
  
  // 添加新的状态用于管理昵称修改弹窗
  const [showNicknameModal, setShowNicknameModal] = useState<boolean>(false);
  const [newNickname, setNewNickname] = useState<string>('');
  const [nicknameError, setNicknameError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 修改自动滚动逻辑
  const scrollToBottom = () => {
    if (shouldScrollToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (shouldScrollToBottom) {
      scrollToBottom();
    }
  }, [messages, systemMessages, shouldScrollToBottom]);

  // 添加滚动事件监听，检测用户是否在浏览历史消息
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 检查是否接近底部（容差范围设为100px）
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShouldScrollToBottom(isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 初始化Socket连接和事件监听
  useEffect(() => {
    // 从localStorage获取昵称
    const savedNickname = localStorage.getItem('chat-nickname');
    if (!savedNickname) {
      router.push('/');
      return;
    }
    setNickname(savedNickname);

    // 初始化连接
    try {
      setConnectionStatus('connecting');
      console.log('初始化Socket.io连接...');
      
      const SOCKET_SERVER_URL = 'https://io.31tu.com';
      
      const newSocket = io(SOCKET_SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000,
        forceNew: true,
        secure: true,
        rejectUnauthorized: false
      });
      
      // 添加连接错误处理
      newSocket.on('connect_error', (error) => {
        console.error('Socket连接错误:', error);
        const errorMsg: SystemMessage = {
          id: Date.now().toString(),
          text: `连接错误: ${error.message}`,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, errorMsg]);
      });

      // 添加重连尝试处理
      newSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`尝试重连 #${attemptNumber}`);
        const reconnectMsg: SystemMessage = {
          id: Date.now().toString(),
          text: `正在尝试重连服务器 (${attemptNumber})...`,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, reconnectMsg]);
      });
      
      socketRef.current = newSocket;
      
      // 设置所有事件监听
      setupSocketListeners(newSocket);
      
      // 设置连接超时自动重试
      const connectionTimeout = setTimeout(() => {
        if (!newSocket.connected && connectionStatus !== 'connected') {
          console.log('连接超时，尝试使用测试连接功能重新连接');
          testConnection();
        }
      }, 8000); // 8秒后如果还没连接成功，自动重试
      
      // 连接成功或组件卸载时清除超时定时器
      newSocket.on('connect', () => {
        clearTimeout(connectionTimeout);
        // 添加成功连接消息
        const successMsg: SystemMessage = {
          id: Date.now().toString(),
          text: '已成功连接到聊天服务器',
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, successMsg]);
      });
      
      return () => {
        clearTimeout(connectionTimeout);
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (error) {
      console.error('建立连接时出错:', error);
      setConnectionStatus('disconnected');
      // 添加连接失败消息
      const failMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, failMsg]);
      return () => {};
    }
  }, [router]);

  // 发送消息
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || !socket || isBanned) return;

    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    
    if (timeSinceLastMessage < 5000) {
      const remainingTime = Math.ceil((5000 - timeSinceLastMessage) / 1000);
      const warningMsg: SystemMessage = {
        id: now.toString(),
        text: `请等待${remainingTime}秒后再发送消息`,
        timestamp: now
      };
      setSystemMessages(prev => [...prev, warningMsg]);
      setTimeout(() => {
        setSystemMessages(prev => prev.filter(m => m.id !== warningMsg.id));
      }, 2000);
      return;
    }
    
    console.log('发送消息:', inputMessage, '是否启用AI:', isAiEnabled);
    
    socket.emit('message', {
      nickname,
      text: inputMessage,
      isAiEnabled
    });
    
    setLastMessageTime(now);
    setInputMessage('');
  };
  
  // 处理表情点击
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInputMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };
  
  // 切换AI功能
  const toggleAi = () => {
    const newState = !isAiEnabled;
    console.log('AI功能状态切换为:', newState ? '启用' : '禁用');
    setIsAiEnabled(newState);
    
    // 显示AI功能切换消息
    const aiToggleMsg: SystemMessage = {
      id: Date.now().toString(),
      text: newState ? '✅ AI回复功能已启用' : '❌ AI回复功能已禁用',
      timestamp: Date.now()
    };
    setSystemMessages(prev => [...prev, aiToggleMsg]);
  };

  // =========== 游戏相关函数 ===========
  
  // 加入游戏
  const handleJoinGame = () => {
    if (!socket) return;
    
    console.log('加入游戏');
    socket.emit('join_game');
    setShowGamePanel(true);
  };
  
  // 离开游戏
  const handleLeaveGame = () => {
    if (!socket) return;
    
    console.log('离开游戏');
    socket.emit('leave_game');
    setInGame(false);
    setIsBoss(false);
    setShowGamePanel(false);
  };
  
  // 提交提示词
  const handleSubmitHint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !gameHint || !isBoss || gameState.phase !== 'hinting') return;
    
    console.log('提交提示词:', gameHint);
    socket.emit('submit_hint', { hint: gameHint });
  };
  
  // 评价BOSS提示
  const handleRateBoss = (rating: 'good' | 'bad') => {
    if (!socket || hasRated || isBoss || gameState.phase !== 'evaluating') return;
    
    console.log('评价BOSS:', rating);
    socket.emit('rate_boss', { rating });
    setHasRated(true);
  };
  
  // 切换排行榜显示
  const toggleLeaderboard = () => {
    setShowLeaderboard(!showLeaderboard);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // 测试连接函数
  const testConnection = () => {
    if (socket) {
      // 已有连接，先断开
      socket.disconnect();
      setSocket(null);
    }
    
    // 显示测试消息
    const testMsg: SystemMessage = {
      id: Date.now().toString(),
      text: '正在测试连接...',
      timestamp: Date.now()
    };
    setSystemMessages(prev => [...prev, testMsg]);
    
    // 重新初始化连接
    try {
      setConnectionStatus('connecting');
      console.log('尝试连接Socket.io服务器...');
      
      // 尝试多种连接方式
      const SOCKET_SERVER_URL = 'https://io.31tu.com';
      
      const newSocket = io(SOCKET_SERVER_URL, {
        // 允许多种传输方式，优先使用WebSocket，失败时回退到polling
        transports: ['websocket', 'polling'],
        // 重连配置
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        // 超时配置
        timeout: 20000,
        // 强制新连接
        forceNew: true,
        // HTTPS连接配置
        secure: true,
        rejectUnauthorized: false
      });
      
      // 添加连接错误处理
      newSocket.on('connect_error', (error) => {
        console.error('测试连接时出错:', error);
        const errorMsg: SystemMessage = {
          id: Date.now().toString(),
          text: `测试连接错误: ${error.message}`,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, errorMsg]);
      });
      
      socketRef.current = newSocket;
      
      // 设置所有事件监听
      setupSocketListeners(newSocket);
      
      // 显示连接状态
      setTimeout(() => {
        if (!newSocket.connected) {
          const timeoutMsg: SystemMessage = {
            id: Date.now().toString(),
            text: '连接超时，请检查网络或服务器状态',
            timestamp: Date.now()
          };
          setSystemMessages(prev => [...prev, timeoutMsg]);
          setConnectionStatus('disconnected');
        }
      }, 10000);
    } catch (error) {
      console.error('测试连接时出错:', error);
      setConnectionStatus('disconnected');
    }
  };
  
  // 设置Socket事件监听
  const setupSocketListeners = (newSocket: Socket) => {
    const savedNickname = localStorage.getItem('chat-nickname') || '';
    
    // 监听昵称已被使用事件
    newSocket.on('nickname_used', (data: { message: string }) => {
      console.log('昵称已被使用:', data.message);
      // 显示错误消息
      alert(data.message);
      // 删除本地存储的昵称
      localStorage.removeItem('chat-nickname');
      // 重定向回首页
      router.push('/');
    });
    
    // 监听连接状态
    newSocket.on('connect', () => {
      console.log('Socket.io连接成功! ID:', newSocket.id);
      setConnectionStatus('connected');
      setSocket(newSocket);
      
      // 发送加入事件
      newSocket.emit('join', { nickname: savedNickname });
      
      // 显示连接成功消息
      const successMsg: SystemMessage = {
        id: Date.now().toString(),
        text: '连接服务器成功!',
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, successMsg]);
      
      // 设置心跳检测
      const heartbeatInterval = setInterval(() => {
        if (newSocket.connected) {
          newSocket.emit('ping');
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 每30秒发送一次心跳
      
      // 清理心跳
      newSocket.on('disconnect', () => {
        clearInterval(heartbeatInterval);
      });
    });

    // 监听连接错误
    newSocket.on('connect_error', (err) => {
      console.error('Socket.io连接错误:', err.message);
      setConnectionStatus('disconnected');
      
      // 显示错误消息
      const errorMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `连接服务器失败: ${err.message}`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, errorMsg]);
    });

    // 监听重连尝试
    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket.io尝试重连 (${attemptNumber}次)`);
      setConnectionStatus('connecting');
      
      if (attemptNumber > 1) {
        // 显示重连消息
        const reconnectMsg: SystemMessage = {
          id: Date.now().toString(),
          text: `正在尝试重新连接 (第${attemptNumber}次)...`,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, reconnectMsg]);
      }
    });

    // 监听重连成功
    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`Socket.io重连成功, 尝试了${attemptNumber}次`);
      setConnectionStatus('connected');
      
      // 显示重连成功消息
      const successMsg: SystemMessage = {
        id: Date.now().toString(),
        text: '重新连接成功!',
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, successMsg]);
      
      // 重新加入聊天室
      newSocket.emit('join', { nickname: savedNickname });
    });

    // 监听断开连接
    newSocket.on('disconnect', (reason) => {
      console.log('Socket.io断开连接:', reason);
      setConnectionStatus('disconnected');
      
      // 显示断开连接消息
      const disconnectMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `与服务器断开连接: ${reason}`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, disconnectMsg]);
    });

    // 监听在线人数更新
    newSocket.on('online_count', (count: number) => {
      console.log('收到在线人数更新:', count);
      setOnlineCount(count);
    });

    // 监听新消息
    newSocket.on('message', (msg: { id: string; nickname: string; text: string; timestamp: number; avatar?: string }) => {
      console.log('收到新消息:', msg);
      
      // 添加游戏逻辑检查
      if (gameState.isActive && gameState.phase === 'guessing' && gameState.currentBossNickname && 
          msg.nickname !== gameState.currentBossNickname && gameState.word) {
        // 如果当前是猜词阶段，且消息不是来自BOSS，检查是否是正确答案
        if (checkAnswer(msg.text, gameState.word)) {
          console.log('本地检测到正确答案:', msg.text);
          
          // 添加一个本地系统消息提示玩家
          const correctAnswerMsg: SystemMessage = {
            id: Date.now().toString(),
            text: `${msg.nickname} 猜出了正确答案: ${gameState.word}`,
            timestamp: Date.now()
          };
          setSystemMessages(prev => [...prev, correctAnswerMsg]);
        }
      }
      
      setMessages(prev => [...prev, {
        ...msg,
        isSelf: msg.nickname === savedNickname
      }]);
    });

    // 监听系统消息（如用户加入）
    newSocket.on('system_message', (msg: { id: string; text: string; timestamp: number }) => {
      console.log('收到系统消息:', msg);
      setSystemMessages(prev => [...prev, msg]);
      
      // 系统消息2秒后自动消失
      setTimeout(() => {
        setSystemMessages(prev => prev.filter(m => m.id !== msg.id));
      }, 2000);
    });

    // 监听消息清空事件
    newSocket.on('clear_messages', () => {
      console.log('收到清空消息事件');
      setMessages([]);
      const clearMsg: SystemMessage = {
        id: Date.now().toString(),
        text: '聊天记录已清空',
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, clearMsg]);
      setTimeout(() => {
        setSystemMessages(prev => prev.filter(m => m.id !== clearMsg.id));
      }, 2000);
    });

    // 监听封禁事件
    newSocket.on('banned', (data: { duration: number, reason: string }) => {
      console.log('收到封禁事件:', data);
      setIsBanned(true);
      setBanTimeLeft(data.duration / 1000 / 60); // 转换为分钟
      
      // 倒计时
      const interval = setInterval(() => {
        setBanTimeLeft(prev => {
          if (prev <= 0) {
            clearInterval(interval);
            setIsBanned(false);
            return 0;
          }
          return prev - 1/60; // 每秒减少1/60分钟
        });
      }, 1000);
    });
    
    // ========== 游戏相关事件监听 ==========
    
    // 游戏状态更新
    newSocket.on('game_status_update', (data: {
      isActive: boolean;
      phase: 'waiting' | 'hinting' | 'guessing' | 'evaluating';
      players: Player[];
      currentBossNickname: string | null;
      hint: string | null;
      remainingTime: number;
      message?: string;
    }) => {
      console.log('收到游戏状态更新:', data);
      setGameState({
        isActive: data.isActive,
        phase: data.phase,
        currentBossNickname: data.currentBossNickname,
        word: null, // 只有BOSS才能知道答案
        hint: data.hint,
        remainingTime: data.remainingTime,
        message: data.message
      });
      
      setGamePlayers(data.players);
      
      // 检查是否是BOSS
      if (data.currentBossNickname === savedNickname) {
        setIsBoss(true);
      } else {
        setIsBoss(false);
      }
    });
    
    // 收到BOSS词语
    newSocket.on('game_boss_word', (data: {
      word: string;
      remainingTime: number;
    }) => {
      console.log('收到BOSS词语:', data);
      setGameState(prev => ({
        ...prev,
        word: data.word,
        remainingTime: data.remainingTime
      }));
      setIsBoss(true);
    });
    
    // 游戏轮次开始
    newSocket.on('game_round_start', (data: {
      bossNickname: string;
      phase: 'hinting' | 'guessing';
      remainingTime: number;
    }) => {
      console.log('游戏轮次开始:', data);
      setGameState(prev => ({
        ...prev,
        isActive: true,
        phase: data.phase,
        currentBossNickname: data.bossNickname,
        hint: null,
        remainingTime: data.remainingTime
      }));
      
      // 重置提示输入
      setGameHint('');
      
      // 重置评价状态
      setHasRated(false);
      setGameRatings({ good: 0, bad: 0 });
      
      // 检查是否是BOSS
      if (data.bossNickname === savedNickname) {
        setIsBoss(true);
      } else {
        setIsBoss(false);
      }
    });
    
    // 游戏阶段变化
    newSocket.on('game_phase_change', (data: {
      phase: 'hinting' | 'guessing' | 'evaluating';
      hint?: string;
      word?: string;
      remainingTime?: number;
    }) => {
      console.log('游戏阶段变化:', data);
      setGameState(prev => ({
        ...prev,
        phase: data.phase,
        hint: data.hint || prev.hint,
        word: data.word || prev.word,
        remainingTime: data.remainingTime || prev.remainingTime
      }));
      
      // 重置评价状态
      if (data.phase === 'evaluating') {
        setHasRated(false);
        setGameRatings({ good: 0, bad: 0 });
      }
    });
    
    // 倒计时更新
    newSocket.on('game_countdown', (data: {
      phase: 'hinting' | 'guessing';
      remainingTime: number;
    }) => {
      setGameState(prev => ({
        ...prev,
        phase: data.phase,
        remainingTime: data.remainingTime
      }));
    });
    
    // BOSS超时
    newSocket.on('game_boss_timeout', (data: {
      bossNickname: string;
      word: string;
    }) => {
      console.log('BOSS超时:', data);
      setGameState(prev => ({
        ...prev,
        phase: 'waiting',
        word: data.word
      }));
      
      // 显示系统消息
      const timeoutMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `${data.bossNickname} 未能及时提供提示，答案是: ${data.word}`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, timeoutMsg]);
    });
    
    // BOSS获胜
    newSocket.on('game_boss_win', (data: {
      bossNickname: string;
      word: string;
      hint: string;
    }) => {
      console.log('BOSS获胜:', data);
      setGameState(prev => ({
        ...prev,
        phase: 'evaluating',
        word: data.word,
        hint: data.hint
      }));
    });
    
    // 玩家获胜
    newSocket.on('game_player_win', (data: {
      playerNickname: string;
      word: string;
      hint: string;
    }) => {
      console.log('玩家获胜:', data);
      setGameState(prev => ({
        ...prev,
        phase: 'evaluating',
        word: data.word,
        hint: data.hint
      }));
      
      // 添加更明显的游戏获胜提示
      const winMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `🎮 游戏提示: ${data.playerNickname} 猜出了正确答案 "${data.word}"! 👏`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, winMsg]);
      
      // 提示消息持续时间延长到5秒
      setTimeout(() => {
        setSystemMessages(prev => prev.filter(m => m.id !== winMsg.id));
      }, 5000);
    });
    
    // 玩家加入游戏
    newSocket.on('game_player_joined', (data: {
      nickname: string;
      players: Player[];
    }) => {
      console.log('玩家加入游戏:', data);
      setGamePlayers(data.players);
      
      if (data.nickname === savedNickname) {
        setInGame(true);
      }
    });
    
    // 玩家离开游戏
    newSocket.on('game_player_left', (data: {
      nickname: string;
      players: Player[];
    }) => {
      console.log('玩家离开游戏:', data);
      setGamePlayers(data.players);
      
      if (data.nickname === savedNickname) {
        setInGame(false);
      }
    });
    
    // BOSS离开游戏
    newSocket.on('game_boss_left', (data: {
      bossNickname: string;
    }) => {
      console.log('BOSS离开游戏:', data);
      const bossLeftMsg: SystemMessage = {
        id: Date.now().toString(),
        text: `BOSS ${data.bossNickname} 离开了游戏，正在重新分配角色...`,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, bossLeftMsg]);
    });
    
    // 提示词无效
    newSocket.on('hint_invalid', (data: {
      message: string;
    }) => {
      console.log('提示词无效:', data);
      const invalidHintMsg: SystemMessage = {
        id: Date.now().toString(),
        text: data.message,
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, invalidHintMsg]);
    });
    
    // 评价更新
    newSocket.on('game_ratings_update', (data: {
      good: number;
      bad: number;
    }) => {
      console.log('评价更新:', data);
      setGameRatings(data);
    });

    // 排行榜更新
    newSocket.on('game_leaderboard_update', (data: {
      players: Player[];
    }) => {
      console.log('排行榜更新:', data);
      if (data && Array.isArray(data.players)) {
        setGamePlayers(data.players);
      } else {
        console.error('排行榜数据格式错误:', data);
        setGamePlayers([]); // 设置为空数组避免undefined错误
      }
    });

    // 监听昵称修改成功事件
    newSocket.on('nickname_changed', (data: { oldNickname: string; newNickname: string; avatar?: string }) => {
      console.log('收到昵称修改成功事件:', data);
      
      // 如果是当前用户修改的昵称，更新本地存储
      if (data.oldNickname === savedNickname) {
        localStorage.setItem('chat-nickname', data.newNickname);
        setNickname(data.newNickname);
        setIsSubmitting(false);
        setShowNicknameModal(false);
        
        // 显示成功消息
        const successMsg: SystemMessage = {
          id: Date.now().toString(),
          text: `昵称已成功修改为 ${data.newNickname}`,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, successMsg]);
      }
      
      // 更新消息列表中的昵称，确保isSelf标志正确设置
      setMessages(prev => prev.map(msg => {
        if (msg.nickname === data.oldNickname) {
          return {
            ...msg,
            nickname: data.newNickname,
            isSelf: data.newNickname === savedNickname,
            avatar: data.avatar || msg.avatar // 使用服务器提供的新头像
          };
        }
        return msg;
      }));
    });

    // ========== 轮盘游戏相关事件监听 ==========
    
    // 加入游戏成功
    newSocket.on('roulette_join_success', (data: {
      chips: number;
      bettingOpen: boolean;
      spinning: boolean;
      lastResult: RouletteResult | null;
      bettingTimeRemaining: number;
    }) => {
      console.log('成功加入轮盘游戏:', data);
      setInRouletteGame(true);
      setRouletteChips(data.chips);
      setRouletteState(prev => ({
        ...prev,
        bettingOpen: data.bettingOpen,
        spinning: data.spinning,
        lastResult: data.lastResult
      }));
      setBettingTimeRemaining(data.bettingTimeRemaining);
    });
    
    // 游戏开始
    newSocket.on('roulette_game_started', (data: {
      message: string;
      bettingTimeRemaining: number;
    }) => {
      console.log('轮盘游戏开始:', data);
      setBettingTimeRemaining(data.bettingTimeRemaining);
      setRouletteState(prev => ({
        ...prev,
        bettingOpen: true,
        spinning: false
      }));
      
      // 移除系统消息提示
    });
    
    // 下注倒计时
    newSocket.on('roulette_betting_countdown', (data: {
      timeRemaining: number;
    }) => {
      console.log('收到轮盘下注倒计时更新:', data);
      setBettingTimeRemaining(data.timeRemaining);
      
      // 移除5秒倒计时提示
    });
    
    // 收到所有当前下注
    newSocket.on('roulette_all_bets', (data: {
      bets: {nickname: string, bets: RouletteBet[]}[];
    }) => {
      console.log('收到所有下注:', data);
      
      // 转换格式为UI显示需要的格式
      const formattedBets: {nickname: string, bet: RouletteBet}[] = [];
      data.bets.forEach(player => {
        player.bets.forEach(bet => {
          formattedBets.push({
            nickname: player.nickname,
            bet: bet
          });
        });
      });
      
      setAllBets(formattedBets);
    });
    
    // 玩家加入游戏
    newSocket.on('roulette_player_joined', (data: {
      nickname: string;
    }) => {
      console.log('玩家加入轮盘游戏:', data);
      // 移除玩家加入系统消息
    });
    
    // 玩家离开游戏
    newSocket.on('roulette_player_left', (data: {
      nickname: string;
    }) => {
      console.log('玩家离开轮盘游戏:', data);
      // 移除玩家离开系统消息
    });
    
    // 有玩家下注
    newSocket.on('roulette_bet_placed', (data: {
      nickname: string;
      bet: RouletteBet;
    }) => {
      console.log('玩家下注:', data);
      
      // 添加到下注列表
      setAllBets(prev => [...prev, data]);
      
      // 移除玩家下注的系统消息
    });
    
    // 轮盘开始转动
    newSocket.on('roulette_spin_start', (data: {
      message: string;
    }) => {
      console.log('轮盘开始转动:', data);
      setRouletteState(prev => ({
        ...prev,
        spinning: true,
        bettingOpen: false
      }));
      
      // 添加随机旋转动画
      const randomRotations = 5 + Math.floor(Math.random() * 5); // 5-10圈
      const newRotation = rouletteRotation + (randomRotations * 360);
      setRouletteRotation(newRotation);
      
      // 移除系统消息提示
    });
    
    // 轮盘结果
    newSocket.on('roulette_spin_result', (data: {
      result: RouletteResult;
      winners: {nickname: string, winAmount: number}[];
    }) => {
      console.log('轮盘结果:', data);
      setRouletteState(prev => ({
        ...prev,
        spinning: false,
        bettingOpen: true,
        lastResult: data.result,
        winners: data.winners
      }));
      
      // 清空所有下注
      setAllBets([]);
      
      // 移除结果消息和赢家消息提示
    });
    
    // 赢得筹码
    newSocket.on('roulette_win', (data: {
      amount: number;
      newBalance: number;
    }) => {
      console.log('赢得筹码:', data);
      setRouletteChips(data.newBalance);
      
      // 移除赢得筹码的系统消息提示
    });
    
    // 轮盘排行榜更新
    newSocket.on('roulette_leaderboard_update', (data: {
      players: RouletteLeaderboardPlayer[];
    }) => {
      console.log('收到轮盘排行榜更新:', data);
      setRouletteLeaderboard(data.players);
    });
  };

  // 添加修改昵称的函数
  const handleChangeNickname = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!socket || !newNickname.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setNicknameError('');
    
    // 设置超时计时器，如果10秒内没有收到响应，自动关闭弹窗
    const timeoutTimer = setTimeout(() => {
      console.error('修改昵称请求超时');
      setIsSubmitting(false);
      setNicknameError('请求超时，请稍后再试');
      // 显示错误消息
      const errorMsg: SystemMessage = {
        id: Date.now().toString(),
        text: '修改昵称请求超时，请稍后再试',
        timestamp: Date.now()
      };
      setSystemMessages(prev => [...prev, errorMsg]);
    }, 10000);
    
    try {
      // 向服务器发送修改昵称请求
      socket.emit('change_nickname', { oldNickname: nickname, newNickname }, (response: { success: boolean; message: string }) => {
        // 清除超时计时器
        clearTimeout(timeoutTimer);
        setIsSubmitting(false);
        
        if (response && response.success) {
          // 修改成功
          localStorage.setItem('chat-nickname', newNickname);
          setNickname(newNickname);
          setShowNicknameModal(false);
          
          // 显示成功消息
          const successMsg: SystemMessage = {
            id: Date.now().toString(),
            text: `昵称已成功修改为 ${newNickname}`,
            timestamp: Date.now()
          };
          setSystemMessages(prev => [...prev, successMsg]);
        } else {
          // 修改失败，显示错误
          setNicknameError(response ? response.message : '服务器未返回有效响应');
        }
      });
    } catch (error) {
      // 清除超时计时器
      clearTimeout(timeoutTimer);
      console.error('修改昵称时出错:', error);
      setIsSubmitting(false);
      setNicknameError('发送请求时出错，请稍后再试');
    }
  };

  // =========== 轮盘游戏相关函数 ===========
  
  // 加入轮盘游戏
  const handleJoinRouletteGame = () => {
    if (!socket) return;
    
    console.log('加入轮盘游戏');
    socket.emit('join_roulette');
    setShowRoulettePanel(true);
  };
  
  // 离开轮盘游戏
  const handleLeaveRouletteGame = () => {
    if (!socket) return;
    
    console.log('离开轮盘游戏');
    socket.emit('leave_roulette');
    setInRouletteGame(false);
    setShowRoulettePanel(false);
  };
  
  // 选择下注类型
  const selectBetType = (type: string) => {
    setSelectedBetType(type);
    setSelectedNumber(null);
  };
  
  // 选择数字
  const selectNumber = (number: number | string) => {
    setSelectedNumber(number);
    // 当选择数字时，自动设置下注类型为straight(单个数字)
    setSelectedBetType('straight');
  };
  
  // 设置投注金额
  const handleBetAmountChange = (amount: number) => {
    setBetAmount(Math.max(100, Math.min(10000, amount)));
  };
  
  // 下注
  const placeBet = () => {
    if (!socket || !selectedBetType || rouletteState.spinning) return;
    
    let betData: any = {
      type: selectedBetType,
      amount: betAmount
    };
    
    // 根据不同的下注类型设置不同的参数
    switch(selectedBetType) {
      case 'straight':
        if (!selectedNumber) {
          const errorMsg: SystemMessage = {
            id: Date.now().toString(),
            text: '请选择一个数字',
            timestamp: Date.now()
          };
          setSystemMessages(prev => [...prev, errorMsg]);
          return;
        }
        betData.number = selectedNumber;
        break;
        
      case 'split':
      case 'street':
      case 'corner':
      case 'line':
        // 这些类型需要选择多个数字，简化版本中略去
        break;
        
      case 'dozen':
        betData.dozen = 'first'; // 简化版，实际应该从UI中选择
        break;
        
      case 'column':
        betData.column = 'first'; // 简化版，实际应该从UI中选择
        break;
        
      case 'even':
      case 'odd':
      case 'red':
      case 'black':
      case 'low':
      case 'high':
        // 这些类型不需要额外参数
        break;
    }
    
    console.log('下注:', betData);
    socket.emit('place_bet', betData, (response: {success: boolean, message: string, newBalance?: number}) => {
      if (response.success) {
        if (response.newBalance !== undefined) {
          setRouletteChips(response.newBalance);
        }
        
        const successMsg: SystemMessage = {
          id: Date.now().toString(),
          text: response.message,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, successMsg]);
      } else {
        const errorMsg: SystemMessage = {
          id: Date.now().toString(),
          text: response.message,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, errorMsg]);
      }
    });
  };
  
  // 转动轮盘
  const spinWheel = () => {
    if (!socket || rouletteState.spinning) return;
    
    console.log('转动轮盘');
    socket.emit('spin_wheel', {}, (response: {success: boolean, message: string}) => {
      if (!response.success) {
        const errorMsg: SystemMessage = {
          id: Date.now().toString(),
          text: response.message,
          timestamp: Date.now()
        };
        setSystemMessages(prev => [...prev, errorMsg]);
      }
    });
  };

  // 轮盘游戏赔率说明
  const roulettePayout = {
    'straight': 30, // 单个数字(1到36, 0, 00) - 赔率 30:1
    'split': 15,    // 两个相邻数字的组合 - 赔率 15:1
    'street': 10,   // 三个数字的水平线 - 赔率 10:1
    'corner': 7,    // 四个数字的方块 - 赔率 7:1
    'line': 5,      // 六个数字的两条水平线 - 赔率 5:1
    'dozen': 2,     // 12个数字的区间 (1-12, 13-24, 25-36) - 赔率 2:1
    'column': 2,    // 一列12个数字 - 赔率 2:1
    'red': 2,       // 红色 - 赔率 2:1
    'black': 2,     // 黑色 - 赔率 2:1
    'even': 2,      // 偶数 - 赔率 2:1
    'odd': 2,       // 奇数 - 赔率 2:1
    'low': 2,       // 低数字 (1-18) - 赔率 2:1
    'high': 2       // 高数字 (19-36) - 赔率 2:1
  };
  
  // 切换游戏规则显示
  const toggleRouletteRules = () => {
    setShowRouletteRules(!showRouletteRules);
    // 关闭排行榜(如果打开)
    if (showRouletteLeaderboard) {
      setShowRouletteLeaderboard(false);
    }
  };
  
  // 切换排行榜显示
  const toggleRouletteLeaderboard = () => {
    setShowRouletteLeaderboard(!showRouletteLeaderboard);
    // 关闭游戏规则(如果打开)
    if (showRouletteRules) {
      setShowRouletteRules(false);
    }
  };

  // 本地答案匹配检查函数
  const checkAnswer = (userAnswer: string, correctAnswer: string): boolean => {
    if (!userAnswer || !correctAnswer) return false;
    
    // 去除空格和标点符号，转为小写进行比较
    const normalizeText = (text: string): string => {
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
  };

  return (
    <div className="flex flex-col h-screen bg-light">
      <Head>
        <title>Ai匿名聊天室</title>
        <meta name="description" content="匿名聊天室" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className="bg-white shadow-sm px-4 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold text-primary">Ai匿名聊天室</h1>
          <div className="text-sm text-muted">
            {connectionStatus === 'connected' ? (
              <span className="text-success flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-success mr-1"></span>
                已连接
              </span>
            ) : connectionStatus === 'connecting' ? (
              <span className="text-warning flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-warning mr-1 animate-pulse"></span>
                连接中...
              </span>
            ) : (
              <span className="text-danger flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-danger mr-1"></span>
                未连接
                <button onClick={testConnection} className="text-xs underline ml-1">
                  测试连接
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-1">在线:</span>
            <span className="text-primary font-medium">{onlineCount}</span>
          </div>
          <div 
            className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              setShowNicknameModal(true);
              setNewNickname(nickname);
              setNicknameError('');
            }}
            title="点击修改昵称"
          >
            {messages.find(msg => msg.isSelf)?.avatar ? (
              <img 
                src={messages.find(msg => msg.isSelf)?.avatar} 
                alt="我的头像" 
                className="w-full h-full rounded-full"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-600">{nickname.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.preventDefault(); // 阻止默认行为
              const password = prompt('请输入清除密码');
              if (password && socket) {
                socket.emit('clear_messages', { password });
              }
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* 滚动公告 */}
      <div className="bg-gray-100 p-2 border-b">
        <div className="max-w-3xl mx-auto overflow-hidden whitespace-nowrap">
          <span className="inline-block animate-[marquee_15s_linear_infinite]">欢迎来到Ai匿名聊天室！ 点击左下角机器人图标可开启AI回复功能。注意：请勿讨论任何政治话题！文明聊天~</span>
        </div>
      </div>

      {/* 游戏栏 */}
      <div className="bg-blue-50 border-b border-blue-100 p-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <FaGamepad className="text-blue-500 mr-2" />
            <span className="text-blue-700 font-medium">小游戏：你说我猜，{gameState.isActive ? '正在进行中' : '等待开始'}</span>
          </div>
          
          {!inGame ? (
            <button 
              onClick={handleJoinGame}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
            >
              加入游戏
            </button>
          ) : (
            <button 
              onClick={handleLeaveGame}
              className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              退出游戏
            </button>
          )}
        </div>
      </div>
      
      {/* 轮盘游戏栏 */}
      <div className="bg-red-50 border-b border-red-100 p-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <FaGamepad className="text-red-500 mr-2" />
            <span className="text-red-700 font-medium">轮盘赌博游戏</span>
          </div>
          
          {!inRouletteGame ? (
            <button 
              onClick={handleJoinRouletteGame}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
            >
              加入游戏
            </button>
          ) : (
            <button 
              onClick={handleLeaveRouletteGame}
              className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
            >
              退出游戏
            </button>
          )}
        </div>
      </div>
      
      {/* 轮盘游戏面板 */}
      {showRoulettePanel && inRouletteGame && (
        <div className="bg-red-100 p-2 border-b border-red-200">
          <div className="max-w-3xl mx-auto">
            {/* 游戏状态和筹码信息 */}
            <div className="mb-2 flex justify-between items-center text-sm">
              <div className="flex items-center">
                <span className="font-medium">状态：</span>
                {rouletteState.spinning ? (
                  <span className="text-red-600 animate-pulse">轮盘旋转中...</span>
                ) : (
                  <div className="flex items-center">
                    <span className="text-green-600">下注时间</span>
                    <span className="ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">
                      {bettingTimeRemaining}秒
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <div className="bg-yellow-100 px-2 py-0.5 rounded-full">
                  <span className="font-medium">筹码: </span>
                  <span className="text-yellow-700">{rouletteChips}</span>
                </div>
                
                <div className="flex space-x-1">
                  <button
                    onClick={toggleRouletteRules}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-0.5 rounded"
                    title="查看赔率说明"
                  >
                    赔率
                  </button>
                  
                  <button
                    onClick={toggleRouletteLeaderboard}
                    className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-0.5 rounded"
                    title="查看排行榜"
                  >
                    排行
                  </button>
                </div>
              </div>
            </div>
            
            {/* 赔率说明面板 */}
            {showRouletteRules && (
              <div className="mb-2 p-2 bg-white rounded shadow text-sm">
                <h3 className="font-bold mb-1">轮盘赌博规则和赔率:</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="font-semibold">单注类型和赔率:</p>
                    <ul className="list-disc pl-5 text-xs">
                      <li><span className="font-medium">单个数字(Straight)</span>: 30:1</li>
                      <li><span className="font-medium">两个相邻数字(Split)</span>: 15:1</li>
                      <li><span className="font-medium">三个数字行(Street)</span>: 10:1</li>
                      <li><span className="font-medium">四个数字(Corner)</span>: 7:1</li>
                      <li><span className="font-medium">六个数字(Line)</span>: 5:1</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold">外围投注和赔率:</p>
                    <ul className="list-disc pl-5 text-xs">
                      <li><span className="font-medium">数字区间(Dozen)</span>: 2:1</li>
                      <li><span className="font-medium">数字列(Column)</span>: 2:1</li>
                      <li><span className="font-medium">红色/黑色</span>: 2:1</li>
                      <li><span className="font-medium">偶数/奇数</span>: 2:1</li>
                      <li><span className="font-medium">1-18/19-36</span>: 2:1</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-2 bg-gray-100 p-1 rounded text-xs">
                  <p className="font-semibold">关于0和00:</p>
                  <p>轮盘上有0和00两个绿色格，下注在这些数字上获胜将获得30:1的赔率，但下注在其他区域时，如果结果是0或00，则外围投注会输掉。</p>
                </div>
                <div className="mt-2 bg-gray-100 p-1 rounded text-xs">
                  <p className="font-semibold">数字区间说明:</p>
                  <ul className="list-disc pl-5">
                    <li><span className="font-medium">数字区间(Dozen)</span>: 1-12, 13-24, 或 25-36</li>
                    <li><span className="font-medium">数字列(Column)</span>: 轮盘表上的三列数字</li>
                  </ul>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  每局游戏有20秒下注时间，轮盘转动时无法下注。点击数字直接投注单个数字，或点击外围按钮投注对应类型。
                </p>
              </div>
            )}
            
            {/* 排行榜面板 */}
            {showRouletteLeaderboard && (
              <div className="bg-white p-2 rounded-lg mb-2 text-xs shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold">轮盘赌富豪榜</h4>
                  <button 
                    onClick={toggleRouletteLeaderboard}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
                {rouletteLeaderboard.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded shadow-inner border border-gray-100">
                    <table className="w-full text-left">
                      <thead className="bg-gradient-to-r from-yellow-50 to-yellow-100 sticky top-0">
                        <tr>
                          <th className="p-1 w-12 text-center">#</th>
                          <th className="p-1">玩家</th>
                          <th className="p-1 text-right">筹码</th>
                          <th className="p-1 w-16 text-center">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rouletteLeaderboard.map((player, index) => (
                          <tr key={index} className={`border-t border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-yellow-50`}>
                            <td className="p-1 text-center font-medium">
                              {index === 0 ? (
                                <span className="inline-block w-5 h-5 rounded-full bg-yellow-400 text-white flex items-center justify-center text-xs">
                                  1
                                </span>
                              ) : index === 1 ? (
                                <span className="inline-block w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center text-xs">
                                  2
                                </span>
                              ) : index === 2 ? (
                                <span className="inline-block w-5 h-5 rounded-full bg-yellow-600 text-white flex items-center justify-center text-xs">
                                  3
                                </span>
                              ) : (
                                index + 1
                              )}
                            </td>
                            <td className="p-1 font-medium">{player.nickname}</td>
                            <td className="p-1 text-yellow-700 font-medium text-right">{player.chips.toLocaleString()}</td>
                            <td className="p-1 text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${player.isOnline ? 'bg-green-500' : 'bg-gray-400'} mr-1`}></span>
                              <span className={player.isOnline ? 'text-green-600' : 'text-gray-500'}>
                                {player.isOnline ? '在线' : '离线'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-4 text-center text-gray-500 bg-gray-50 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mx-auto mb-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    暂无排行数据
                  </div>
                )}
                <p className="mt-2 text-gray-500 text-[10px] px-1">
                  只有筹码超过10000的玩家才会上榜。排行榜记录每个玩家的历史最高筹码数。
                </p>
              </div>
            )}
            
            {/* 轮盘和下注区域 */}
            <div className="flex flex-col md:flex-row gap-2">
              {/* 左侧：轮盘区域 */}
              <div className="w-full md:w-1/2 bg-white rounded-lg p-2 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium">美式轮盘</h3>
                  
                  {/* 轮盘结果提示 */}
                  {rouletteState.spinning ? (
                    <span className="text-xs bg-yellow-50 px-2 py-0.5 rounded animate-pulse">转动中...</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded ${bettingTimeRemaining <= 5 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                      剩余：{bettingTimeRemaining}秒
                    </span>
                  )}
                </div>
                
                {/* 轮盘动画效果 - 更紧凑的设计 */}
                <div className="flex items-center justify-center mb-2">
                  <div className="relative w-20 h-20">
                    <div 
                      className={`absolute inset-0 rounded-full border-2 border-gray-300 bg-gradient-to-r from-red-500 via-black to-red-500 transition-transform duration-5000 ease-out flex items-center justify-center`}
                      style={{ 
                        transform: `rotate(${rouletteRotation}deg)`,
                        transitionDuration: rouletteState.spinning ? '5s' : '0s'
                      }}
                    >
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                        <span className="text-sm font-bold">
                          {rouletteState.spinning ? '?' : (rouletteState.lastResult ? rouletteState.lastResult.number : '')}
                        </span>
                      </div>
                    </div>
                    {rouletteState.spinning && (
                      <div className="absolute top-0 right-0 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>
                    )}
                  </div>
                  
                  {/* 轮盘结果显示 */}
                  {rouletteState.lastResult && !rouletteState.spinning && (
                    <div className="ml-4 text-center">
                      <p className="text-xs">上次结果：</p>
                      <div className={`inline-block w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                        rouletteState.lastResult.color === 'red' 
                          ? 'bg-red-600' 
                          : rouletteState.lastResult.color === 'black' 
                            ? 'bg-black' 
                            : 'bg-green-600'
                      }`}>
                        {rouletteState.lastResult.number}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 简化的轮盘界面 - 数字网格 (更紧凑) */}
                <div className="grid grid-cols-3 gap-0.5 mb-2">
                  <div className="col-span-3 grid grid-cols-2 gap-0.5 mb-0.5">
                    <button 
                      className="bg-green-600 text-white h-6 rounded flex items-center justify-center text-xs"
                      onClick={() => selectNumber(0)}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      0 (30:1)
                    </button>
                    <button 
                      className="bg-green-600 text-white h-6 rounded flex items-center justify-center text-xs"
                      onClick={() => selectNumber('00')}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      00 (30:1)
                    </button>
                  </div>
                  
                  {/* 数字1-36网格 */}
                  {Array.from({length: 12}, (_, i) => (
                    <div key={`row-${i}`} className="grid grid-cols-3 gap-0.5 w-full">
                      {Array.from({length: 3}, (_, j) => {
                        const num = i * 3 + j + 1;
                        const color = (
                          num === 1 || num === 3 || num === 5 || num === 7 || num === 9 ||
                          num === 12 || num === 14 || num === 16 || num === 18 || num === 19 ||
                          num === 21 || num === 23 || num === 25 || num === 27 || num === 30 ||
                          num === 32 || num === 34 || num === 36
                        ) ? 'red' : 'black';
                        
                        return (
                          <button 
                            key={`num-${num}`}
                            className={`${color === 'red' ? 'bg-red-600' : 'bg-black'} text-white h-5 rounded flex items-center justify-center text-xs`}
                            onClick={() => selectNumber(num)}
                            disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                
                {/* 外围下注区域 */}
                <div className="grid grid-cols-2 gap-1 mb-2 text-xs">
                  <button 
                    className="bg-red-600 text-white py-1 rounded"
                    onClick={() => selectBetType('red')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    红色 (2:1)
                  </button>
                  <button 
                    className="bg-black text-white py-1 rounded"
                    onClick={() => selectBetType('black')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    黑色 (2:1)
                  </button>
                  <button 
                    className="bg-gray-300 py-1 rounded"
                    onClick={() => selectBetType('even')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    偶数 (2:1)
                  </button>
                  <button 
                    className="bg-gray-300 py-1 rounded"
                    onClick={() => selectBetType('odd')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    奇数 (2:1)
                  </button>
                  <button 
                    className="bg-gray-300 py-1 rounded"
                    onClick={() => selectBetType('low')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    1-18 (2:1)
                  </button>
                  <button 
                    className="bg-gray-300 py-1 rounded"
                    onClick={() => selectBetType('high')}
                    disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                  >
                    19-36 (2:1)
                  </button>
                </div>
              </div>
              
              {/* 右侧：下注控制区 */}
              <div className="w-full md:w-1/2 bg-white rounded-lg p-2 shadow-sm">
                <h3 className="text-sm font-medium mb-2">下注控制</h3>
                
                {/* 当前选择显示 */}
                <div className="bg-gray-100 p-2 rounded mb-2 text-xs">
                  <p>
                    <span className="font-medium">下注类型：</span>
                    {selectedBetType ? (
                      <span className="text-blue-600">
                        {selectedBetType === 'straight' && '单个数字 (30:1)'}
                        {selectedBetType === 'red' && '红色 (2:1)'}
                        {selectedBetType === 'black' && '黑色 (2:1)'}
                        {selectedBetType === 'even' && '偶数 (2:1)'}
                        {selectedBetType === 'odd' && '奇数 (2:1)'}
                        {selectedBetType === 'low' && '低数字 1-18 (2:1)'}
                        {selectedBetType === 'high' && '高数字 19-36 (2:1)'}
                      </span>
                    ) : (
                      <span className="text-gray-500">请选择下注类型</span>
                    )}
                  </p>
                  {selectedBetType === 'straight' && (
                    <p>
                      <span className="font-medium">选择数字：</span>
                      {selectedNumber !== null ? (
                        <span className="text-blue-600">
                          {selectedNumber === 0 || selectedNumber === '00' 
                            ? `${selectedNumber} (绿色特殊格)` 
                            : selectedNumber}
                        </span>
                      ) : (
                        <span className="text-gray-500">请选择一个数字</span>
                      )}
                    </p>
                  )}
                </div>
                
                {/* 下注金额控制 */}
                <div className="mb-2">
                  <p className="font-medium text-xs mb-1">下注金额：</p>
                  <div className="flex gap-1 mb-1">
                    <button 
                      className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs"
                      onClick={() => handleBetAmountChange(100)}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      100
                    </button>
                    <button 
                      className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs"
                      onClick={() => handleBetAmountChange(500)}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      500
                    </button>
                    <button 
                      className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs"
                      onClick={() => handleBetAmountChange(1000)}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      1000
                    </button>
                    <button 
                      className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs"
                      onClick={() => handleBetAmountChange(5000)}
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      5000
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      min="100" 
                      max="10000" 
                      value={betAmount}
                      onChange={(e) => handleBetAmountChange(parseInt(e.target.value))}
                      className="border rounded p-0.5 w-20 text-xs"
                      disabled={rouletteState.spinning || !rouletteState.bettingOpen}
                    />
                    <button
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded text-xs"
                      onClick={placeBet}
                      disabled={!selectedBetType || rouletteState.spinning || !rouletteState.bettingOpen}
                    >
                      下注
                    </button>
                  </div>
                </div>
                
                {/* 当前下注情况 */}
                <div>
                  <h4 className="font-medium text-xs mb-1">所有玩家下注：</h4>
                  <div className="bg-gray-50 p-1 rounded max-h-32 overflow-y-auto">
                    {allBets.length > 0 ? (
                      <ul className="divide-y divide-gray-200">
                        {allBets.map((bet, index) => (
                          <li key={index} className="py-0.5 text-xs">
                            <span className="font-medium">{bet.nickname}</span> 下注 
                            <span className="text-yellow-700 font-medium"> {bet.bet.amount} </span>
                            筹码在 
                            <span className="text-blue-600"> {
                              (() => {
                                let betDescription = '';
                                switch (bet.bet.type) {
                                  case 'straight':
                                    // 对0和00做特殊显示
                                    if (bet.bet.number === 0 || bet.bet.number === '00') {
                                      betDescription = `绿色特殊格 ${bet.bet.number} (30:1)`;
                                    } else {
                                      betDescription = `单个数字 ${bet.bet.number} (30:1)`;
                                    }
                                    break;
                                  case 'split':
                                    betDescription = `两个相邻数字 ${bet.bet.numbers?.join(' ')} (15:1)`;
                                    break;
                                  case 'street':
                                    betDescription = `三个数字水平线 ${bet.bet.numbers?.join(' ')} (10:1)`;
                                    break;
                                  case 'corner':
                                    betDescription = `四个数字方块 ${bet.bet.numbers?.join(' ')} (7:1)`;
                                    break;
                                  case 'line':
                                    betDescription = `六个数字的两条水平线 ${bet.bet.numbers?.join(' ')} (5:1)`;
                                    break;
                                  case 'dozen':
                                    betDescription = `数字区间 ${bet.bet.dozen === 'first' ? '1-12' : bet.bet.dozen === 'second' ? '13-24' : '25-36'} (2:1)`;
                                    break;
                                  case 'column':
                                    betDescription = `数字列 ${bet.bet.column === 'first' ? '第一列' : bet.bet.column === 'second' ? '第二列' : '第三列'} (2:1)`;
                                    break;
                                  case 'even':
                                    betDescription = '偶数 (2:1)';
                                    break;
                                  case 'odd':
                                    betDescription = '奇数 (2:1)';
                                    break;
                                  case 'red':
                                    betDescription = '红色 (2:1)';
                                    break;
                                  case 'black':
                                    betDescription = '黑色 (2:1)';
                                    break;
                                  case 'low':
                                    betDescription = '低数字 1-18 (2:1)';
                                    break;
                                  case 'high':
                                    betDescription = '高数字 19-36 (2:1)';
                                    break;
                                  default:
                                    betDescription = bet.bet.type;
                                }
                                return betDescription;
                              })()
                            } </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 text-xs">暂无下注</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 游戏面板 - 仅在加入游戏后显示 */}
      {showGamePanel && inGame && (
        <div className="bg-blue-100 p-3 border-b border-blue-200">
          <div className="max-w-3xl mx-auto">
            {/* 游戏状态 */}
            <div className="mb-3 flex justify-between items-center">
              <div>
                <span className="font-medium">当前状态：</span>
                {gameState.phase === 'waiting' && <span>等待游戏开始</span>}
                {gameState.phase === 'hinting' && <span>BOSS正在输入提示词（{gameState.remainingTime}秒）</span>}
                {gameState.phase === 'guessing' && <span>猜词中（{gameState.remainingTime}秒）</span>}
                {gameState.phase === 'evaluating' && <span>评价阶段</span>}
              </div>
              
              <button 
                onClick={toggleLeaderboard} 
                className="flex items-center text-blue-600 hover:text-blue-800"
              >
                <FaTrophy className="mr-1" />
                {showLeaderboard ? '隐藏排行榜' : '查看排行榜'}
              </button>
            </div>
            
            {/* 排行榜 */}
            {showLeaderboard && (
              <div className="mb-3 bg-white p-2 rounded shadow-sm">
                <h3 className="font-bold mb-1">排行榜</h3>
                <div className="max-h-32 overflow-y-auto">
                  {gamePlayers && gamePlayers.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1">排名</th>
                          <th className="text-left py-1">玩家</th>
                          <th className="text-right py-1">积分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gamePlayers.map((player, index) => (
                          <tr key={index} className="border-b border-gray-100">
                            <td className="py-1">{index + 1}</td>
                            <td className="py-1">{player.nickname}{!player.isOnline && ' (离线)'}</td>
                            <td className="py-1 text-right">{player.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 text-center py-2">暂无玩家</p>
                  )}
                </div>
              </div>
            )}
            
            {/* BOSS提示输入区 */}
            {isBoss && gameState.phase === 'hinting' && (
              <div className="bg-yellow-50 p-2 rounded mb-3 border border-yellow-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-yellow-800">你是本轮BOSS！</span>
                  <span className="bg-yellow-500 text-white px-2 py-1 rounded-full text-xs">
                    剩余时间: {gameState.remainingTime}秒
                  </span>
                </div>
                <p className="text-sm mb-2">你的词语是: <span className="font-bold text-yellow-700">{gameState.word}</span></p>
                <p className="text-xs mb-2 text-gray-600">请输入提示词，不能包含答案中的字！</p>
                
                <form onSubmit={handleSubmitHint} className="flex">
                  <input
                    type="text"
                    value={gameHint}
                    onChange={(e) => setGameHint(e.target.value)}
                    className="flex-1 border border-yellow-300 rounded-l px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
                    placeholder="输入提示词..."
                  />
                  <button
                    type="submit"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-r px-3 py-1 text-sm"
                  >
                    提交
                  </button>
                </form>
              </div>
            )}
            
            {/* 猜词区 */}
            {!isBoss && gameState.phase === 'guessing' && gameState.hint && (
              <div className="bg-green-50 p-2 rounded mb-3 border border-green-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-green-800">猜词时间！</span>
                  <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs">
                    剩余时间: {gameState.remainingTime}秒
                  </span>
                </div>
                <p className="text-sm mb-2">
                  BOSS <span className="font-medium">{gameState.currentBossNickname}</span> 的提示词是: 
                  <span className="font-bold text-green-700 ml-1">{gameState.hint}</span>
                </p>
                <p className="text-xs text-gray-600">在聊天框中输入你的答案，无限次猜测！</p>
              </div>
            )}
            
            {/* 评价区 */}
            {gameState.phase === 'evaluating' && gameState.word && (
              <div className="bg-purple-50 p-2 rounded mb-3 border border-purple-200">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-purple-800">本轮结束！</span>
                  <span className="font-medium text-purple-700">
                    答案: {gameState.word}
                  </span>
                </div>
                <p className="text-sm mb-2">
                  BOSS <span className="font-medium">{gameState.currentBossNickname}</span> 的提示词是: 
                  <span className="font-bold text-purple-700 ml-1">{gameState.hint}</span>
                </p>
                
                {!isBoss && !hasRated && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1">评价BOSS的提示质量:</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleRateBoss('good')}
                        className="flex items-center bg-green-100 hover:bg-green-200 text-green-700 rounded px-2 py-1 text-xs"
                      >
                        <FaThumbsUp className="mr-1" /> 提示词很棒！({gameRatings.good})
                      </button>
                      <button
                        onClick={() => handleRateBoss('bad')}
                        className="flex items-center bg-red-100 hover:bg-red-200 text-red-700 rounded px-2 py-1 text-xs"
                      >
                        <FaThumbsDown className="mr-1" /> 提示词水平低！({gameRatings.bad})
                      </button>
                    </div>
                  </div>
                )}
                
                {hasRated && (
                  <p className="text-xs text-gray-600 mt-2">已评价！好评: {gameRatings.good}, 差评: {gameRatings.bad}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 系统消息区域 */}
      <div className="fixed top-16 left-0 right-0 flex flex-col items-center z-20 pointer-events-none">
        {systemMessages.map((msg) => (
          <div 
            key={msg.id} 
            className="bg-dark text-white px-4 py-2 rounded-full mb-2 text-sm animate-fade-in-out"
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* 聊天区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={messagesContainerRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-[80%] ${msg.isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
                <div 
                  className={`flex-shrink-0 w-8 h-8 rounded-full overflow-hidden ${msg.isSelf ? 'ml-2' : 'mr-2'}`}
                >
                  {msg.avatar ? (
                    <img 
                      src={msg.avatar} 
                      alt={`${msg.nickname}的头像`} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-600">{msg.nickname.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className={`text-xs text-gray-500 mb-1 ${msg.isSelf ? 'text-right' : 'text-left'}`}>
                    {msg.nickname} · {formatTime(msg.timestamp)}
                  </div>
                  <div 
                    className={`rounded-lg px-3 py-2 inline-block ${
                      msg.isSelf 
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' 
                        : msg.nickname === 'AI'
                          ? 'bg-gradient-to-r from-purple-400 to-purple-500 text-white'
                          : gameState.isActive && gameState.phase === 'guessing' && 
                            gameState.word && checkAnswer(msg.text, gameState.word) && 
                            !msg.isSelf && 
                            msg.nickname !== gameState.currentBossNickname
                            ? 'bg-gradient-to-r from-green-400 to-green-500 text-white border-2 border-green-700 shadow-lg animate-pulse'
                          : 'bg-white border border-gray-200'
                    }`}
                  >
                    {msg.text}
                    {/* 添加正确答案提示标记 */}
                    {gameState.isActive && gameState.phase === 'guessing' && 
                     gameState.word && checkAnswer(msg.text, gameState.word) && 
                     !msg.isSelf && msg.nickname !== gameState.currentBossNickname && 
                     <span className="ml-1 text-yellow-300">✓ 正确答案</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef}></div>
        </div>
      </div>

      {/* 输入区域 */}
      <div className={`bg-white border-t p-3 ${isBanned ? 'opacity-50 pointer-events-none' : ''}`}>
        {isBanned && (
          <div className="max-w-3xl mx-auto mb-2 bg-red-50 text-red-700 p-2 rounded text-sm">
            您已被限制发言 {Math.ceil(banTimeLeft)} 分钟
          </div>
        )}
        <div className="max-w-3xl mx-auto relative">
          <form onSubmit={sendMessage} className="flex space-x-2">
            <button
              type="button"
              className={`flex-shrink-0 p-2 rounded-full ${
                isAiEnabled ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'
              }`}
              onClick={toggleAi}
            >
              <RiRobot2Line size={20} />
            </button>
            
            <div className="relative flex-1">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="输入消息..."
                className="w-full border border-gray-300 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                <BsEmojiSmile size={18} />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 z-10">
                  <EmojiPicker onEmojiClick={handleEmojiClick} />
                </div>
              )}
            </div>
            
            <button
              type="submit"
              className="flex-shrink-0 bg-primary text-white px-4 py-2 rounded-full hover:bg-primary-dark transition-colors"
            >
              发送
            </button>
          </form>
        </div>
      </div>

      {/* 修改昵称弹窗 */}
      {showNicknameModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
          <div className="bg-white p-4 rounded-lg shadow-lg w-80 max-w-full">
            <h2 className="text-xl font-bold mb-4">修改昵称</h2>
            <form onSubmit={handleChangeNickname}>
              <div className="mb-4">
                <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
                  新昵称
                </label>
                <input
                  type="text"
                  id="nickname"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入新昵称"
                  maxLength={12}
                  minLength={2}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-gray-500 text-xs mt-1">昵称长度2-12个字符</p>
                {nicknameError && (
                  <p className="text-red-500 text-sm mt-1">{nicknameError}</p>
                )}
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNicknameModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                  disabled={isSubmitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center"
                  disabled={isSubmitting || !newNickname.trim() || newNickname.length < 2}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      提交中...
                    </>
                  ) : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}