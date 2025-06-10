# Zypher Agent GAIA Benchmark

This directory contains benchmarking tools for evaluating ZypherAgent performance on the GAIA (General AI Assistant) dataset.

## Overview

The benchmarking system consists of two main components:
- **`bench.ts`**: Runs ZypherAgent on GAIA tasks and collects results
- **`grade.py`**: Grades the agent's answers against ground truth and generates reports

## Directory Structure

```
bench/
├── GAIA/                # GAIA dataset files
├── bench.ts             # Main benchmarking script
├── grade.py             # Grading and evaluation script
├── output/              # Raw benchmark results (JSON)
├── workspace/           # Task workspaces for agent execution
└── README.md            # This file
```

## Setup

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Required
ANTHROPIC_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here

BENCHMARK_DATASET=/path/to/GAIA/dataset
BENCHMARK_MODE=validation # or "test"
BENCHMARK_METADATA=metadata # Metadata file name
BENCHMARK_WORKSPACE=/path/to/bench/workspace
BENCHMARK_MODEL=claude-3-5-sonnet-20241022
BENCHMARK_OUTPUT=/path/to/bench/output

# Optional
BENCHMARK_LEVEL=1 # Filter by difficulty level (1, 2, or 3)
```

### GAIA Dataset

Download the GAIA dataset and extract it to your desired location. The dataset should have the following structure:

```
GAIA/
└── 2023/
    ├── test/
    │   ├── metadata.jsonl
    │   └── [task files]
    └── validation/
        ├── metadata.jsonl
        └── [task files]
```

## Usage

### Running Benchmarks

Execute the benchmark script:

```bash
deno run -A bench/bench.ts
```

The script will:
1. Load tasks from the GAIA dataset based on your configuration
2. Create individual workspaces for each task
3. Run ZypherAgent on each task with the configured tools
4. Save results to the output directory
5. Generate answer.txt files in each workspace

### Grading Results

After running benchmarks, grade the results:

```bash
python bench/grade.py
```

This will:
1. Collect answers from workspace directories
2. Compare them with ground truth from metadata
3. Generate `answer_comparison.csv` with detailed results
4. Print statistics by difficulty level

## Output Files

### Benchmark Results (`output/`)
- Individual JSON files per task containing:
  - Task metadata
  - Agent's response
  - Success/failure status
  - Execution time and message count
  - Error details (if any)

### Answer Files (`workspace/*/answer.txt`)
- Final answers in the format: `FINAL ANSWER: [answer]`
- Used by the grading script for evaluation

### Grading Report (`answer_comparison.csv`)
- Columns: `task_id`, `level`, `expected_answer`, `actual_answer`, `match`
- Shows detailed comparison results for each task

## Evaluation Metrics

The grading system handles different answer types:

### Numbers
- Removes common units ($, %, commas)
- Compares as float values
- Example: "1,000" matches "1000"

### Lists (comma/semicolon separated)
- Splits on delimiters and compares each element
- Elements can be numbers or strings
- Length must match exactly

### Strings
- Normalizes by removing whitespace and punctuation
- Case-insensitive comparison
- Example: "New York" matches "newyork"
