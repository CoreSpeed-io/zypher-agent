# 如何运行城市犯罪预测演示

## 📋 前置要求

### 1. 安装 Deno

```bash
# macOS / Linux
curl -fsSL https://deno.land/x/install/install.sh | sh

# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex

# 或使用 Homebrew (macOS)
brew install deno
```

### 2. 配置 API Keys

创建 `.env` 文件或设置环境变量：

```bash
# DeepSeek API (必需)
export OPENAI_API_KEY=sk-50ef015b4dbe4bb893c19e0b70c4cc9a
export OPENAI_BASE_URL=https://api.deepseek.com

# 邮件发送 (可选 - 如果想发送邮件报告)
export RESEND_API_KEY=your-resend-key
export FROM_EMAIL=your-email@domain.com
```

## 🚀 运行演示

### 方法 1: 完整演示（推荐）

```bash
# 进入项目目录
cd /path/to/zypher-agent

# 运行城市犯罪预测演示
deno run -A examples/demo_urban_crime_research.ts
```

**这个脚本会：**
1. ✅ 使用 DeepSeek API 进行分析
2. ✅ 搜索 arXiv 上关于"城市犯罪预测"的最新论文（最多10篇）
3. ✅ 生成详细的中文研究报告，包括：
   - 论文清单（中英文标题、作者、日期、链接）
   - 研究趋势总结
   - 重点论文分析
   - 未来展望
4. ✅ 如果配置了邮件，发送到 softlight1998@aliyun.com
5. ✅ 保存报告到本地文件

**预期输出：**
```
══════════════════════════════════════════════════════════════════
║                                                                ║
║     🏙️  Urban Crime Prediction Research - arXiv Search        ║
║                                                                ║
══════════════════════════════════════════════════════════════════

🔧 Initializing DeepSeek AI...
✓ DeepSeek provider initialized
  Model: deepseek-chat
  Base URL: https://api.deepseek.com
✓ ArXiv search tool registered
⚠️  Email not configured (will display report only)

📝 Research Task:
   Search arXiv for urban crime prediction papers
   Generate comprehensive analysis report
   Recipient: softlight1998@aliyun.com

🔍 Starting research...

────────────────────────────────────────────────────────────────

🔧 Using tool: search_arxiv_papers

[论文搜索结果...]

[DeepSeek 生成的详细分析报告...]

────────────────────────────────────────────────────────────────

✅ Research completed!
   Tools used: 1
   Report length: 15234 characters
   📄 Report displayed above (email not configured)
   💾 Report saved to: urban_crime_prediction_report_2025-01-16T10-30-00.md

══════════════════════════════════════════════════════════════════

🎉 Task completed successfully!
```

### 方法 2: 使用 CLI 进行自定义搜索

```bash
# 使用 DeepSeek 启动 CLI
deno run -A bin/cli.ts \
  --api-key sk-50ef015b4dbe4bb893c19e0b70c4cc9a \
  --base-url https://api.deepseek.com \
  --provider openai \
  --model deepseek-chat

# 在 CLI 中输入你的任务
> 搜索 arXiv 上关于"城市犯罪预测"的最新论文，分析主要研究方向
```

### 方法 3: 修改搜索主题

编辑 `examples/demo_urban_crime_research.ts`，修改搜索主题：

```typescript
// 原始
const taskDescription = `
Please search arXiv for recent papers on "urban crime prediction" or "crime forecasting".
...
`;

// 修改为其他主题
const taskDescription = `
Please search arXiv for recent papers on "traffic flow prediction" or "transportation optimization".
...
`;
```

## 📊 示例报告

查看预生成的示例报告：

```bash
# 查看示例报告
cat examples/DEMO_URBAN_CRIME_REPORT.md

# 或在浏览器中打开
open examples/DEMO_URBAN_CRIME_REPORT.md  # macOS
xdg-open examples/DEMO_URBAN_CRIME_REPORT.md  # Linux
```

这个示例报告展示了运行成功后的预期输出格式和内容。

## 🎯 自定义配置

### 修改搜索参数

在 `demo_urban_crime_research.ts` 中：

```typescript
// 修改搜索数量
Search for up to 10 papers  // 改成 5, 15, 20...

// 修改排序方式
sort_by: "lastUpdatedDate"  // 或 "submittedDate", "relevance"

// 修改搜索关键词
"urban crime prediction"  // 改成你感兴趣的主题
```

### 添加其他数据源

```typescript
// 在脚本中添加更多工具
import { PubMedSearchTool, SemanticScholarSearchTool } from "@zypher/tools/mod.ts";

agent.mcp.registerTool(PubMedSearchTool);
agent.mcp.registerTool(SemanticScholarSearchTool);

// 修改任务描述
const taskDescription = `
Search for papers on "urban crime prediction":
1. arXiv: 5 papers
2. PubMed: 3 papers  // 生物医学相关
3. Semantic Scholar: 5 papers  // 多学科
...
`;
```

### 配置邮件发送

如果你想通过邮件接收报告：

```bash
# 1. 注册 Resend (https://resend.com)
# 2. 获取 API Key
# 3. 设置环境变量

export RESEND_API_KEY=re_your_key_here
export FROM_EMAIL=research@yourdomain.com
export FROM_NAME="Research Assistant"

# 4. 运行演示（会自动发送邮件）
deno run -A examples/demo_urban_crime_research.ts
```

## 🐛 故障排除

### 问题 1: "Deno command not found"

**解决方案：**
```bash
# 确保 Deno 已安装
deno --version

# 如果未安装，参考上面的安装步骤
curl -fsSL https://deno.land/x/install/install.sh | sh

# 添加到 PATH (如果需要)
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 问题 2: "API key not valid"

**解决方案：**
```bash
# 确认 API Key 正确
export OPENAI_API_KEY=sk-50ef015b4dbe4bb893c19e0b70c4cc9a
export OPENAI_BASE_URL=https://api.deepseek.com

# 或创建 .env 文件
cat > .env << EOF
OPENAI_API_KEY=sk-50ef015b4dbe4bb893c19e0b70c4cc9a
OPENAI_BASE_URL=https://api.deepseek.com
EOF
```

### 问题 3: "Network error accessing arXiv"

**可能原因：**
- 网络连接问题
- arXiv API 临时不可用
- 请求频率过高

**解决方案：**
```bash
# 1. 检查网络连接
curl -I https://export.arxiv.org/api/query

# 2. 等待几分钟后重试

# 3. 如果持续失败，查看示例报告
cat examples/DEMO_URBAN_CRIME_REPORT.md
```

### 问题 4: "Module not found"

**解决方案：**
```bash
# 确保在项目根目录
cd /path/to/zypher-agent

# 检查 deno.json 配置
cat deno.json

# 清除缓存并重新运行
deno cache --reload src/mod.ts
deno run -A examples/demo_urban_crime_research.ts
```

### 问题 5: "中文显示乱码"

**解决方案：**
```bash
# 设置终端编码为 UTF-8
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 或在 macOS/Linux 终端设置中选择 UTF-8 编码
```

## 📝 输出文件

运行成功后会生成：

```
urban_crime_prediction_report_[timestamp].md
```

这个文件包含完整的研究报告，可以：
- 在文本编辑器中查看
- 用 Markdown 渲染器查看
- 分享给团队成员
- 作为后续研究的参考

## 💡 最佳实践

### 1. 批量搜索

如果需要搜索多个主题：

```bash
# 创建主题列表
topics=(
  "urban crime prediction"
  "traffic flow forecasting"
  "air quality prediction"
  "energy consumption forecasting"
)

# 循环搜索
for topic in "${topics[@]}"; do
  echo "Searching for: $topic"
  # 修改脚本或使用 CLI
  deno run -A examples/demo_urban_crime_research.ts
  sleep 5  # 避免请求过快
done
```

### 2. 定时任务

设置每周自动搜索：

```bash
# 编辑 crontab
crontab -e

# 添加（每周一早上9点）
0 9 * * 1 cd /path/to/zypher-agent && deno run -A examples/demo_urban_crime_research.ts
```

### 3. 结果归档

```bash
# 创建归档目录
mkdir -p research_reports/$(date +%Y-%m)

# 移动报告
mv urban_crime_prediction_report_*.md research_reports/$(date +%Y-%m)/
```

## 🔗 相关资源

- **DeepSeek 快速开始**: `DEEPSEEK_QUICKSTART.md`
- **DeepSeek 集成指南**: `examples/DEEPSEEK_INTEGRATION.md`
- **学术订阅系统**: `examples/RESEARCH_SUBSCRIPTION_GUIDE.md`
- **主 README**: `README.md`

## 📧 联系方式

如有问题或建议：
- **邮箱**: softlight1998@aliyun.com
- **GitHub Issues**: 在项目仓库中提 issue

---

**现在就开始！运行你的第一个城市犯罪预测研究：**

```bash
deno run -A examples/demo_urban_crime_research.ts
```

🎉 祝研究顺利！
