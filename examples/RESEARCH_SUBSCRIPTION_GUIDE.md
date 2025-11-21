# 🎓 Research Subscription System - Complete Guide

A comprehensive academic research subscription system built with Zypher Agent that automatically searches, analyzes, and delivers personalized research updates via email.

## ✨ Features

### 📚 Multi-Database Search
- **arXiv**: Physics, CS, Math, and more (pre-prints)
- **PubMed**: Biomedical and life sciences
- **Semantic Scholar**: All fields with citation metrics

### 👤 Author Tracking
- Follow specific researchers
- Get notified of their latest publications
- See citation metrics and influence

### 📧 Email Digests
- Beautiful HTML emails
- Customizable frequency (daily/weekly/monthly)
- Personalized content based on interests

### 💾 Subscription Management
- Persistent storage with Deno KV
- Topic-based and author-based subscriptions
- Multi-database support per subscription

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Deno
curl -fsSL https://deno.land/x/install/install.sh | sh

# Set up environment variables
export ANTHROPIC_API_KEY='your-anthropic-key'
export RESEND_API_KEY='your-resend-key'
export FROM_EMAIL='research@yourdomain.com'
export FROM_NAME='Research Assistant'
```

### 2. Run the Demo

```bash
# Interactive demo showcasing all features
deno run -A examples/research_subscription_demo.ts
```

### 3. Set Up Automated Digests

```bash
# Run the automated sender
deno run -A examples/automated_research_digest.ts

# Or add to crontab for daily execution at 9 AM:
0 9 * * * cd /path/to/zypher-agent && deno run -A examples/automated_research_digest.ts
```

## 📖 Demos

### Demo 1: Simple Search (`academic_assistant_demo.ts`)

Basic single-database search and analysis:

```bash
deno run -A examples/academic_assistant_demo.ts
```

**What it does:**
- Searches arXiv for papers on "large language models"
- Uses Claude to analyze trends
- Outputs summary to console

### Demo 2: Multi-Database System (`research_subscription_demo.ts`)

Comprehensive demonstration of all features:

```bash
deno run -A examples/research_subscription_demo.ts
```

**What it includes:**
1. **Multi-Database Search**: Compare results across arXiv, PubMed, and Semantic Scholar
2. **Author Tracking**: Follow specific researchers
3. **Subscription Management**: Create and manage subscriptions
4. **Email Generation**: Generate and send HTML email reports

### Demo 3: Automated Digest (`automated_research_digest.ts`)

Production-ready automated email sender:

```bash
deno run -A examples/automated_research_digest.ts
```

**What it does:**
- Checks for subscriptions due to be sent
- Searches relevant databases
- Generates personalized emails
- Sends to subscribers
- Updates last-sent timestamps

## 🛠️ Available Tools

### Search Tools

#### 1. ArXiv Search Tool
```typescript
import { ArXivSearchTool } from "@zypher/tools/mod.ts";

// Parameters:
// - query: string
// - max_results: number (1-50)
// - sort_by: "relevance" | "lastUpdatedDate" | "submittedDate"
```

**Best for**: Physics, Computer Science, Mathematics, Quantitative fields

#### 2. PubMed Search Tool
```typescript
import { PubMedSearchTool } from "@zypher/tools/mod.ts";

// Parameters:
// - query: string
// - max_results: number (1-50)
// - sort_by: "relevance" | "pub_date"
```

**Best for**: Biomedical, Life Sciences, Medicine, Health

#### 3. Semantic Scholar Search Tool
```typescript
import { SemanticScholarSearchTool } from "@zypher/tools/mod.ts";

// Parameters:
// - query: string
// - max_results: number (1-100)
// - fields_of_study: string[] (optional)
```

**Best for**: All fields, Citation analysis, Cross-disciplinary research

#### 4. Track Author Tool
```typescript
import { TrackAuthorTool } from "@zypher/tools/mod.ts";

// Parameters:
// - author_name: string
// - max_results: number (1-100)
```

**Best for**: Following specific researchers, Tracking collaborations

### Email Tool

#### Send Email Tool
```typescript
import { SendEmailTool, createSendEmailTool } from "@zypher/tools/mod.ts";

// Uses Resend API for reliable delivery
// Generates beautiful HTML emails
// Supports paper metadata formatting
```

## 📊 Subscription Management API

### Create Subscription

```typescript
import { SubscriptionManager } from "@zypher/tools/mod.ts";

const manager = await SubscriptionManager.create();

// Topic-based subscription
const subscription = await manager.addSubscription({
  type: "topic",
  query: "quantum computing",
  email: "researcher@university.edu",
  dataSources: ["arxiv", "semantic_scholar"],
  frequency: "weekly",
  maxResults: 10,
  fieldsOfStudy: ["Physics", "Computer Science"], // Optional
  active: true,
});

// Author-based subscription
const authorSub = await manager.addSubscription({
  type: "author",
  query: "Geoffrey Hinton",
  email: "researcher@university.edu",
  dataSources: ["semantic_scholar"],
  frequency: "monthly",
  maxResults: 5,
  active: true,
});
```

### Manage Subscriptions

```typescript
// Get subscriptions by email
const subs = await manager.getSubscriptionsByEmail("researcher@university.edu");

// Update subscription
await manager.updateSubscription(subscription.id, {
  frequency: "daily",
  maxResults: 20,
});

// Delete subscription
await manager.deleteSubscription(subscription.id);

// Get statistics
const stats = await manager.getStatistics();
console.log(`Total subscriptions: ${stats.total}`);
console.log(`Active: ${stats.active}`);
```

### Check Due Subscriptions

```typescript
// Get subscriptions that need to be sent
const dueSubscriptions = await manager.getSubscriptionsDueForSending();

// Process each one
for (const sub of dueSubscriptions) {
  // ... search and send email ...

  // Mark as sent
  await manager.markSubscriptionSent(sub.id);
}
```

## 🎨 Email Templates

The system generates beautiful HTML emails with:

- **Gradient header** with title
- **Personalized greeting**
- **Paper cards** with:
  - Title (linked)
  - Authors
  - Publication date
  - Abstract
- **Footer** with unsubscribe info

### Customize Email Templates

Edit `src/tools/SendEmailTool.ts` to modify the `generateResearchEmailTemplate` function:

```typescript
function generateResearchEmailTemplate(
  title: string,
  content: string,
  papers?: Array<{...}>
): string {
  // Customize HTML template here
}
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# For email functionality
RESEND_API_KEY=re_...
FROM_EMAIL=research@yourdomain.com
FROM_NAME=Research Assistant

# Optional
MCP_STORE_BASE_URL=https://api1.mcp.corespeed.io
```

### Email Service Setup

This system uses [Resend](https://resend.com) for email delivery:

1. Sign up at https://resend.com (free tier: 3,000 emails/month)
2. Get your API key
3. Verify your domain (or use test mode)
4. Set `RESEND_API_KEY` environment variable

### Scheduling

#### Option 1: Cron (Linux/Mac)

```bash
# Edit crontab
crontab -e

# Add line for daily execution at 9 AM
0 9 * * * cd /path/to/zypher-agent && /path/to/deno run -A examples/automated_research_digest.ts >> /tmp/research-digest.log 2>&1
```

#### Option 2: GitHub Actions

Create `.github/workflows/research-digest.yml`:

```yaml
name: Send Research Digests

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:  # Manual trigger

jobs:
  send-digests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: denoland/setup-deno@v1
        with:
          deno-version: v1.x

      - name: Send research digests
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          FROM_EMAIL: ${{ secrets.FROM_EMAIL }}
        run: deno run -A examples/automated_research_digest.ts
```

#### Option 3: Deno Deploy (Coming Soon)

Deploy as a serverless cron job on Deno Deploy.

## 📚 Usage Examples

### Example 1: AI Researcher

```typescript
// Subscribe to multiple AI topics
await manager.addSubscription({
  type: "topic",
  query: "large language models",
  email: "ai.researcher@university.edu",
  dataSources: ["arxiv", "semantic_scholar"],
  frequency: "daily",
  maxResults: 15,
  fieldsOfStudy: ["Computer Science"],
  active: true,
});

await manager.addSubscription({
  type: "topic",
  query: "reinforcement learning",
  email: "ai.researcher@university.edu",
  dataSources: ["arxiv"],
  frequency: "weekly",
  maxResults: 10,
  active: true,
});

// Track influential researchers
await manager.addSubscription({
  type: "author",
  query: "Yann LeCun",
  email: "ai.researcher@university.edu",
  dataSources: ["semantic_scholar"],
  frequency: "monthly",
  maxResults: 5,
  active: true,
});
```

### Example 2: Medical Researcher

```typescript
// Focus on biomedical databases
await manager.addSubscription({
  type: "topic",
  query: "CRISPR gene editing cancer",
  email: "med.researcher@hospital.edu",
  dataSources: ["pubmed", "semantic_scholar"],
  frequency: "weekly",
  maxResults: 20,
  fieldsOfStudy: ["Medicine", "Biology"],
  active: true,
});

await manager.addSubscription({
  type: "topic",
  query: "immunotherapy clinical trials",
  email: "med.researcher@hospital.edu",
  dataSources: ["pubmed"],
  frequency: "daily",
  maxResults: 10,
  active: true,
});
```

### Example 3: Interdisciplinary Lab

```typescript
// Track across all databases
await manager.addSubscription({
  type: "topic",
  query: "AI in drug discovery",
  email: "lab@university.edu",
  dataSources: ["all"],  // Search all databases
  frequency: "weekly",
  maxResults: 30,
  active: true,
});
```

## 🔍 Advanced Features

### Custom Analysis Prompts

Modify the task description in `automated_research_digest.ts` to customize how Claude analyzes papers:

```typescript
const taskDescription = `
Search for papers on "${subscription.query}".

Analyze with focus on:
1. Novel methodologies
2. Practical applications
3. Contradicting results
4. Open questions

Then send a detailed email...
`;
```

### Multi-Language Support

Add language preferences to subscriptions:

```typescript
const subscription = await manager.addSubscription({
  // ... other fields ...
  language: "zh-CN",  // Chinese summaries
});
```

Then modify prompts to generate summaries in the requested language.

### Citation Alerts

Track highly-cited papers:

```typescript
// In your analysis prompt
const taskDescription = `
Search Semantic Scholar and highlight papers with:
- >100 citations
- >10 influential citations
- Recent (last 6 months) but already highly cited
`;
```

## 🐛 Troubleshooting

### API Rate Limits

**arXiv**: No authentication, but rate limited
- **Limit**: ~1 request/second
- **Solution**: Add delays between requests

**PubMed**: No API key required
- **Limit**: 3 requests/second without key, 10 with key
- **Solution**: Get NCBI API key (free)

**Semantic Scholar**: No authentication required
- **Limit**: 100 requests/5 minutes
- **Solution**: Upgrade to API key for higher limits

**Resend**:
- **Free tier**: 3,000 emails/month, 100/day
- **Solution**: Upgrade plan if needed

### Email Not Sending

Check:
1. `RESEND_API_KEY` is set correctly
2. `FROM_EMAIL` is verified in Resend dashboard
3. Recipient email is not blocked/bounced
4. Check Resend logs at https://resend.com/emails

### Subscriptions Not Triggering

Check:
1. Subscription is `active: true`
2. `frequency` requirements are met (check `lastSent` timestamp)
3. Run `getSubscriptionsDueForSending()` to debug

### Network Errors

If you see `fetch failed` errors:
1. Check internet connection
2. Verify API endpoints are accessible
3. Check for firewall/proxy issues

## 📈 Performance Optimization

### Batch Processing

Process multiple subscriptions in parallel:

```typescript
const dueSubscriptions = await manager.getSubscriptionsDueForSending();

// Process in batches of 5
for (let i = 0; i < dueSubscriptions.length; i += 5) {
  const batch = dueSubscriptions.slice(i, i + 5);
  await Promise.all(
    batch.map(sub => processSubscription(agent, sub, manager))
  );
}
```

### Caching

Cache search results to avoid redundant API calls:

```typescript
const cache = new Map<string, CachedResult>();

// Before searching, check cache
const cacheKey = `${query}-${date}`;
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

### Database Indexing

For large-scale deployment, use proper database with indexing:

```typescript
// Replace Deno KV with PostgreSQL, MySQL, etc.
// Index on: email, active, lastSent, frequency
```

## 🚀 Production Deployment

### Checklist

- [ ] Set all environment variables
- [ ] Verify email domain in Resend
- [ ] Test with real subscriptions
- [ ] Set up monitoring/alerting
- [ ] Configure error logging
- [ ] Schedule automated runs
- [ ] Implement rate limiting
- [ ] Add unsubscribe links
- [ ] Set up backup/recovery
- [ ] Document for team

### Monitoring

Add logging and monitoring:

```typescript
// Log to file
const logFile = await Deno.open("research-digest.log", {
  write: true,
  append: true,
  create: true,
});

// Log all events
console.log = (msg) => {
  const timestamp = new Date().toISOString();
  logFile.write(new TextEncoder().encode(`${timestamp}: ${msg}\n`));
};
```

### Error Handling

Implement retry logic for transient failures:

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  throw new Error("Should not reach here");
}
```

## 🤝 Contributing

Ideas for contributions:

1. **More data sources**: Google Scholar, IEEE Xplore, ACM Digital Library
2. **Better email templates**: More customization options
3. **Web interface**: Subscription management UI
4. **Mobile app**: Push notifications
5. **Analytics**: Usage statistics and insights

## 📄 License

Apache License 2.0 - See main project LICENSE.md

## 🙏 Acknowledgments

Built with:
- [Zypher Agent](https://github.com/CoreSpeed-io/zypher-agent) - Agent framework
- [Anthropic Claude](https://www.anthropic.com) - LLM for analysis
- [Resend](https://resend.com) - Email delivery
- [arXiv API](https://arxiv.org/help/api) - Physics/CS papers
- [PubMed API](https://www.ncbi.nlm.nih.gov/home/develop/api/) - Biomedical papers
- [Semantic Scholar API](https://www.semanticscholar.org/product/api) - Multi-disciplinary papers
