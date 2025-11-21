# Academic Research Assistant Examples

This directory contains example implementations of an academic research assistant using Zypher Agent.

## Demo: Academic Assistant

The `academic_assistant_demo.ts` demonstrates how to:

1. Search for academic papers on arXiv by topic
2. Use LLM to analyze research trends
3. Generate summaries of recent research

### Prerequisites

1. **Install Deno** (if not already installed):
   ```bash
   curl -fsSL https://deno.land/x/install/install.sh | sh
   ```

2. **Set up your Anthropic API key**:
   ```bash
   export ANTHROPIC_API_KEY='your-api-key-here'
   ```

   Or create a `.env` file in the project root:
   ```
   ANTHROPIC_API_KEY=your-api-key-here
   ```

### Running the Demo

From the project root directory:

```bash
# Run the academic assistant demo
deno run -A examples/academic_assistant_demo.ts
```

### What the Demo Does

1. **Initializes the Agent**: Creates a ZypherAgent with Anthropic's Claude model
2. **Registers ArXiv Tool**: Adds the ArXiv search tool to query academic papers
3. **Searches Papers**: Queries arXiv for papers on "large language models"
4. **Analyzes Results**: Uses Claude to summarize key themes and trends
5. **Outputs Summary**: Displays the research summary to the console

### Customizing the Demo

You can modify the research topic by editing the `researchTopic` variable:

```typescript
const researchTopic = "your topic here";
```

Or change the search parameters in the task description:
- Number of papers (default: 5)
- Sort order (relevance, lastUpdatedDate, submittedDate)
- Analysis focus

## How It Works

### Architecture

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ Topic: "LLMs"
       ▼
┌─────────────────────┐
│   Zypher Agent      │
│  ┌───────────────┐  │
│  │ Claude LLM    │  │
│  └───────┬───────┘  │
│          │ decides   │
│          ▼           │
│  ┌───────────────┐  │
│  │ ArXiv Tool    │  │
│  │ - Search API  │  │
│  │ - Parse XML   │  │
│  │ - Format      │  │
│  └───────┬───────┘  │
│          │           │
└──────────┼───────────┘
           │
           ▼
     ┌─────────────┐
     │ ArXiv API   │
     │ (Public)    │
     └─────────────┘
```

### Tool Implementation

The `ArXivSearchTool` (in `src/tools/ArXivSearchTool.ts`):

1. **Accepts Parameters**:
   - `query`: Search keywords
   - `max_results`: Number of papers (1-50)
   - `sort_by`: Sort order

2. **Calls arXiv API**:
   - Uses HTTP GET to query arXiv's public API
   - No authentication required

3. **Parses Results**:
   - Extracts title, authors, abstract, date, categories
   - Formats as markdown for LLM consumption

4. **Returns Data**:
   - Structured text with paper metadata
   - LLM analyzes and summarizes

### Agent Loop

The agent follows this loop:

```
1. User provides topic
2. Agent generates search query
3. Agent calls ArXiv tool
4. Tool returns paper data
5. Agent analyzes results
6. Agent generates summary
7. Output to user
```

## Extending the Assistant

### Add More Data Sources

You can add more academic databases:

```typescript
// PubMed for biomedical papers
export const PubMedSearchTool = createTool({
  name: "search_pubmed",
  description: "Search PubMed for biomedical papers",
  // ... implementation
});

// Google Scholar (requires scraping or API)
// IEEE Xplore
// ACM Digital Library
```

### Add Email Functionality

Create an email tool to send summaries:

```typescript
export const SendEmailTool = createTool({
  name: "send_email",
  description: "Send research summary via email",
  schema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  execute: async ({ to, subject, body }) => {
    // Use SMTP or email service API
    await sendEmail({ to, subject, body });
    return `Email sent to ${to}`;
  },
});
```

### Add Citation Management

Track and format citations:

```typescript
export const FormatCitationTool = createTool({
  name: "format_citation",
  description: "Format paper citations in various styles",
  schema: z.object({
    paper_id: z.string(),
    style: z.enum(["APA", "MLA", "Chicago", "IEEE"]),
  }),
  execute: async ({ paper_id, style }) => {
    // Generate citation
    return formattedCitation;
  },
});
```

## Testing

To test just the ArXiv search functionality without the full agent:

```typescript
// test_arxiv.ts
import { ArXivSearchTool } from "@zypher/tools/mod.ts";

const result = await ArXivSearchTool.execute(
  {
    query: "machine learning",
    max_results: 3,
    sort_by: "relevance",
  },
  { workingDirectory: Deno.cwd() }
);

console.log(result);
```

Run with:
```bash
deno run -A test_arxiv.ts
```

## Troubleshooting

### API Key Not Set
```
❌ Error: ANTHROPIC_API_KEY environment variable not set
```
**Solution**: Export the environment variable or add to `.env` file

### Network Errors
```
Error searching arXiv: fetch failed
```
**Solution**: Check internet connection and arXiv API status

### Rate Limiting
If you see rate limit errors, add delays between requests:
```typescript
await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
```

## Next Steps

1. **Add more data sources**: PubMed, Semantic Scholar, etc.
2. **Implement email reports**: Schedule weekly summaries
3. **Add filtering**: By journal, author, citation count
4. **Create web interface**: Serve results via HTTP
5. **Persistence**: Save search history and bookmarks
