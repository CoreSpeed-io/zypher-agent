## refactor: reorganize packages to Deno naming convention

Reorganizes `packages/agent`, `packages/acp`, `packages/agui`, and `packages/cli`
to follow Deno naming conventions, aligning with `packages/skills` and `packages/http`.

### Changes

- Remove `src/` directory - files now at package root
- Rename files to snake_case (e.g., `ZypherAgent.ts` → `zypher_agent.ts`)
- Rename directories to snake_case (`loopInterceptors` → `loop_interceptors`)
- Co-locate tests with source files
- Update imports and `deno.json` exports

### Packages Updated

- **agent**: Main SDK package with most changes
- **acp**: Renamed `ZypherAcpAgent.ts` → `zypher_acp_agent.ts`
- **agui**: Moved files from `src/` to root
- **cli**: Renamed `CliOAuthCallbackHandler.ts`, `runAgentInTerminal.ts` to snake_case

### Verification

- `deno task checkall` passes (format, lint, type check)
- All unit tests pass
