# Zypher Agent Tests

This directory contains tests for the Zypher Agent project.

## Unit Tests

Unit tests are located in the `unit` directory and test individual components of
the application.

### Running Tests

To run all tests:

```bash
deno task test
```

To run a specific test:

```bash
deno test -A test/unit/taskCancellation.test.ts
```

To run tests with leak detection:

```bash
deno test -A --trace-leaks test/unit/
```

## Task Cancellation Tests

The task cancellation feature is tested with the following test files:

1. `taskCancellation.test.ts` - Tests the core cancellation functionality in
   ZypherAgent
   - Tests initialization with taskRunning false
   - Tests cancellation of a running task
   - Tests timeout-based cancellation
   - Tests return values when cancelling with no running task

2. `apiCancellation.test.ts` - Tests the API endpoints for task cancellation
   - Tests 404 response when no task is running
   - Tests successful cancellation response
   - Tests proper resource cleanup with AbortController

3. `streamCancellation.test.ts` - Tests cancellation of streaming connections
   - Tests cancellation handling in TestAgent
   - Tests WebSocket closure causing task cancellation
   - Tests SSE connection abort causing task cancellation
   - Tests timeout-based cancellation notifications

## Test Structure

The tests use the following pattern:

1. Implement test-specific mock classes for dependencies
2. Set up the test environment with proper resource management
3. Execute the operation being tested in an isolated environment
4. Verify the expected behavior using assertions
5. Clean up resources in a try/finally pattern to prevent leaks

## Test Environment

The tests are designed to run in isolation without requiring external
dependencies or API keys. All external dependencies are mocked to ensure
consistent and deterministic test results.

Tests use Deno's native testing framework with the following features:

- Built-in assertions from std/assert
- Spy and mock utilities from std/testing/mock
- Resource tracking to detect and prevent leaks
- Proper lifecycle management with AbortController for cancellable operations

## Adding New Tests

When adding new features to the project, please add corresponding tests
following these guidelines:

1. Create a new test file in the appropriate directory
2. Use Deno's native test runner with the `Deno.test()` function
3. Mock any dependencies to ensure isolated testing
4. Test both success and failure scenarios
5. Ensure tests are deterministic and repeatable
6. Use clear naming for test cases to document behavior
7. Manage resources properly to avoid leaks
8. Structure tests with try/finally blocks for proper cleanup
