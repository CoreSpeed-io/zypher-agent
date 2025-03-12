/**
 * 
 * # [Gitignore](https://git-scm.com/docs/gitignore#_pattern_format) Parser

A simple yet _complete_ [`.gitignore`](https://git-scm.com/docs/gitignore#_pattern_format) parser for node.js.

## Features

Supports all features listed in the [GIT SCM gitignore manpage](https://git-scm.com/docs/gitignore):

- handles the `**` _wildcard_ anywhere
  - in both the usual usage, e.g. `foo/** /bar`, _and_ also in complexes such as `yo/**la/bin`
  - can be used multiple times in a single pattern, e.g. `foo/** /rec**on`
  - handles the `*` _wildcard_
  - handles the `?` _wildcard_
  - handles `[a-z]` style _character ranges_
  - understands `!`-prefixed _negated patterns_
  - understands `\#`, `\[`, `\\`, etc. filename _escapes_, thus handles patterns like `\#*#` correctly (_hint: this is NOT a comment line!_)
  - deals with any _sequence_ of positive and negative patterns, like this one from the `.gitignore` manpage:
  
    ```
    # exclude everything except directory foo/bar
    /*
    !/foo
    /foo/*
    !/foo/bar
    ```
  
  - handles any empty lines and _`#` comment lines_ you feed it
  
  - we're filename agnostic: the _"`.gitignore` file"_ does not have to be named `.gitignore` but can be named anything: this parser accepts `.gitignore`-formatted content from anywhere: _you_ load the file, _we_ do the parsing, _you_ feed our `accepts()` or `denies()` APIs any filenames / paths you want filtered and we'll tell you if it's a go or a _no go_.
  
  - extra: an additional API is available for those of you who wish to have the _complete and utter `.gitignore` experience_: use our `inspects(path)` API to know whether the given gitignore filter set did actively filter the given file or did simple allow it to pass through.
  
    **\*Read as**: if the `.gitignore` has a pattern which matches the given file/path, then we will return `true`, otherwise we return `false`.\*
  
    Use this in directory trees where you have multiple `.gitignore` files in nested directories and are implementing tooling with `git`-like `.gitignore` behaviour.
  
  ## Usage
  
  ```js
  var parser = require("@cfa/gitignore-parser"),
    fs = require("fs");
  
  var gitignore = parser.compile(fs.readFileSync(".gitignore", "utf8"));
  
  gitignore.accepts("LICENSE.md") === true;
  gitignore.denies("LICENSE.md") === false;
  gitignore.inspects("LICENSE.md") === false;
  
  gitignore.accepts("node_modules/mocha/bin") === false;
  gitignore.denies("node_modules/mocha/bin") === true;
  gitignore.inspects("node_modules/mocha/bin") === true;
  
  gitignore.accepts("foo/bar") === true;
  gitignore.denies("foo/bar") === false;
  gitignore.inspects("foo/bar") === true; // <-- as there's a negated pattern `!foo/bar` addressing this one
  
  var files = [
    ".gitignore",
    ".travis.yml",
    "LICENSE.md",
    "README.md",
    "package.json",
    "lib/index.js",
    "test/index.js",
    "test/mocha.opts",
    "node_modules/mocha/bin/mocha",
    "node_modules/mocha/README.md",
  ];
  
  // produce only files that are not gitignored
  let list = files.filter(gitignore.accepts);
  
  // produce only files that *are* gitignored
  let list = files.filter(gitignore.denies);
  ```
  
  ### Notes
  
  - As the `.gitignore` spec differentiates between _patterns_ such as `foo` and `foo/`, where the latter only matches any **directory** named `foo`, you MUST pass the is-this-a-file-or-a-directory info to us when you invoke any of our `accepts()`, `denies()` and `inspects()` APIs by making sure directory paths have a trailing `/`.
  
    When you feed us straight from [`glob()`](https://www.npmjs.com/package/glob), you can accomplish this in the quickest possible way by using the `glob()` [**`mark`** option](https://www.npmjs.com/package/glob#user-content-options) which auto-postfixes a `/` to each directory it produces.
  
  ## See also
  
  TBD
  
  https://github.com/isaacs/node-glob
  
  ## License
  
  Apache 2, see [LICENSE.md](./LICENSE.md).

 * this is a test
 * @module
 */

// mod.ts

// Force to false and smart code compressors can remove the resulting 'dead code':
const DEBUG = true;

export interface Checker {
  diagnose: (query: any) => void;
  accepts: (input: string, expected?: boolean) => boolean;
  denies: (input: string, expected?: boolean) => boolean;
  inspects: (input: string, expected?: boolean) => boolean;
}

/**
 * Compile the given `.gitignore` content (not filename!)
 * and return an object with `accepts`, `denies` and `inspects` methods.
 * These methods each accepts a single filename or path and determines whether
 * they are acceptable or unacceptable according to the `.gitignore` definition.
 *
 * @param  {string} content The `.gitignore` content to compile.
 * @return {Object}         The helper object with methods that operate on the compiled content.
 */
function compile(content: string): Checker {
  const parsed = parse(content);
  const positives = parsed[0];
  const negatives = parsed[1];

  return {
    diagnose: function (query: any) {
      if (DEBUG) {
        console.log(`${query.query}:`, query);
      }
    },
    accepts: function (input: string, expected?: boolean) {
      if (input[0] === "/") input = input.slice(1);
      input = "/" + input;

      const acceptRe = negatives[0];
      const acceptTest = acceptRe.test(input);
      const denyRe = positives[0];
      const denyTest = denyRe.test(input);
      let returnVal = acceptTest || !denyTest;

      let acceptMatch: RegExpExecArray | null = null;
      let denyMatch: RegExpExecArray | null = null;
      if (acceptTest && denyTest) {
        for (const re of negatives[1]) {
          const m = re.exec(input);
          if (m) {
            if (!acceptMatch || acceptMatch[0].length < m[0].length) {
              acceptMatch = m;
            }
          }
        }
        for (const re of positives[1]) {
          const m = re.exec(input);
          if (m) {
            if (!denyMatch || denyMatch[0].length < m[0].length) {
              denyMatch = m;
            }
          }
        }

        if (acceptMatch && denyMatch) {
          returnVal = acceptMatch[0].length >= denyMatch[0].length;
        }
      }

      if (expected != null && expected !== returnVal) {
        this.diagnose({
          query: "accepts",
          input,
          expected,
          acceptRe,
          acceptTest,
          acceptMatch,
          denyRe,
          denyTest,
          denyMatch,
          combine: "(Accept || !Deny)",
          returnVal,
        });
      }
      return returnVal;
    },
    denies: function (input: string, expected?: boolean) {
      if (input[0] === "/") input = input.slice(1);
      input = "/" + input;

      const acceptRe = negatives[0];
      const acceptTest = acceptRe.test(input);
      const denyRe = positives[0];
      const denyTest = denyRe.test(input);
      let returnVal = !acceptTest && denyTest;

      let acceptMatch: RegExpExecArray | null = null;
      let denyMatch: RegExpExecArray | null = null;
      if (acceptTest && denyTest) {
        for (const re of negatives[1]) {
          const m = re.exec(input);
          if (m) {
            if (!acceptMatch || acceptMatch[0].length < m[0].length) {
              acceptMatch = m;
            }
          }
        }
        for (const re of positives[1]) {
          const m = re.exec(input);
          if (m) {
            if (!denyMatch || denyMatch[0].length < m[0].length) {
              denyMatch = m;
            }
          }
        }

        if (acceptMatch && denyMatch) {
          returnVal = acceptMatch[0].length < denyMatch[0].length;
        }
      }

      if (expected != null && expected !== returnVal) {
        this.diagnose({
          query: "denies",
          input,
          expected,
          acceptRe,
          acceptTest,
          acceptMatch,
          denyRe,
          denyTest,
          denyMatch,
          combine: "(!Accept && Deny)",
          returnVal,
        });
      }
      return returnVal;
    },
    inspects: function (input: string, expected?: boolean) {
      if (input[0] === "/") input = input.slice(1);
      input = "/" + input;

      const acceptRe = negatives[0];
      const acceptTest = acceptRe.test(input);
      const denyRe = positives[0];
      const denyTest = denyRe.test(input);
      const returnVal = acceptTest || denyTest;

      if (expected != null && expected !== returnVal) {
        this.diagnose({
          query: "inspects",
          input,
          expected,
          acceptRe,
          acceptTest,
          denyRe,
          denyTest,
          combine: "(Accept || Deny)",
          returnVal,
        });
      }
      return returnVal;
    },
  };
}

/**
 * Parse the given `.gitignore` content and return an array
 * containing positives and negatives.
 * Each of these in turn contains a regexp which will be
 * applied to the 'rooted' paths to test for *deny* or *accept*
 * respectively.
 *
 * @param  {string} content  The content to parse,
 * @return {[RegExp, RegExp[]][]]}         The parsed positive and negatives definitions.
 */
function parse(content: string): [RegExp, RegExp[]][] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line[0] !== "#")
    .reduce(
      (lists: [string[], string[]], line) => {
        const isNegative = line[0] === "!";
        if (isNegative) {
          line = line.slice(1);
        }
        if (isNegative) {
          lists[1].push(line);
        } else {
          lists[0].push(line);
        }
        return lists;
      },
      [[], []],
    )
    .map((list) => {
      list = list.sort().map(prepareRegexPattern);

      if (list.length > 0) {
        return [
          new RegExp("(?:" + list.join(")|(?:") + ")"),
          list.map((re) => new RegExp(re)),
        ];
      }
      return [new RegExp("$^"), []];
    });
}

function prepareRegexPattern(pattern: string): string {
  let input = pattern;
  let re = "";
  let rooted = false;
  let directory = false;
  if (pattern[0] === "/") {
    rooted = true;
    pattern = pattern.slice(1);
  }
  if (pattern[pattern.length - 1] === "/") {
    directory = true;
    pattern = pattern.slice(0, pattern.length - 1);
  }
  const rangeRe = /^((?:[^\[\\]|(?:\\.))*)\[((?:[^\]\\]|(?:\\.))*)\]/;
  let match: RegExpExecArray | null;

  while ((match = rangeRe.exec(pattern)) !== null) {
    if (match[1].includes("/")) {
      //split("").filter((x) => x === "/").length
      rooted = true;
    }
    re += transpileRegexPart(match[1]);
    re += "[" + match[2] + "]";

    pattern = pattern.slice(match[0].length);
  }
  if (pattern) {
    if (pattern.includes("/")) {
      rooted = true;
    }
    re += transpileRegexPart(pattern);
  }

  if (rooted) {
    re = "^\\/" + re;
  } else {
    re = "\\/" + re;
  }
  if (directory) {
    re += "\\/";
  } else {
    re += "(?:$|\\/)";
  }

  if (DEBUG) {
    try {
      new RegExp("(?:" + re + ")");
    } catch (ex) {
      console.log("failed regex:", { input, re, ex });
    }
  }
  return re;

  function transpileRegexPart(re: string): string {
    return re
      .replace(/\\(.)/g, "$1")
      .replace(/[\-\[\]\{\}\(\)\+\.\\\^\$\|]/g, "\\$&")
      .replace(/\?/g, "[^/]")
      .replace(/\/\*\*\//g, "(?:/|(?:/.+/))")
      .replace(/^\*\*\//g, "(?:|(?:.+/))")
      .replace(/\/\*\*$/g, () => {
        directory = true;
        return "(?:|(?:/.+))";
      })
      .replace(/\*\*/g, ".*")
      .replace(/\/\*(\/|$)/g, "/[^/]+$1")
      .replace(/\*/g, "[^/]*")
      .replace(/\//g, "\\/");
  }
}


export const GitignoreParser = {
  compile
}