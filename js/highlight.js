/* Lightweight, per-line syntax highlighter.
   Returns HTML-escaped markup with <span class="tok-*"> wrappers.
   Good enough to look convincing while text is typed out live.        */
(function () {
  const KEYWORDS = {
    common: ["const", "let", "var", "function", "class", "extends", "new", "this",
      "import", "from", "export", "default", "async", "await", "void", "typeof",
      "instanceof", "in", "of", "static", "super", "yield", "delete"],
    control: ["return", "if", "else", "for", "while", "do", "switch", "case",
      "break", "continue", "throw", "try", "catch", "finally"],
    type: ["string", "number", "boolean", "any", "unknown", "never", "type",
      "interface", "enum", "namespace", "readonly", "public", "private", "protected"],
    boolean: ["true", "false", "null", "undefined", "NaN", "Infinity"],
  };

  const PY_KEYWORDS = {
    common: ["import", "from", "as", "def", "class", "lambda", "with", "global",
      "nonlocal", "yield", "async", "await", "pass", "del", "assert"],
    control: ["return", "if", "elif", "else", "for", "while", "break", "continue",
      "raise", "try", "except", "finally", "and", "or", "not", "in", "is"],
    boolean: ["True", "False", "None", "self", "cls"],
    type: ["int", "str", "float", "bool", "list", "dict", "set", "tuple", "bytes"],
  };

  const GO_KEYWORDS = {
    common: ["package", "import", "func", "var", "const", "type", "struct",
      "interface", "map", "chan", "go", "defer", "make", "new"],
    control: ["return", "if", "else", "for", "range", "switch", "case", "default",
      "break", "continue", "select", "fallthrough", "goto"],
    boolean: ["true", "false", "nil", "iota"],
    type: ["string", "int", "int64", "float64", "bool", "byte", "rune", "error",
      "uint", "uint64", "any"],
  };

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function makeKeywordMap(sets) {
    const map = new Map();
    for (const [cls, words] of Object.entries(sets)) {
      for (const w of words) map.set(w, cls);
    }
    return map;
  }

  const KW_JS = makeKeywordMap(KEYWORDS);
  const KW_PY = makeKeywordMap(PY_KEYWORDS);
  const KW_GO = makeKeywordMap(GO_KEYWORDS);

  function kwClass(word, kwMap) {
    const c = kwMap.get(word);
    if (!c) return null;
    if (c === "control") return "tok-control";
    if (c === "boolean") return "tok-boolean";
    if (c === "type") return "tok-keyword";
    return "tok-keyword";
  }

  // Highlight ONE physical line. `state` carries multi-line context
  // (e.g. inside a block comment). Returns { html, state }.
  function highlightLine(line, lang, state) {
    state = state || {};
    let kwMap = KW_JS;
    let lineComment = "//";
    if (lang === "python") { kwMap = KW_PY; lineComment = "#"; }
    else if (lang === "go") { kwMap = KW_GO; lineComment = "//"; }

    let out = "";
    let i = 0;
    const n = line.length;

    // continue a block comment from previous line (JS/TS/Go)
    if (state.inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) {
        return { html: `<span class="tok-comment">${esc(line)}</span>`, state };
      }
      out += `<span class="tok-comment">${esc(line.slice(0, end + 2))}</span>`;
      i = end + 2;
      state = { ...state, inBlockComment: false };
    }

    while (i < n) {
      const ch = line[i];
      const rest = line.slice(i);

      // line comment
      if (rest.startsWith(lineComment)) {
        out += `<span class="tok-comment">${esc(rest)}</span>`;
        break;
      }
      // block comment start (JS/TS/Go)
      if (lang !== "python" && rest.startsWith("/*")) {
        const end = line.indexOf("*/", i + 2);
        if (end === -1) {
          out += `<span class="tok-comment">${esc(rest)}</span>`;
          state = { ...state, inBlockComment: true };
          break;
        }
        out += `<span class="tok-comment">${esc(line.slice(i, end + 2))}</span>`;
        i = end + 2;
        continue;
      }
      // strings
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < n) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === ch) { j++; break; }
          j++;
        }
        out += `<span class="tok-string">${esc(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      // decorators / annotations
      if (ch === "@" && /[A-Za-z_]/.test(line[i + 1] || "")) {
        let j = i + 1;
        while (j < n && /[\w.]/.test(line[j])) j++;
        out += `<span class="tok-decorator">${esc(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      // numbers
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(line[i + 1] || ""))) {
        let j = i;
        while (j < n && /[0-9a-fA-FxXob._]/.test(line[j])) j++;
        out += `<span class="tok-number">${esc(line.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      // identifiers / keywords / functions / types
      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < n && /[\w$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        const cls = kwClass(word, kwMap);
        let after = line.slice(j);
        if (cls) {
          out += `<span class="${cls}">${esc(word)}</span>`;
        } else if (/^\s*\(/.test(after)) {
          out += `<span class="tok-function">${esc(word)}</span>`;
        } else if (/^[A-Z]/.test(word)) {
          out += `<span class="tok-type">${esc(word)}</span>`;
        } else {
          out += `<span class="tok-var">${esc(word)}</span>`;
        }
        i = j;
        continue;
      }
      // operators / punctuation
      if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
        out += `<span class="tok-operator">${esc(ch)}</span>`;
        i++;
        continue;
      }
      // everything else
      out += esc(ch);
      i++;
    }

    return { html: out, state };
  }

  window.Highlighter = { highlightLine };
})();
