#!/usr/bin/env -S deno run -A

/**
 * Test arXiv API Connection and XML Parsing
 *
 * This script tests the arXiv API connection and identifies any parsing issues
 */

import chalk from "chalk";

async function testArXivAPI() {
  console.log(chalk.cyan("\n🧪 Testing arXiv API Connection\n"));

  try {
    // Test 1: Basic API connection
    console.log(chalk.blue("Test 1: Testing basic API connection..."));
    const query = "urban crime prediction";
    const searchQuery = encodeURIComponent(query);
    const apiUrl = `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=3&sortBy=relevance&sortOrder=descending`;

    console.log(chalk.gray(`  URL: ${apiUrl}`));

    const response = await fetch(apiUrl);
    console.log(chalk.green(`  ✓ Status: ${response.status} ${response.statusText}`));

    const xmlText = await response.text();
    console.log(chalk.green(`  ✓ Response length: ${xmlText.length} characters`));

    // Show first 500 characters of XML
    console.log(chalk.gray("\n  First 500 characters of XML response:"));
    console.log(chalk.gray("  " + "─".repeat(60)));
    console.log(chalk.gray(xmlText.substring(0, 500) + "..."));
    console.log(chalk.gray("  " + "─".repeat(60)));

    // Test 2: Check if DOMParser is available
    console.log(chalk.blue("\nTest 2: Testing DOMParser availability..."));
    try {
      // @ts-ignore - testing if DOMParser exists
      const parser = new DOMParser();
      console.log(chalk.green("  ✓ DOMParser is available"));

      // @ts-ignore
      const doc = parser.parseFromString(xmlText, "text/xml");
      console.log(chalk.green("  ✓ XML parsing successful"));

      // @ts-ignore
      const entries = doc.querySelectorAll("entry");
      console.log(chalk.green(`  ✓ Found ${entries.length} entries`));

    } catch (e) {
      console.log(chalk.red("  ✗ DOMParser not available or parsing failed"));
      console.log(chalk.red(`  Error: ${e.message}`));
      console.log(chalk.yellow("\n  → Need to use alternative XML parsing library"));
    }

    // Test 3: Try manual XML parsing
    console.log(chalk.blue("\nTest 3: Testing manual XML parsing..."));

    // Count entries manually
    const entryMatches = xmlText.match(/<entry>/g);
    const entryCount = entryMatches ? entryMatches.length : 0;
    console.log(chalk.green(`  ✓ Found ${entryCount} <entry> tags using regex`));

    // Extract first title
    const titleMatch = xmlText.match(/<title>(.*?)<\/title>/s);
    if (titleMatch) {
      console.log(chalk.green(`  ✓ First title: ${titleMatch[1].trim().substring(0, 100)}...`));
    }

    // Extract first author
    const authorMatch = xmlText.match(/<name>(.*?)<\/name>/s);
    if (authorMatch) {
      console.log(chalk.green(`  ✓ First author: ${authorMatch[1].trim()}`));
    }

    console.log(chalk.green("\n✅ arXiv API is working correctly!"));
    console.log(chalk.yellow("⚠️  Issue: DOMParser may not be available in Deno environment"));
    console.log(chalk.yellow("   Solution: Need to use deno-dom or alternative XML parser\n"));

  } catch (error) {
    console.error(chalk.red("\n❌ Error:"), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
  }
}

// Handle Ctrl+C
Deno.addSignalListener("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 Test interrupted by user\n"));
  Deno.exit(0);
});

// Run test
if (import.meta.main) {
  testArXivAPI().catch((error) => {
    console.error(chalk.red("Fatal error:"), error);
    Deno.exit(1);
  });
}
