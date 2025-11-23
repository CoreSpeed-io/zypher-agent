# 🚀 DeepSeek 快速开始指南

## 你的 DeepSeek API Key

```
sk-50ef015b4dbe4bb893c19e0b70c4cc9a
```

这个 API key 已经配置在项目的测试文件中，可以直接使用。

## 立即测试

### 方法 1: 运行自动化测试（推荐）

```bash
# 运行完整的 DeepSeek 集成测试
deno run -A examples/test_deepseek.ts
```

这个测试会：
1. ✅ 测试基础对话功能（中文）
2. ✅ 测试工具集成（读取文件）
3. ✅ 显示详细的测试结果

### 方法 2: 手动测试

```bash
# 1. 进入项目目录
cd /path/to/zypher-agent

# 2. 设置环境变量
export OPENAI_API_KEY=sk-50ef015b4dbe4bb893c19e0b70c4cc9a
export OPENAI_BASE_URL=https://api.deepseek.com

# 3. 运行 CLI
deno run -A bin/cli.ts \
  --api-key sk-50ef015b4dbe4bb893c19e0b70c4cc9a \
  --base-url https://api.deepseek.com \
  --provider openai \
  --model deepseek-chat

# 4. 测试对话
# 在 CLI 中输入：请用中文介绍一下你自己
```

### 方法 3: 学术研究测试

```bash
# 使用 DeepSeek 进行学术论文搜索
deno run -A examples/academic_assistant_demo.ts

# 在任务描述中使用中文
# 例如："搜索关于'人工智能'的最新论文，用中文总结"
```

## 预期结果

### 测试 1: 基础对话
```
🧪 Testing DeepSeek API - Basic Chat

📝 Test Task:
   请用中文回答：什么是人工智能？

🤖 DeepSeek Response:
────────────────────────────────────────
人工智能（AI）是计算机科学的一个分支...
────────────────────────────────────────

✅ DeepSeek API Test PASSED!
```

### 测试 2: 工具集成
```
🧪 Testing DeepSeek API - With Tools

🔧 Using tool: read_file

🤖 DeepSeek Response:
────────────────────────────────────────
这个项目是 Zypher Agent...
────────────────────────────────────────

✅ DeepSeek Tool Test PASSED!
   Tools used: 1
```

## 常见用例

### 用例 1: 中文学术搜索

```typescript
import { ZypherAgent, OpenAIModelProvider } from "@zypher/mod.ts";

const provider = new OpenAIModelProvider({
  apiKey: "sk-50ef015b4dbe4bb893c19e0b70c4cc9a",
  baseUrl: "https://api.deepseek.com",
});

const events = agent.runTask(
  "搜索关于'量子计算'的最新论文，用中文总结主要研究方向",
  "deepseek-chat"
);
```

### 用例 2: 代码分析

```typescript
const events = agent.runTask(
  "分析当前项目的代码结构，用中文说明主要模块",
  "deepseek-coder"
);
```

### 用例 3: 订阅管理

```typescript
import { SubscriptionManager } from "@zypher/tools/mod.ts";

const manager = await SubscriptionManager.create();

await manager.addSubscription({
  type: "topic",
  query: "机器学习 深度学习",  // 中文关键词
  email: "researcher@example.com",
  dataSources: ["arxiv", "semantic_scholar"],
  frequency: "weekly",
  maxResults: 10,
  active: true,
});
```

## 性能优势

| 指标 | DeepSeek | 其他模型 |
|------|----------|----------|
| 中文质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 成本 | 💰 低 | 💰💰💰 高 |
| 速度 | 🚀 快 | 🚀 中等 |
| API兼容 | ✅ OpenAI兼容 | ✅ |

## 文件清单

项目中已包含以下 DeepSeek 相关文件：

- ✅ `.env.deepseek` - API 配置文件
- ✅ `examples/test_deepseek.ts` - 完整测试脚本
- ✅ `examples/DEEPSEEK_INTEGRATION.md` - 详细集成指南
- ✅ `DEEPSEEK_QUICKSTART.md` - 本文件（快速开始）

## 下一步

1. **运行测试**: `deno run -A examples/test_deepseek.ts`
2. **查看详细文档**: 阅读 `examples/DEEPSEEK_INTEGRATION.md`
3. **开始使用**: 在你的项目中集成 DeepSeek

## 需要帮助？

- 📖 查看 `examples/DEEPSEEK_INTEGRATION.md` 了解详细用法
- 🔗 访问 DeepSeek 官网: https://www.deepseek.com/
- 📧 API 文档: https://platform.deepseek.com/api-docs/

---

**立即开始**: `deno run -A examples/test_deepseek.ts` 🚀
