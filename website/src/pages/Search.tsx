import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';

type SearchItem = {
  title: string;
  description: string;
  url: string;
  keywords: string[];
};

const SEARCH_INDEX: SearchItem[] = [
  {
    title: '官方发布页',
    description: '了解 Mini-HBUT 的核心功能与下载入口。',
    url: '/',
    keywords: ['首页', '功能', '介绍', '发布页'],
  },
  {
    title: '历史版本与下载',
    description: 'Windows、macOS、Linux、Android、iOS 的全部发布版本。',
    url: '/releases',
    keywords: ['下载', 'release', '安装包', '历史版本', '更新'],
  },
  {
    title: '文档总览',
    description: '文档中心入口与导航索引。',
    url: '/docs',
    keywords: ['文档', '总览', '帮助', '目录'],
  },
  {
    title: '快速开始',
    description: '下载与安装、首次登录、首页仪表盘、搜索和底部主 Tab。',
    url: '/docs/quick-start',
    keywords: ['安装', '登录', '首页', '搜索', '快速开始'],
  },
  {
    title: '用户手册',
    description: '普通用户阅读路径、全局导航、功能分类地图和通用状态说明。',
    url: '/docs/user-guide',
    keywords: ['用户', '指南', '功能', '入口', '状态'],
  },
  {
    title: '教务服务',
    description: '成绩、课表、考试、排名、选课、空教室、校历和培养方案。',
    url: '/docs/academic',
    keywords: ['成绩', '课表', '考试', '排名', '选课', '空教室', '教务'],
  },
  {
    title: '校园生活',
    description: '校园码、电费、交易流水、图书馆、校园地图、资料分享和天气。',
    url: '/docs/campus-life',
    keywords: ['校园码', '电费', '流水', '图书馆', '地图', '资料', '天气'],
  },
  {
    title: '故障排查',
    description: '登录、安装、网络、通知、隐私和跨平台问题排查。',
    url: '/docs/troubleshooting',
    keywords: ['FAQ', '问题', '排查', '故障', '通知', '隐私'],
  },
  {
    title: '开发者总览',
    description: '仓库结构、开发环境、架构阅读顺序和贡献入口。',
    url: '/docs/developer',
    keywords: ['开发者', '技术', '架构', '贡献', '源码'],
  },
  {
    title: '参考资料',
    description: 'Tauri API、开发规范、外部集成和实现札记。',
    url: '/docs/reference',
    keywords: ['参考', 'API', 'Tauri', '规范', 'Nonebot', '实现'],
  },
];

function normalize(text: string) {
  return text.toLowerCase();
}

function tokenize(text: string) {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreItem(tokens: string[], item: SearchItem) {
  const title = normalize(item.title);
  const description = normalize(item.description);
  const keywordText = normalize(item.keywords.join(' '));
  let score = 0;

  tokens.forEach((token) => {
    if (title.includes(token)) score += 3;
    if (keywordText.includes(token)) score += 2;
    if (description.includes(token)) score += 1;
  });

  return score;
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const [input, setInput] = useState(query);

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    document.title = query ? `搜索：${query} - Mini-HBUT` : '站内搜索 - Mini-HBUT';
  }, [query]);

  const results = useMemo(() => {
    if (!query) return [] as SearchItem[];
    const tokens = tokenize(query);
    return SEARCH_INDEX
      .map((item) => ({ item, score: scoreItem(tokens, item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [query]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    if (!next) {
      setSearchParams({});
      return;
    }
    setSearchParams({ q: next });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="pt-28 pb-20 max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-cyan hover:text-cyan-300 transition-colors text-sm font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Link>
        </div>

        <div className="glass rounded-2xl border border-cyan/20 p-6 sm:p-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
            站内搜索
          </h1>
          <p className="text-gray-400 text-sm mb-6">
            输入关键词快速定位文档、版本下载与功能说明。
          </p>

          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="例如：成绩、课表、下载、OCR"
                className="w-full bg-black/60 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan/50"
              />
            </div>
            <button
              type="submit"
              className="cyber-btn px-5 py-2.5 text-xs font-mono"
            >
              开始搜索
            </button>
          </form>
        </div>

        <div className="mt-8 space-y-4">
          {query && (
            <div className="text-sm text-gray-400">
              为「<span className="text-cyan">{query}</span>」找到 {results.length} 条结果
            </div>
          )}

          {!query && (
            <div className="text-sm text-gray-500">
              你可以尝试：成绩查询、课表导出、安装、远程配置、云同步
            </div>
          )}

          {query && results.length === 0 && (
            <div className="glass rounded-xl border border-gray-800 p-6 text-gray-400 text-sm">
              暂无匹配结果，建议换个关键词或查看文档总览。
            </div>
          )}

          {results.map((item) => (
            <Link
              key={item.url}
              to={item.url}
              className="block glass rounded-xl border border-gray-800 hover:border-cyan/40 p-5 transition-colors"
            >
              <div className="text-white font-semibold mb-1">
                {item.title}
              </div>
              <div className="text-sm text-gray-400 mb-2">
                {item.description}
              </div>
              <div className="text-xs text-cyan">{item.url}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
