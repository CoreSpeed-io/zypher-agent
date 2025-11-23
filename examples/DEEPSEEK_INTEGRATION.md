# DeepSeek API Integration Guide

This guide shows you how to use Zypher Agent with DeepSeek's powerful AI models.

## 🌟 Why DeepSeek?

DeepSeek provides:
- **🇨🇳 Chinese Language Excellence**: Native Chinese language understanding and generation
- **💰 Cost-Effective**: More affordable than many Western alternatives
- **🔌 OpenAI Compatible**: Works seamlessly with OpenAI-compatible libraries
- **🚀 High Performance**: Fast response times and quality outputs
- **📚 Strong Reasoning**: Excellent at complex reasoning tasks

## 🚀 Quick Start

### Step 1: Get Your DeepSeek API Key

Your DeepSeek API key:
```
sk-50ef015b4dbe4bb893c19e0b70c4cc9a
```

**Note**: This key is already configured in the test files for your convenience.

### Step 2: Run the Test

```bash
# Run the DeepSeek integration test
deno run -A examples/test_deepseek.ts
```

This will run two tests:
1. **Basic Chat Test**: Simple conversation in Chinese
2. **Tool Integration Test**: Using tools (ReadFileTool) with DeepSeek

## 📖 Usage Examples

### Example 1: Basic Agent with DeepSeek

```typescript
import {
  createZypherContext,
  OpenAIModelProvider,
  ZypherAgent,
} from "@zypher/mod.ts";

// Configure DeepSeek
const provider = new OpenAIModelProvider({
  apiKey: "sk-50ef015b4dbe4bb893c19e0b70c4cc9a",
  baseUrl: "https://api.deepseek.com",
});

// Create agent
const context = await createZypherContext(Deno.cwd());
const agent = new ZypherAgent(context, provider);

// Run task in Chinese
const events = agent.runTask(
  "请帮我分析一下当前项目的代码结构",
  "deepseek-chat"
);

for await (const event of events) {
  if (event.type === "text") {
    console.log(event.content);
  }
}
```

### Example 2: Research Assistant with DeepSeek

```typescript
import {
  ArXivSearchTool,
  PubMedSearchTool,
  SemanticScholarSearchTool,
} from "@zypher/tools/mod.ts";

// Register research tools
agent.mcp.registerTool(ArXivSearchTool);
agent.mcp.registerTool(PubMedSearchTool);
agent.mcp.registerTool(SemanticScholarSearchTool);

// Search for papers in Chinese
const task = `
请搜索关于"量子计算"的最新论文：
1. 在 arXiv 上搜索 5 篇论文
2. 在 Semantic Scholar 上搜索 5 篇论文
3. 用中文总结主要研究趋势
`;

const events = agent.runTask(task, "deepseek-chat");
```

### Example 3: Academic Subscription with DeepSeek

```typescript
import { SubscriptionManager } from "@zypher/tools/mod.ts";

const manager = await SubscriptionManager.create();

// Create Chinese language subscription
await manager.addSubscription({
  type: "topic",
  query: "人工智能 机器学习",  // Chinese keywords
  email: "researcher@university.edu.cn",
  dataSources: ["arxiv", "semantic_scholar"],
  frequency: "weekly",
  maxResults: 10,
  active: true,
});

// The agent will use DeepSeek to generate Chinese summaries
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file:

```bash
# DeepSeek Configuration
DEEPSEEK_API_KEY=sk-50ef015b4dbe4bb893c19e0b70c4cc9a
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Use as default provider
OPENAI_API_KEY=${DEEPSEEK_API_KEY}
OPENAI_BASE_URL=${DEEPSEEK_BASE_URL}
```

### Model Configuration

Available DeepSeek models:
- `deepseek-chat`: General purpose chat model (recommended)
- `deepseek-coder`: Specialized for coding tasks

```typescript
// For general tasks
const events = agent.runTask(task, "deepseek-chat");

// For coding tasks
const events = agent.runTask(task, "deepseek-coder");
```

## 🎯 Use Cases

### 1. Chinese Academic Research

DeepSeek excels at understanding and summarizing Chinese academic papers:

```typescript
const task = `
搜索关于"CRISPR基因编辑"的中文和英文论文。
请用中文总结：
1. 最新研究进展
2. 主要应用领域
3. 未来发展方向
`;

const events = agent.runTask(task, "deepseek-chat");
```

### 2. Code Analysis with Chinese Comments

```typescript
const task = `
分析这个Python项目的代码结构。
请用中文说明：
1. 主要模块功能
2. 代码质量评估
3. 改进建议
`;

const events = agent.runTask(task, "deepseek-coder");
```

### 3. Bilingual Research Digests

```typescript
// Configure email tool
import { SendEmailTool } from "@zypher/tools/mod.ts";

agent.mcp.registerTool(SendEmailTool);

const task = `
搜索关于"大语言模型"的最新论文。
生成一份中英文双语的研究摘要邮件，发送到 researcher@example.com
`;

const events = agent.runTask(task, "deepseek-chat");
```

## 🔧 Advanced Configuration

### Custom System Prompt for Chinese

```typescript
const agent = new ZypherAgent(context, provider, {
  overrides: {
    systemPromptLoader: async () => {
      return `
你是一个专业的学术研究助手。
你的任务是帮助研究人员：
1. 搜索和分析学术论文
2. 总结研究趋势
3. 生成中文摘要

请始终使用专业、准确的中文表达。
      `.trim();
    },
  },
});
```

### Multi-Language Support

```typescript
// Automatic language detection and response
const task = `
Search for papers on "artificial intelligence" and "人工智能".
Provide a bilingual summary in both English and Chinese.
英文部分请简洁，中文部分请详细。
`;

const events = agent.runTask(task, "deepseek-chat");
```

## 📊 Performance Comparison

| Metric | DeepSeek | GPT-4 | Claude |
|--------|----------|-------|--------|
| Chinese Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| English Quality | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Cost | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Speed | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Coding | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## 🐛 Troubleshooting

### Issue: "API key not valid"

**Solution**: Make sure you're using the correct API key and base URL:
```typescript
const provider = new OpenAIModelProvider({
  apiKey: "sk-50ef015b4dbe4bb893c19e0b70c4cc9a",
  baseUrl: "https://api.deepseek.com",  // Important!
});
```

### Issue: "Model not found"

**Solution**: Use the correct model name:
- ✅ `deepseek-chat`
- ✅ `deepseek-coder`
- ❌ `deepseek-v2` (old naming)

### Issue: Chinese characters display incorrectly

**Solution**: Ensure your terminal supports UTF-8:
```bash
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
```

### Issue: Rate limiting

DeepSeek rate limits:
- **Free tier**: 60 requests/minute
- **Paid tier**: Higher limits based on plan

**Solution**: Add delays between requests:
```typescript
await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
```

## 💡 Best Practices

### 1. Language-Specific Prompts

For best results with Chinese:
```typescript
// ✅ Good - Clear language specification
const task = "请用中文分析这篇论文的主要贡献";

// ❌ Less optimal - Mixed language without clear instruction
const task = "Analyze this paper 的主要贡献";
```

### 2. Use Appropriate Models

```typescript
// For general research and Chinese text
const model = "deepseek-chat";

// For code analysis and generation
const model = "deepseek-coder";
```

### 3. Structured Output

Request structured output for better parsing:
```typescript
const task = `
分析这些论文并返回JSON格式：
{
  "papers": [
    {
      "title": "论文标题",
      "summary": "简短摘要",
      "importance": "重要性评分(1-10)"
    }
  ],
  "trends": ["趋势1", "趋势2"]
}
`;
```

## 🔗 Resources

- **DeepSeek Official**: https://www.deepseek.com/
- **API Documentation**: https://platform.deepseek.com/api-docs/
- **Pricing**: https://platform.deepseek.com/pricing
- **Discord Community**: https://discord.gg/deepseek

## 📝 Example Output

When you run `deno run -A examples/test_deepseek.ts`, you should see:

```
╔═══════════════════════════════════════════════════╗
║                                                   ║
║         DeepSeek API Integration Test             ║
║                                                   ║
╚═══════════════════════════════════════════════════╝

🧪 Testing DeepSeek API - Basic Chat

✓ Provider initialized with DeepSeek configuration
  Base URL: https://api.deepseek.com
  Model: deepseek-chat

✓ Agent created successfully

📝 Test Task:
   请用中文回答：什么是人工智能？请用2-3句话简要说明。

🤖 DeepSeek Response:

────────────────────────────────────────────────────────────

人工智能（AI）是计算机科学的一个分支，旨在创建能够模拟人类智能行为的系统。
这些系统可以学习、推理、解决问题并做出决策。
AI技术广泛应用于语音识别、图像处理、自然语言处理等领域。

────────────────────────────────────────────────────────────

✅ DeepSeek API Test PASSED!
   Response length: 156 characters

🧪 Testing DeepSeek API - With Tools

✓ Tool registered: ReadFileTool

📝 Test Task (with tool):
   请读取当前目录下的 README.md 文件，并告诉我这个项目的主要功能是什么？

🤖 DeepSeek Response:

────────────────────────────────────────────────────────────

🔧 Using tool: read_file

这个项目是 Zypher Agent，一个基于 Deno 的生产级 AI 代理框架...

────────────────────────────────────────────────────────────

✅ DeepSeek Tool Test PASSED!
   Tools used: 1
   Response length: 423 characters

════════════════════════════════════════════════════════════

📊 Test Summary:

  ✅ Basic Chat Test: PASSED
  ✅ Tool Integration Test: PASSED

════════════════════════════════════════════════════════════

🎉 All tests PASSED! DeepSeek integration is working!
```

## 🎉 Summary

DeepSeek integration with Zypher Agent provides:

✅ **Full Compatibility**: Works seamlessly with OpenAI-compatible interface
✅ **Chinese Excellence**: Best-in-class Chinese language support
✅ **Cost Effective**: More affordable for large-scale deployments
✅ **Tool Support**: Full support for all Zypher Agent tools
✅ **Research Ready**: Perfect for Chinese academic research workflows

**Ready to use DeepSeek? Run the test now:**
```bash
deno run -A examples/test_deepseek.ts
```
