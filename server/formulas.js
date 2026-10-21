// Deliberately bounded formula language. Never evaluates JavaScript.
export function calculate(
  cells,
  address,
  visiting = new Set(),
  budget = { remaining: 20000, memo: new Map() },
) {
  if (--budget.remaining < 0) return "#LIMIT!";
  if (visiting.has(address) || visiting.size > 100) return "#CYCLE!";
  if (budget.memo.has(address)) return budget.memo.get(address);
  const raw = String(cells[address] ?? "");
  if (!raw.startsWith("=")) return raw;
  const next = new Set(visiting).add(address);
  try {
    let expression = raw.slice(1).toUpperCase();
    if (expression.length > 1000) return "#LIMIT!";
    const numeric = (ref) => {
      parseAddress(ref);
      const result = calculate(cells, ref, next, budget);
      if (String(result).startsWith("#")) throw new Error(result);
      if (result === "" || result === undefined) return 0;
      const n = Number(result);
      if (!Number.isFinite(n)) throw new Error("#VALUE!");
      return n;
    };
    expression = expression.replace(
      /SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/g,
      (_, a, b) => {
        const start = parseAddress(a),
          end = parseAddress(b);
        if (
          (end.col - start.col + 1) * (end.row - start.row + 1) > 10000 ||
          end.col < start.col ||
          end.row < start.row
        )
          throw new Error("#RANGE!");
        let total = 0;
        for (let r = start.row; r <= end.row; r++)
          for (let c = start.col; c <= end.col; c++)
            total += numeric(columnName(c) + r);
        return String(total);
      },
    );
    expression = expression.replace(/\b[A-Z]+\d+\b/g, (ref) =>
      String(numeric(ref)),
    );
    const tokens =
      expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+*/-]/g) ?? [];
    if (tokens.join("") !== expression.replace(/\s/g, ""))
      return "#UNSUPPORTED!";
    let pos = 0;
    function atom() {
      if (tokens[pos] === "-") {
        pos++;
        return -atom();
      }
      if (tokens[pos] === "+") {
        pos++;
        return atom();
      }
      if (tokens[pos] === "(") {
        pos++;
        const value = add();
        if (tokens[pos++] !== ")") throw new Error("#ERROR!");
        return value;
      }
      const token = tokens[pos++];
      if (!token || !/^(\d|\.)/.test(token)) throw new Error("#ERROR!");
      return Number(token);
    }
    function multiply() {
      let n = atom();
      while (["*", "/"].includes(tokens[pos])) {
        const op = tokens[pos++],
          r = atom();
        if (op === "/" && r === 0) throw new Error("#DIV/0!");
        n = op === "*" ? n * r : n / r;
      }
      return n;
    }
    function add() {
      let n = multiply();
      while (["+", "-"].includes(tokens[pos])) {
        const op = tokens[pos++],
          r = multiply();
        n = op === "+" ? n + r : n - r;
      }
      return n;
    }
    const result = add();
    if (pos !== tokens.length || !Number.isFinite(result)) return "#ERROR!";
    budget.memo.set(address, result);
    return result;
  } catch (e) {
    return e.message?.startsWith("#") ? e.message : "#ERROR!";
  }
}
export function columnName(col) {
  let s = "";
  for (; col > 0; col = Math.floor((col - 1) / 26))
    s = String.fromCharCode(65 + ((col - 1) % 26)) + s;
  return s;
}
export function parseAddress(ref) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,5})$/.exec(ref);
  if (!match) throw new Error("#REF!");
  return {
    col: [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    row: Number(match[2]),
  };
}
