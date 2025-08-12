import { build, emptyDir } from "@deno/dnt";

await emptyDir("./npm");

await build({
  entryPoints: ["./src/mod.ts", "./src/tools/mod.ts"],
  outDir: "./npm",
  shims: {
    // see JS docs for overview and more options
    deno: false,
  },
  // Disable type checking during the DNT transform because many dependencies rely on
  // DOM and Deno specific lib types that are not included in Node’s default lib set.
  // We rely on our regular CI type-checking in Deno to catch issues and just want the
  // JavaScript output for npm here.
  typeCheck: false,
  // Skip running the generated tests in the Node environment – they currently rely on
  // Deno runtime APIs that are unavailable in Node. We keep our Deno-side tests to
  // cover functionality instead.
  test: false,
  // Add liberal lib definitions so that any ambient DOM/ESNext features used by
  // dependencies don’t error out when the npm package consumers run their own TS
  // type checking.
  compilerOptions: {
    lib: ["ESNext", "DOM"],
    // Don’t revisit every dependency’s .d.ts files – speeds up emit and avoids
    // third-party type mismatches (eg. vitest test files inside zod’s source).
    skipLibCheck: true,
  },
  package: {
    // package.json properties
    name: "@corespeed/zypher",
    version: Deno.args[0],
    description: "Agentic AI framework",
    license: "UNLICENSED",
    repository: {
      type: "git",
      url: "git+https://github.com/CoreSpeed-io/zypher-agent.git",
    },
    bugs: {
      url: "https://github.com/CoreSpeed-io/zypher-agent/issues",
    },
    // We want to publish to the CoreSpeed org’s private npm scope,
    // this keeps it restricted by default; npm will refuse to publish publicly
    // unless you override on the CLI.
    publishConfig: {
      access: "restricted",
    },
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
