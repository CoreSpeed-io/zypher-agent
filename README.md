# Zypher Agent

**Production-ready AI agents that live in your applications**

[![Build](https://github.com/CoreSpeed-io/zypher-agent/actions/workflows/build.yml/badge.svg)](https://github.com/CoreSpeed-io/zypher-agent/actions/workflows/build.yml)
[![JSR](https://jsr.io/badges/@corespeed/zypher)](https://jsr.io/badges/@corespeed/zypher)

Zypher Agent is a powerful Deno-based framework for building intelligent AI agents with autonomous decision-making, tool execution, and real-time streaming. Build agents that can search academic papers, manage subscriptions, send emails, execute code, and much more.

## 🌟 Key Features

### Core Framework
- **🤖 Agent, Not Workflow**: Reactive loop where agents dynamically decide next steps based on LLM reasoning
- **♻️ Loop Interceptor System**: Extensible post-inference hooks for custom behavior
- **🔧 Rich Tool Ecosystem**: Built-in tools for files, terminal, search, and academic research
- **🔌 Model Context Protocol (MCP)**: Native MCP support with OAuth authentication
- **🎯 Multi-Provider Support**: Works with Anthropic Claude and OpenAI GPT models
- **✅ Production-Ready**: Timeouts, concurrency protection, error handling, and checkpoints

### Academic Research Assistant 🎓
- **📚 Multi-Database Search**: Search across arXiv, PubMed, and Semantic Scholar
- **👤 Author Tracking**: Follow specific researchers and get notified of new publications
- **📧 Email Digests**: Beautiful HTML email reports with personalized research updates
- **💾 Subscription Management**: Persistent storage with configurable frequencies (daily/weekly/monthly)
- **🤹 Multi-Field Coverage**: Physics, CS, Biology, Medicine, and all academic disciplines
- **⏰ Automated Scheduling**: Production-ready automation with cron/GitHub Actions

## 📚 Table of Contents

- [Quick Start](#-quick-start)
- [Core Framework Usage](#-core-framework-usage)
- [Academic Research Assistant](#-academic-research-assistant)
- [Configuration](#-configuration)
- [Available Tools](#-available-tools)
- [Examples](#-examples)
- [Deployment](#-deployment)
- [Architecture](#-architecture)
- [Contributing](#-contributing)
- [License](#-license)

## 🚀 Quick Start

### Prerequisites

```bash
# Install Deno (v1.40+)
curl -fsSL https://deno.land/x/install/install.sh | sh

# Or using Homebrew (macOS)
brew install deno
```

### Installation

> [!NOTE]
> npm support coming soon. Currently available via JSR for Deno projects.

```typescript
// Using JSR import
import { ZypherAgent } from "jsr:@corespeed/zypher@^0.5.1";

// Or in deno.json
{
  "imports": {
    "@zypher/": "jsr:@corespeed/zypher@^0.5.1/"
  }
}
```

### Environment Setup

Create a `.env` file in your project root:

```bash
# Required: LLM Provider
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Optional: For email functionality
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=your@domain.com
FROM_NAME=Your Name

# Optional: OpenAI (for image tools)
OPENAI_API_KEY=sk-xxxxx
```

## 💻 Core Framework Usage

### Basic Agent Setup

```typescript
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@zypher/mod.ts";
import { ReadFileTool, EditFileTool } from "@zypher/tools/mod.ts";

// Initialize context
const context = await createZypherContext("/path/to/workspace");

// Create provider
const provider = new AnthropicModelProvider({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

// Create agent
const agent = new ZypherAgent(context, provider);

// Register tools
agent.mcp.registerTool(ReadFileTool);
agent.mcp.registerTool(EditFileTool);

// Run a task
const events = agent.runTask(
  "Refactor the authentication module",
  "claude-sonnet-4-20250514"
);

// Handle streaming events
for await (const event of events) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.content);
      break;
    case "tool_use":
      console.log(`\nUsing tool: ${event.toolName}`);
      break;
    case "message":
      console.log("\nMessage complete");
      break;
  }
}
```

### Custom Tools

Create custom tools with Zod schema validation:

```typescript
import { z } from "zod";
import { createTool } from "@zypher/tools/mod.ts";

const DatabaseQueryTool = createTool({
  name: "query_database",
  description: "Execute SQL queries on the database",
  schema: z.object({
    query: z.string().describe("SQL query to execute"),
    database: z.string().optional().describe("Database name"),
  }),
  execute: async ({ query, database }) => {
    // Your implementation
    const result = await db.query(query);
    return JSON.stringify(result);
  },
});

agent.mcp.registerTool(DatabaseQueryTool);
```

### Loop Interceptors

Customize agent behavior with interceptors:

```typescript
import {
  LoopInterceptor,
  LoopDecision
} from "@zypher/loopInterceptors/mod.ts";

class CustomApprovalInterceptor implements LoopInterceptor {
  name = "custom-approval";
  description = "Require approval for sensitive operations";

  async intercept(context) {
    if (this.isSensitiveOperation(context.lastResponse)) {
      const approved = await this.requestApproval();
      if (!approved) {
        return { decision: LoopDecision.COMPLETE };
      }
    }
    return { decision: LoopDecision.COMPLETE };
  }
}

agent.loopInterceptor.register(new CustomApprovalInterceptor());
```

## 🎓 Academic Research Assistant

Transform your research workflow with automated paper discovery, analysis, and delivery.

### Features

| Feature | Description | Data Sources |
|---------|-------------|--------------|
| **Multi-DB Search** | Search across multiple academic databases | arXiv, PubMed, Semantic Scholar |
| **Author Tracking** | Follow specific researchers | Semantic Scholar |
| **Smart Analysis** | LLM-powered trend identification | Claude/GPT |
| **Email Digests** | Beautiful HTML reports | Resend API |
| **Subscriptions** | Persistent, scheduled updates | Deno KV |

### Quick Example

```typescript
import {
  ArXivSearchTool,
  PubMedSearchTool,
  SemanticScholarSearchTool,
  TrackAuthorTool,
  SendEmailTool,
} from "@zypher/tools/mod.ts";

// Register research tools
agent.mcp.registerTool(ArXivSearchTool);
agent.mcp.registerTool(PubMedSearchTool);
agent.mcp.registerTool(SemanticScholarSearchTool);
agent.mcp.registerTool(TrackAuthorTool);
agent.mcp.registerTool(SendEmailTool);

// Run research task
const task = `
Search for recent papers on "quantum computing" across:
1. arXiv (5 papers)
2. Semantic Scholar (5 papers)

Analyze the results and send an email summary to research@university.edu
`;

const events = agent.runTask(task, "claude-sonnet-4-20250514");
```

### Subscription System

Create automated research digests:

```typescript
import { SubscriptionManager } from "@zypher/tools/mod.ts";

const manager = await SubscriptionManager.create();

// Subscribe to a topic
await manager.addSubscription({
  type: "topic",
  query: "large language models",
  email: "researcher@university.edu",
  dataSources: ["arxiv", "semantic_scholar"],
  frequency: "weekly",
  maxResults: 10,
  active: true,
});

// Track an author
await manager.addSubscription({
  type: "author",
  query: "Geoffrey Hinton",
  email: "researcher@university.edu",
  dataSources: ["semantic_scholar"],
  frequency: "monthly",
  maxResults: 5,
  active: true,
});

// Get subscriptions due for sending
const dueSubscriptions = await manager.getSubscriptionsDueForSending();
```

### Automated Digests

Set up scheduled research updates:

```bash
# Run the automated digest sender
deno run -A examples/automated_research_digest.ts

# Add to crontab for daily execution at 9 AM
crontab -e
# Add: 0 9 * * * cd /path/to/project && deno run -A examples/automated_research_digest.ts
```

**See [examples/RESEARCH_SUBSCRIPTION_GUIDE.md](examples/RESEARCH_SUBSCRIPTION_GUIDE.md) for comprehensive documentation.**

## ⚙️ Configuration

### Environment Variables

```bash
# ============================================================
# Required: LLM Provider
# ============================================================
ANTHROPIC_API_KEY=sk-ant-xxxxx        # Anthropic API key
# or
OPENAI_API_KEY=sk-xxxxx               # OpenAI API key

# ============================================================
# Email System (for research assistant)
# ============================================================
RESEND_API_KEY=re_xxxxx               # Resend API key (free: 3k emails/mo)
FROM_EMAIL=research@yourdomain.com    # Verified sender email
FROM_NAME=Research Assistant          # Sender display name

# ============================================================
# Optional: Advanced Configuration
# ============================================================
MCP_STORE_BASE_URL=https://...        # Custom MCP store
KV_PATH=/path/to/database.db          # Deno KV database location
```

### Agent Configuration

```typescript
const agent = new ZypherAgent(context, provider, {
  config: {
    maxIterations: 25,        // Max agent loop iterations
    maxTokens: 8192,          // Max tokens per response
    taskTimeoutMs: 900000,    // Task timeout (15 min)
  },
  checkpointManager,          // Optional git-based checkpoints
  storageService,             // Optional file attachment storage
});
```

### Email Service Setup

1. **Sign up for Resend**: https://resend.com (free tier: 3,000 emails/month)
2. **Get API key**: Dashboard → API Keys → Create
3. **Verify domain**: Dashboard → Domains → Add Domain (or use test mode)
4. **Set environment variables**:
   ```bash
   export RESEND_API_KEY='re_xxxxx'
   export FROM_EMAIL='research@yourdomain.com'
   ```

## 🔧 Available Tools

### File Operations
- `ReadFileTool` - Read file contents
- `EditFileTool` - Edit files with backups
- `ListDirTool` - List directory contents
- `CopyFileTool` - Copy files
- `DeleteFileTool` - Delete files

### Search & Discovery
- `GrepSearchTool` - Search file contents with regex
- `FileSearchTool` - Find files by name/pattern

### Terminal
- `RunTerminalCmdTool` - Execute shell commands

### Academic Research 🎓
- `ArXivSearchTool` - Search arXiv (Physics, CS, Math)
- `PubMedSearchTool` - Search PubMed (Biomedical)
- `SemanticScholarSearchTool` - Multi-disciplinary search
- `TrackAuthorTool` - Follow researchers
- `SendEmailTool` - Send HTML emails

### Image Generation (requires OpenAI)
- `ImageGenTool` - Generate images with DALL-E
- `ImageEditTool` - Edit images

## 📖 Examples

### Example 1: Code Assistant

```bash
# Run the CLI
deno run -A bin/cli.ts \
  --api-key $ANTHROPIC_API_KEY \
  --model claude-sonnet-4-20250514

# Task: "Add error handling to all API endpoints"
```

### Example 2: Simple Research Search

```bash
# Search and analyze papers
deno run -A examples/academic_assistant_demo.ts
```

### Example 3: Full Research Subscription System

```bash
# Interactive demo of all features
deno run -A examples/research_subscription_demo.ts
```

### Example 4: Automated Research Digests

```bash
# Check subscriptions and send emails
deno run -A examples/automated_research_digest.ts
```

### Example 5: Custom Agent

```typescript
import { ZypherAgent, createZypherContext } from "@zypher/mod.ts";

const agent = new ZypherAgent(context, provider);

// Add custom tools
agent.mcp.registerTool(MyCustomTool);

// Add custom interceptor
agent.loopInterceptor.register(new MyInterceptor());

// Run custom task
const events = agent.runTask("Your custom task", model);
```

## 🚀 Deployment

### Local Development

```bash
# Clone repository
git clone https://github.com/CoreSpeed-io/zypher-agent.git
cd zypher-agent

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run examples
deno run -A examples/research_subscription_demo.ts
```

### Production (Automated Digests)

#### Option 1: Cron (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add daily execution at 9 AM
0 9 * * * cd /path/to/zypher-agent && /usr/local/bin/deno run -A examples/automated_research_digest.ts >> /var/log/research-digest.log 2>&1
```

#### Option 2: GitHub Actions

Create `.github/workflows/research-digest.yml`:

```yaml
name: Research Digests

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:

jobs:
  send-digests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x
      - name: Send digests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          FROM_EMAIL: ${{ secrets.FROM_EMAIL }}
        run: deno run -A examples/automated_research_digest.ts
```

#### Option 3: Docker

```dockerfile
FROM denoland/deno:latest

WORKDIR /app
COPY . .

# Cache dependencies
RUN deno cache src/mod.ts

CMD ["deno", "run", "-A", "examples/automated_research_digest.ts"]
```

### Monitoring & Logging

```typescript
// Add custom logging
const logFile = await Deno.open("agent.log", {
  write: true,
  append: true,
  create: true,
});

// Stream logs
for await (const event of agent.runTask(task, model)) {
  const log = JSON.stringify({ timestamp: new Date(), event }) + "\n";
  await logFile.write(new TextEncoder().encode(log));
}
```

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────┐
│           User Application                   │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│         ZypherAgent (Core)                   │
│  ┌────────────────────────────────────┐     │
│  │  Message Management                 │     │
│  │  - History tracking                 │     │
│  │  - Checkpoint integration           │     │
│  └────────────────────────────────────┘     │
│  ┌────────────────────────────────────┐     │
│  │  Agent Loop                         │     │
│  │  1. Call LLM                        │     │
│  │  2. Stream events                   │     │
│  │  3. Execute interceptors            │     │
│  │  4. Decide: continue/complete       │     │
│  └────────────────────────────────────┘     │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┴────────┬──────────────┐
       ▼                ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Model       │  │ Loop        │  │ MCP Server  │
│ Provider    │  │ Interceptor │  │ Manager     │
│             │  │ Manager     │  │             │
│ - Anthropic │  │             │  │ - Tools     │
│ - OpenAI    │  │ - Tool Exec │  │ - Servers   │
└─────────────┘  │ - Max Tokens│  │ - OAuth     │
                 │ - Error Det │  └─────────────┘
                 └─────────────┘
```

### Agent Loop Flow

```
1. User provides task description
   ↓
2. Agent creates user message + checkpoint
   ↓
3. [LOOP] Call LLM with full context
   ↓
4. Stream text/tool events to user
   ↓
5. Get complete LLM response
   ↓
6. Execute Loop Interceptors (chain)
   │
   ├→ ToolExecutionInterceptor
   │  - Detect tool_use blocks
   │  - Execute tools
   │  - Add results to context
   │  - Decision: CONTINUE
   │
   ├→ MaxTokensInterceptor
   │  - Check if truncated
   │  - Add continuation message
   │  - Decision: CONTINUE
   │
   └→ ErrorDetectionInterceptor
      - Parse for code errors
      - Add error context
      - Decision: CONTINUE
   ↓
7. If any interceptor returns CONTINUE → goto step 3
   If all return COMPLETE → finish
   ↓
8. Task complete, return to user
```

### Research Assistant Flow

```
User creates subscription
   ↓
Stored in Deno KV
   ↓
[Scheduled: cron/GitHub Actions]
   ↓
Check due subscriptions
   ↓
For each subscription:
   ├→ Build search query
   ├→ Agent decides which tools to use
   ├→ Search databases (arXiv/PubMed/Semantic Scholar)
   ├→ LLM analyzes results
   ├→ Generate HTML email
   ├→ Send via Resend
   └→ Update lastSent timestamp
```

## 🛠️ Development

### Running Tests

```bash
# Run all tests
deno task test

# Run tests in watch mode
deno task test:watch

# Type check
deno check .

# Lint
deno lint

# Format
deno fmt

# All checks
deno task checkall
```

### Building

```bash
# Compile CLI binary
deno task compile
# Output: dist/cli

# Build NPM package
deno task build:npm
```

## 🤝 Contributing

We welcome contributions! Here are some areas where you can help:

### Core Framework
- [ ] Additional loop interceptors
- [ ] More model providers
- [ ] Enhanced error handling
- [ ] Performance optimizations

### Research Assistant
- [ ] More data sources (Google Scholar, IEEE, ACM)
- [ ] Citation graph analysis
- [ ] Recommendation algorithms
- [ ] Web interface for subscriptions
- [ ] Mobile push notifications

### Documentation
- [ ] More examples
- [ ] Video tutorials
- [ ] API documentation improvements

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `deno task test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📚 Documentation

- **[API Reference](https://jsr.io/@corespeed/zypher/doc)** - Complete API documentation
- **[Research Subscription Guide](examples/RESEARCH_SUBSCRIPTION_GUIDE.md)** - Comprehensive research assistant guide
- **[Examples Directory](examples/)** - Working code examples
- **[Model Context Protocol](https://modelcontextprotocol.io/)** - MCP specification

## 🐛 Troubleshooting

### Common Issues

**"ANTHROPIC_API_KEY not set"**
```bash
export ANTHROPIC_API_KEY='your-key-here'
# or add to .env file
```

**"Email not sending"**
1. Check RESEND_API_KEY is set
2. Verify FROM_EMAIL in Resend dashboard
3. Check Resend logs at https://resend.com/emails

**"Rate limit errors"**
- arXiv: ~1 request/second
- PubMed: 3 req/sec (no key), 10 req/sec (with key)
- Semantic Scholar: 100 requests/5 minutes

**"Network errors in sandboxed environment"**
- This project requires network access for API calls
- Ensure your environment allows outbound HTTPS

### Getting Help

- 📝 [Open an issue](https://github.com/CoreSpeed-io/zypher-agent/issues)
- 💬 [GitHub Discussions](https://github.com/CoreSpeed-io/zypher-agent/discussions)
- 📧 Email: support@corespeed.io

## 📊 Performance

- **Agent Loop**: ~2-5 seconds per iteration (depends on LLM)
- **Tool Execution**: ~100-500ms per tool
- **arXiv Search**: ~1-3 seconds for 10 papers
- **PubMed Search**: ~2-4 seconds for 10 papers
- **Email Sending**: ~200-500ms per email

## 🗺️ Roadmap

### Q1 2025
- [x] Core agent framework
- [x] Multi-database research tools
- [x] Email subscription system
- [ ] npm package support
- [ ] Web interface for subscriptions

### Q2 2025
- [ ] Google Scholar integration
- [ ] Citation analysis tools
- [ ] Recommendation engine
- [ ] Mobile app

### Q3 2025
- [ ] Multi-agent collaboration
- [ ] Advanced workflow orchestration
- [ ] Enterprise features

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE.md](LICENSE.md) for details.

## 🙏 Acknowledgments

Built with:
- [Anthropic Claude](https://www.anthropic.com) - LLM for reasoning
- [Deno](https://deno.land) - Runtime environment
- [Resend](https://resend.com) - Email delivery
- [arXiv](https://arxiv.org) - Open access papers
- [PubMed](https://pubmed.ncbi.nlm.nih.gov) - Biomedical literature
- [Semantic Scholar](https://www.semanticscholar.org) - Academic search

Special thanks to all [contributors](https://github.com/CoreSpeed-io/zypher-agent/graphs/contributors)!

## 📬 Contact

- **Website**: [corespeed.io](https://corespeed.io)
- **Email**: hello@corespeed.io
- **GitHub**: [@CoreSpeed-io](https://github.com/CoreSpeed-io)
- **Twitter**: [@CoreSpeedIO](https://twitter.com/CoreSpeedIO)

---

Built with ♥️ by [CoreSpeed](https://corespeed.io)

**⭐ Star us on GitHub if you find this project useful!**
