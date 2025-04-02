import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Home() {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nickname.trim()) {
      setError('请输入昵称');
      return;
    }

    // 检查昵称是否包含禁用关键词
    const bannedKeywords = ['admin', 'ai', 'Ai', 'AI', '习近平', '习包子', '中共', '蒋介石', '江泽民', '中国', '支那', '管理员', '推销', '反共', '党', '共', '贼', '爸', '爹', '垃圾', '妈', '逼', '比'];
    if (bannedKeywords.some(keyword => nickname.toLowerCase().includes(keyword.toLowerCase()))) {
      setError('昵称包含禁用关键词，请重新输入');
      return;
    }
    
    // 存储昵称到localStorage
    localStorage.setItem('chat-nickname', nickname);
    
    // 跳转到聊天室页面
    router.push('/chat');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-light">
      <Head>
        <title>Ai匿名聊天室 - 31tu 匿名聊天室</title>
        <meta name="description" content="在线匿名聊天室" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="w-full max-w-md p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow-lg border border-blue-100">
        <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text font-orbitron">Ai匿名聊天室</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
              请输入昵称
            </label>
            <input
              type="text"
              id="nickname"
              className="input w-full"
              placeholder="任意昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
            />
            {error && <p className="mt-1 text-sm text-danger">{error}</p>}
          </div>
          
          <button type="submit" className="btn btn-primary w-full">
            进入聊天室
          </button>
        </form>
        
        <p className="mt-4 text-sm text-gray-500 text-center">
          请文明聊天！。
        </p>
      </div>
    </div>
  );
}