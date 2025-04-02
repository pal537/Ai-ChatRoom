

这是一个基于Next.js的匿名聊天室应用，前端部署在Vercel，后端Socket.io服务器部署在远程VPS，支持实时通信和AI聊天功能。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2FAi-ChatRoom)

## 📌 功能特点

- ✅ 实时聊天，即时消息推送
- ✅ 匿名参与，保护用户隐私
- ✅ 集成AI回复，增强互动体验
- ✅ 用户头像自动生成，保持身份一致性
- ✅ 表情选择器，丰富聊天内容
- ✅ 敏感词过滤，维护健康聊天环境
- ✅ 在线用户统计，实时显示活跃度
- ✅ 响应式设计，移动端友好
- ✅ 趣味游戏模式，增加用户互动
- ✅ 轮盘赌博游戏，提供多样娱乐选择

## 🔧 技术栈

### 前端
- Next.js 14
- React 18
- Socket.io-client
- TailwindCSS
- React Icons
- Emoji Picker React

### 后端
- Node.js
- Express
- Socket.io
- Axios（用于AI API调用）
- UUID（生成唯一标识符）

## 🚀 部署指南

### 前端部署（Vercel）

1. 点击上方的"Deploy with Vercel"按钮，将项目克隆到您的GitHub并部署到Vercel
2. 在Vercel部署过程中，可以设置环境变量（如需要）
3. 部署完成后，您将获得一个Vercel提供的域名（如 `your-app.vercel.app`）

### 后端Socket.io服务器部署
详见：https://31tu.com/?p=260


### 连接前端与后端

部署完成后，需要修改前端代码以连接到您的Socket.io服务器：

1. 在Vercel项目设置中，添加环境变量`NEXT_PUBLIC_SOCKET_SERVER_URL`并设置为您的Socket.io服务器URL
   ```
   NEXT_PUBLIC_SOCKET_SERVER_URL=https://io.yourdomain.com
   ```
   
2. 也可以直接在`src/pages/chat.tsx`文件中修改Socket.io连接地址：
   ```javascript
   const SOCKET_SERVER_URL = 'https://io.yourdomain.com';
   ```

3. 重新部署前端应用

### AI功能配置

1. 在index.js中配置AI API密钥：
   ```javascript
   const AI_API_KEYS = [
     'your-api-key-1',
     'your-api-key-2',
     'your-api-key-3'
   ];
   ```

2. 可以添加多个API密钥实现轮询调用，分摊负载

## 💡 使用指南

1. 访问应用首页，输入昵称进入聊天室
2. 聊天界面功能：
   - 左下角机器人图标：开启/关闭AI回复功能
   - 表情按钮：打开表情选择器
   - 消息输入框：输入聊天内容
   - 发送按钮：发送消息
   - 右上角显示当前在线人数
   - 连接状态指示器显示服务器连接状态

3. AI回复功能：
   - 点击机器人图标开启AI回复功能
   - 当开启后，发送的每条消息都会收到AI的自动回复
   - AI回复使用QwQ-32B模型，支持中文对话

4. 游戏功能：
   - 聊天室支持"你说我猜"互动游戏模式
   - 通过特定命令可以加入游戏
   - 玩家轮流担任"BOSS"角色，给出提示让其他人猜词
   
5. 轮盘赌博游戏：
   - 支持美式轮盘玩法
   - 多种下注选项和不同赔率
   - 实时排行榜显示

## 🛠️ 项目结构

```
/
├── src/
│   ├── pages/
│   │   ├── index.tsx      # 首页，用户输入昵称
│   │   ├── chat.tsx       # 聊天室主页面
│   │   ├── _app.tsx       # Next.js应用入口
│   │   └── _document.tsx  # HTML文档设置
│   ├── styles/            # 样式文件
│   └── utils/             # 工具函数
│       └── animalAvatars.js # 头像配置
├── public/                # 静态资源
│   └── favicon.ico        # 网站图标
├── package.json           # 项目依赖
├── next.config.js         # Next.js配置
├── tailwind.config.js     # Tailwind CSS配置
├── postcss.config.js      # PostCSS配置
├── tsconfig.json          # TypeScript配置
└── index.js               # Socket.io服务器主文件
```

## 📝 维护说明

### 后端服务监控

使用PM2监控Socket.io服务状态：

```bash
# 查看所有进程
pm2 list

# 查看特定进程状态
pm2 show chat-socket-server

# 查看日志
pm2 logs chat-socket-server

# 实时监控
pm2 monit

# 重启服务
pm2 restart chat-socket-server

# 停止服务
pm2 stop chat-socket-server

# 删除服务
pm2 delete chat-socket-server
```

### 敏感词过滤

在index.js中配置敏感词列表：

```javascript
const sensitiveWords = ['敏感词1', '敏感词2', '敏感词3', ...];
```

### 消息清空功能

管理员可以使用特定密码清空所有聊天记录：

1. 在聊天界面右上角点击垃圾桶图标
2. 输入密码（默认为'adminadmin'）
3. 确认清空

## 🔒 安全注意事项

1. **API密钥保护**：确保Socket.io服务器代码中的API密钥不被泄露
2. **HTTPS加密**：为Socket.io服务器配置SSL证书，确保通信加密
3. **跨域限制**：在生产环境中，限制CORS为您的前端域名
4. **敏感词过滤**：维护更新敏感词列表，过滤不良内容
5. **密码保护**：定期更改清空消息的管理员密码
6. **服务器安全**：确保VPS服务器应用了最新的安全补丁
7. **防火墙设置**：只开放必要的端口

## 📈 性能优化

1. **消息历史限制**：服务器限制存储最新的100条消息，避免内存溢出
2. **心跳检测**：前端定期发送心跳包，保持连接活跃
3. **重连机制**：网络波动时自动重连Socket.io服务器
4. **错误处理**：完善的错误处理和用户提示
5. **缓存策略**：合理利用浏览器缓存减轻服务器负担

## 📄 许可证

[MIT License](LICENSE)
