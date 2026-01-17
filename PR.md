# feat(utils): add @zypher/utils package

## Summary

- Add new `@zypher/utils` package with shared utilities that have no
  dependencies on other zypher packages
- Migrate `AbortError` from custom class to standard `DOMException` via
  `createAbortError()`
- Remove redundant `generateFileId` wrapper (now uses `crypto.randomUUID()`
  directly)
- Rename `data.ts` to `message_history.ts` for clarity

## New Package Exports

```ts
import { Completer } from "@zypher/utils/async";
import { runCommand } from "@zypher/utils/command";
import { getRequiredEnv, parsePort } from "@zypher/utils/env";
import {
  createAbortError,
  formatError,
  isAbortError,
} from "@zypher/utils/error";
```
