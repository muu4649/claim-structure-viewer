const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const fixture = fs.readFileSync(
  path.join(__dirname, "fixtures", "jp7362171_claims.txt"),
  "utf8",
);

function runInApp(expression, extra = {}) {
  const sandbox = {
    console,
    document: { addEventListener() {} },
    navigator: {},
    window: { setTimeout() {} },
    URL,
    Blob,
    ...extra,
  };
  vm.runInNewContext(`${source}\n;globalThis.__result = (${expression});`, sandbox);
  return JSON.parse(JSON.stringify(sandbox.__result));
}

test("PDF由来の全角見出しを8請求項に分割する", () => {
  const result = runInApp(
    `(() => {
      const claims = parseClaims(globalThis.__fixture);
      return [...claims.values()].map(({ number, text }) => ({ number, text }));
    })()`,
    { __fixture: fixture },
  );

  assert.equal(result.length, 8);
  assert.deepEqual(result.map((claim) => claim.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(result[0].text, /指紋認証操作/);
  assert.match(result[7].text, /製造方法/);
});

test("実公報の従属関係と方法クレーム参照を判定する", () => {
  const result = runInApp(
    `(() => {
      state.claims = parseClaims(globalThis.__fixture);
      enrichClaims();
      return [...state.claims.values()].map((claim) => ({
        number: claim.number,
        parents: claim.parents,
        targetClaims: claim.targetClaims,
        type: claim.type,
        independent: claim.independent,
        depth: claim.depth,
      }));
    })()`,
    { __fixture: fixture },
  );

  assert.deepEqual(result[1].parents, [1]);
  assert.deepEqual(result[4].parents, [4]);
  assert.equal(result[4].depth, 2);
  assert.equal(result[7].type, "method");
  assert.equal(result[7].independent, true);
  assert.deepEqual(result[7].parents, []);
  assert.deepEqual(result[7].targetClaims, [1, 2, 3, 4, 5, 6, 7]);
});

test("角括弧なし見出しと本文中の請求項参照を区別する", () => {
  const input =
    "請求項1\n制御装置。\n請求項2\n前記制御装置を備える、請求項1に記載のシステム。";
  const result = runInApp(
    `(() => {
      const claims = parseClaims(globalThis.__fixture);
      return [...claims.values()].map((claim) => ({
        number: claim.number,
        parents: claim.parents,
      }));
    })()`,
    { __fixture: input },
  );

  assert.deepEqual(result, [
    { number: 1, parents: [] },
    { number: 2, parents: [1] },
  ]);
});

test("ClaimGraph DSLに請求項5と請求項8の関係を保存する", () => {
  const result = runInApp(
    `(() => {
      state.claims = parseClaims(globalThis.__fixture);
      enrichClaims();
      els.patentNumber = { value: "JP7362171B1" };
      els.inventionTitle = { value: "指紋認証用シート状貼付体" };
      return generateDsl();
    })()`,
    { __fixture: fixture },
  );

  assert.match(result, /claim 5 depends_on 4/);
  assert.match(result, /claim 8 independent method/);
  assert.match(result, /target_product: any_of \[1\.\.7\]/);
});

test("製品クレーム参照から始まる簡略方法文型も独立方法として扱う", () => {
  const input = `【請求項1】
シート状貼付体。
【請求項2】
請求項1に記載のシート状貼付体を製造する方法。`;
  const result = runInApp(
    `(() => {
      const claim = parseClaims(globalThis.__fixture).get(2);
      return {
        parents: claim.parents,
        targetClaims: claim.targetClaims,
        independent: claim.independent,
        type: claim.type,
      };
    })()`,
    { __fixture: input },
  );

  assert.deepEqual(result, {
    parents: [],
    targetClaims: [1],
    independent: true,
    type: "method",
  });
});

test("PDF原文を述語と列挙の境界で安定して分割する", () => {
  const result = runInApp(
    `(() => {
      const claims = parseClaims(globalThis.__fixture);
      return [...claims.values()].map((claim) => ({
        number: claim.number,
        count: claim.requirements.length,
        requirements: claim.requirements.map((item) => item.text),
      }));
    })()`,
    { __fixture: fixture },
  );

  assert.deepEqual(
    result.map((claim) => claim.count),
    [11, 1, 2, 2, 1, 1, 4, 2],
  );
  assert.match(result[0].requirements[0], /貼付体であって$/);
  assert.match(result[0].requirements[2], /保護部と$/);
  assert.match(result[0].requirements[3], /非保護領域と$/);
  assert.match(result[4].requirements[0], /１／６以上１／３以下/);
  assert.match(result[7].requirements[0], /製造方法であって$/);
});

test("請求対象と列挙要素を分け、原文の接続表現を保持する", () => {
  const result = runInApp(
    `segmentRequirements("検査装置であって、センサと、演算部と、表示部とを備える、検査装置。")`,
  );

  assert.equal(result[0].reason, "category");
  assert.equal(result[0].text, "検査装置であって");
  assert.equal(result[1].text, "センサと");
  assert.equal(result[2].text, "演算部と");
  assert.match(result[3].text, /^表示部とを備える/);
});

test("構成を請求対象・要素・属性・関係・工程・機能効果へ分類する", () => {
  const result = runInApp(
    `[
      classifyRequirementRole("検査装置であって", "category", "product"),
      classifyRequirementRole("センサを備え", "predicate", "product"),
      classifyRequirementRole("長さが10mm以上である", "sentence", "product"),
      classifyRequirementRole("センサに接続される演算部", "predicate", "product"),
      classifyRequirementRole("画像を取得する工程", "sentence", "method"),
      classifyRequirementRole("これにより判定を可能とする", "sentence", "product"),
    ]`,
  );

  assert.deepEqual(result, [
    "category",
    "element",
    "attribute",
    "relation",
    "step",
    "function",
  ]);
});

test("OR表現は列挙境界として分割しない", () => {
  const result = runInApp(
    `splitRequirements("前記離脱部は、粘着力が弱いか、又は粘着剤層を有しないように構成される、もの。")`,
  );

  assert.equal(result.length, 1);
  assert.match(result[0], /又は/);
});

test("人手修正結果を8請求項分の学習JSONLへ変換する", () => {
  const result = runInApp(
    `(() => {
      state.claims = parseClaims(globalThis.__fixture);
      els.patentNumber = { value: "JP7362171B1" };
      return buildTrainingJsonl()
        .trim()
        .split("\\n")
        .map((line) => JSON.parse(line));
    })()`,
    { __fixture: fixture },
  );

  assert.equal(result.length, 8);
  assert.equal(result[0].schema, "claim-boundary-v1");
  assert.equal(result[0].requirements.length, 11);
  assert.equal(result[0].roles.length, 11);
  assert.equal(result[0].roles[0], "category");
  assert.equal(result[7].requirements.length, 2);
});
