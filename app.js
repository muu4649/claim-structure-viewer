"use strict";

const DEMO_CLAIMS = `【請求項1】
爪及び腹の周囲を囲う保護部と、指紋の少なくとも一部を露出させることが可能な非保護領域と、前記非保護領域を覆い且つ前記保護部に隣接しており前記保護部と一体化した離脱部と、前記保護部に少なくとも設けられた粘着剤層とを有するシート状の本体部を備え、前記離脱部は、前記本体部から離脱可能であり、前記離脱部が前記本体部から離脱された後に、前記非保護領域の少なくとも一部が露出して指紋認証操作が可能になる、シート状貼付体。

【請求項2】
前記離脱部が、ミシン目によって区画されることで前記保護部から離脱可能になる、請求項1に記載のシート状貼付体。

【請求項3】
前記離脱部が複数設けられ、所望する分だけ前記本体部から離脱可能であり、前記非保護領域の大きさを調整可能である、請求項1に記載のシート状貼付体。

【請求項4】
前記保護部と前記非保護領域との間に、長手方向に延びる一対の境界線が形成される、請求項1に記載のシート状貼付体。

【請求項5】
前記一対の境界線の位置が、手指幅の1/6以上1/3以下の範囲にある、請求項4に記載のシート状貼付体。

【請求項6】
前記非保護領域の面積A1と、前記本体部を囲む最小の長方形の面積A2との比A1/A2が、0.05以上0.30以下である、請求項1に記載のシート状貼付体。

【請求項7】
中央に長手方向へ延びる長さ35mm以上50mm以下の基部と、前記基部の両側へ延びる2以上の羽部とを備え、前記羽部の間に前記非保護領域が形成される、請求項1に記載のシート状貼付体。

【請求項8】
請求項1から7のいずれか一項に記載のシート状貼付体を製造する方法。`;

const CATEGORY_META = {
  structure: { label: "構造", code: "S" },
  function: { label: "機能", code: "F" },
  dynamic: { label: "動態", code: "D" },
  condition: { label: "条件", code: "C" },
};

const ROLE_META = {
  category: { label: "請求対象", code: "CAT" },
  element: { label: "要素", code: "E" },
  attribute: { label: "属性", code: "A" },
  relation: { label: "関係", code: "R" },
  step: { label: "工程", code: "P" },
  function: { label: "機能・効果", code: "F" },
};

const state = {
  claims: new Map(),
  selectedClaim: 1,
  currentView: "detail",
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  [
    "patentNumber", "inventionTitle", "claimText", "loadDemo", "analyzeClaims",
    "inputSource", "inputStatus",
    "workspace", "claimTotal", "claimList", "selectedClaimMeta", "selectedClaimTitle",
    "selectedClaimBadges", "selectedClaimText", "depthMetric", "ownMetric",
    "inheritedMetric", "opennessMetric", "layerColumns", "patchList",
    "focusClaimButtons", "focusClaimGraph", "lineageComparison",
    "requirementEditor", "addRequirement", "macroMetrics", "claimTree", "scopeBars",
    "claimMatrix", "strategyList", "dslOutput", "copyDsl", "exportJson", "exportDsl",
    "exportTraining",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.loadDemo.addEventListener("click", () => {
    loadDemo();
    analyze();
  });
  els.analyzeClaims.addEventListener("click", analyze);
  els.claimList.addEventListener("click", handleClaimSelection);
  els.focusClaimButtons.addEventListener("click", handleFocusClaimSelection);
  els.focusClaimGraph.addEventListener("click", handleFocusGraphSelection);
  els.claimTree.addEventListener("click", handleTreeSelection);
  els.requirementEditor.addEventListener("input", handleRequirementInput);
  els.requirementEditor.addEventListener("change", handleRequirementEdit);
  els.requirementEditor.addEventListener("click", handleRequirementDelete);
  els.requirementEditor.addEventListener("click", handleRequirementMerge);
  els.addRequirement.addEventListener("click", addRequirement);
  els.copyDsl.addEventListener("click", copyDsl);
  els.exportJson.addEventListener("click", exportJson);
  els.exportDsl.addEventListener("click", exportDsl);
  els.exportTraining.addEventListener("click", exportTrainingData);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  const imported = window.CLAIMGRAPH_IMPORT || {};
  if (imported.claimsText) {
    els.patentNumber.value = imported.patentNumber || "";
    els.inventionTitle.value = imported.inventionTitle || "";
    els.claimText.value = imported.claimsText;
    els.inputSource.textContent = imported.sourceName
      ? `インポート済み: ${imported.sourceName}`
      : "インポート済み文書";
    els.inputStatus.textContent = "請求項部分を抽出しました。構造解析結果を表示しています。";
    analyze();
  } else {
    els.patentNumber.value = "";
    els.inventionTitle.value = "";
    els.claimText.value = "";
    els.workspace.hidden = true;
  }
});

function loadDemo() {
  els.patentNumber.value = "JP7362171B1";
  els.inventionTitle.value = "指紋認証用シート状貼付体";
  els.claimText.value = DEMO_CLAIMS;
  els.inputSource.textContent = "テスト出力: JP7362171B1";
  els.inputStatus.textContent = "検証用データを読み込みました。通常の分析対象とは分けて扱ってください。";
}

function analyze() {
  state.claims = parseClaims(els.claimText.value);
  if (!state.claims.size) {
    els.workspace.hidden = true;
    els.inputStatus.textContent = "請求項を入力してから「構造を解析」を押してください。";
    return;
  }
  enrichClaims();
  state.selectedClaim = state.claims.has(state.selectedClaim)
    ? state.selectedClaim
    : [...state.claims.keys()][0] || 1;
  els.workspace.hidden = false;
  els.inputStatus.textContent = `${state.claims.size}件の請求項を解析しました。請求項ボタンで表示対象を切り替えられます。`;
  renderAll();
}

function parseClaims(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  const result = new Map();
  const bracketPattern = /【\s*請求項\s*([0-9０-９]+)\s*】/g;
  const hasBracketHeadings = bracketPattern.test(normalized);
  bracketPattern.lastIndex = 0;
  const pattern = hasBracketHeadings
    ? bracketPattern
    : /(?:^|\n)\s*請求項\s*([0-9０-９]+)\s*(?:[:：.]|(?=\n))/g;
  const matches = [...normalized.matchAll(pattern)];

  if (!matches.length && normalized) {
    result.set(1, makeClaim(1, normalized));
    return result;
  }

  matches.forEach((match, index) => {
    const number = Number(toAsciiDigits(match[1]));
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    result.set(number, makeClaim(number, normalized.slice(start, end).trim()));
  });
  return result;
}

function makeClaim(number, text) {
  const type = /方法|工程/.test(text) ? "method" : /システム/.test(text) ? "system" : "product";
  const referencedClaims = extractDependencies(text, number);
  const startsWithClaimReference = /^\s*請求項\s*[0-9０-９]+/.test(text);
  const referencesProductBeforeMethod =
    /請求項\s*[0-9０-９]+[^。]*に記載の[^。]*(?:製造|形成|作製)する方法/.test(text);
  const targetClaims =
    type === "method" &&
    referencedClaims.length > 0 &&
    (
      referencesProductBeforeMethod ||
      (
        !startsWithClaimReference &&
        /(?:製造|形成|作製)(?:する)?方法/.test(text)
      )
    )
      ? referencedClaims
      : [];
  const parents = targetClaims.length ? [] : referencedClaims;
  const deltaText = stripDependencyPhrase(text);
  return {
    number,
    text,
    deltaText,
    parents,
    targetClaims,
    independent: parents.length === 0,
    type,
    depth: 0,
    requirements: segmentRequirements(deltaText).map((segment, index) =>
      makeRequirement(segment.text, index, segment, type),
    ),
    openness: 100,
  };
}

function extractDependencies(text, ownNumber) {
  const values = [];
  const pattern = /請求項\s*([0-9０-９]+)(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*([0-9０-９]+))?/g;
  for (const match of String(text).matchAll(pattern)) {
    const start = Number(toAsciiDigits(match[1]));
    const end = match[2] ? Number(toAsciiDigits(match[2])) : start;
    for (let current = start; current <= end; current += 1) {
      if (current !== ownNumber) values.push(current);
    }
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function stripDependencyPhrase(text) {
  return String(text)
    .replace(/^\s*請求項\s*[0-9０-９]+(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*[0-9０-９]+)?(?:の(?:いずれか一項|何れか[0-9０-９]+つ))?に記載の[^、。]{0,40}において、?/g, "")
    .replace(/請求項\s*[0-9０-９]+(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*[0-9０-９]+)?の(?:いずれか一項|何れか[0-9０-９]+つ)に記載の/g, "")
    .replace(/請求項\s*[0-9０-９]+(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*[0-9０-９]+)?に記載の/g, "")
    .replace(/、\s*(?:請求項[^。]+に記載の)?[^、。]*(?:装置|方法|システム|貼付体|組成物|プログラム)。?$/g, "。")
    .trim();
}

function splitRequirements(text) {
  return segmentRequirements(text).map((segment) => segment.text);
}

function segmentRequirements(text) {
  const normalized = normalizeRequirementText(text);
  if (!normalized) return [];

  const segments = [];
  let buffer = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const rest = normalized.slice(index + 1);

    if (character === "。" || character === ";" || character === "；") {
      buffer += character;
      pushSegment(segments, buffer, "sentence", 0.98);
      buffer = "";
      continue;
    }

    if (character === "、") {
      const categoryBoundary =
        /(?:装置|システム|プログラム|組成物|貼付体|物|方法|製造方法|工程)(?:であって|であり|において)$/.test(
          buffer,
        );
      const listBoundary =
        /と$/.test(buffer) &&
        /^(?:前記|当該|[一-龠ァ-ンA-Za-z0-9])/.test(rest) &&
        !/又は$|若しくは$|もしくは$/.test(buffer) &&
        !/^(?:前記|当該)[^、。]{0,45}との比/.test(rest);
      const predicateBoundary =
        hasCompletedPredicate(buffer) &&
        /^(?:前記|当該|ここで|ただし|さらに|そして)/.test(rest);

      if (categoryBoundary) {
        pushSegment(segments, buffer, "category", 0.98);
        buffer = "";
        continue;
      }
      if (listBoundary) {
        pushSegment(segments, buffer, "enumeration", 0.9);
        buffer = "";
        continue;
      }
      if (predicateBoundary) {
        pushSegment(segments, buffer, "predicate", 0.92);
        buffer = "";
        continue;
      }
    }

    buffer += character;
  }

  pushSegment(segments, buffer, "terminal", 0.82);
  return mergeIncompleteSegments(segments);
}

function normalizeRequirementText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("")
    .replace(/[ \t　]+/g, "")
    .replace(/、{2,}/g, "、")
    .trim();
}

function isClaimCategory(text) {
  return /(?:装置|システム|プログラム|組成物|貼付体|物|方法|製造方法|工程)$/.test(
    String(text || ""),
  );
}

function hasCompletedPredicate(text) {
  return /(?:を備え|を有し|を含み|とを備え|とを有し|であり|であって|可能とし|可能であり|可能になる|構成され|形成され|設けられ|配置され|接続され|延在し|位置し|画定され|示され|露出させ)$/.test(
    text,
  );
}

function pushSegment(segments, text, reason, confidence) {
  const clean = String(text || "")
    .replace(/^[、と]+/, "")
    .replace(/、+$/, "")
    .trim();
  if (clean.length <= 2) return;
  segments.push({ text: clean, reason, confidence });
}

function mergeIncompleteSegments(segments) {
  const merged = [];

  segments.forEach((segment) => {
    const previous = merged.at(-1);
    const startsIncomplete = /^(?:を|とを|であり|であって)/.test(segment.text);

    const shortFragment =
      segment.text.length < 6 &&
      !["category", "enumeration"].includes(segment.reason);

    if ((startsIncomplete || shortFragment) && previous) {
      previous.text = `${previous.text.replace(/。$/, "")}、${segment.text}`;
      previous.reason = `${previous.reason}+merged`;
      previous.confidence = Math.min(previous.confidence, 0.78);
      return;
    }

    merged.push({ ...segment });
  });

  return merged;
}

function makeRequirement(text, index, segment = {}, claimType = "product") {
  return {
    id: `R${index + 1}`,
    text,
    category: classifyRequirement(text),
    role: classifyRequirementRole(text, segment.reason, claimType),
    concept: extractConcept(text) || `要件${index + 1}`,
    splitReason: segment.reason || "manual",
    splitConfidence: segment.confidence ?? 1,
    inherited: false,
  };
}

function classifyRequirement(text) {
  if (/後に|前に|状態|離脱された|変化|遷移|工程|順序/.test(text)) return "dynamic";
  if (/[0-9０-９]|以上|以下|未満|範囲|比率|面積比|長さ|個|複数|少なくとも/.test(text)) return "condition";
  if (/可能|判定|処理|送信|制御|露出|調整|形成|製造|作用|機能/.test(text)) return "function";
  return "structure";
}

function classifyRequirementRole(text, splitReason = "", claimType = "product") {
  const value = String(text || "");
  if (
    splitReason === "category" ||
    (
      !value.includes("、") &&
      value.length <= 40 &&
      !/[をがはにで]/.test(value) &&
      isClaimCategory(value.replace(/[。；;]$/, ""))
    )
  ) {
    return "category";
  }
  if (
    /(?:これにより|その結果|可能とし|可能とな|可能になる|できる|作用|効果|機能|処理|判定|制御|送信|受信)/.test(
      value,
    )
  ) {
    return "function";
  }
  if (
    claimType === "method" &&
    /(?:する|して|させ|工程|ステップ|処理|製造|形成|作製|取得|算出|判定)/.test(value)
  ) {
    return "step";
  }
  if (
    /(?:に設け|に配置|に接続|隣接|一体化|の間|の周囲|に対向|と一体|から[^、。]*離脱|を囲|を覆|に位置|へ延び|との比|に形成|画定)/.test(
      value,
    )
  ) {
    return "relation";
  }
  if (
    /(?:[0-9０-９]|以上|以下|未満|範囲|比率|面積比|長さ|幅|厚さ|材料|材質|形状|色|複数|少なくとも|粘着力|弱い|可能であり|である)/.test(
      value,
    )
  ) {
    return "attribute";
  }
  return "element";
}

function extractConcept(text) {
  const clean = String(text).replace(/前記/g, "").replace(/\s+/g, "");
  const special = [
    "非保護領域", "粘着剤層", "シート状貼付体", "一対の境界線", "状態監視装置",
    "無線通信部", "通信部", "演算部", "本体部", "保護部", "離脱部", "基部", "羽部",
  ];
  const foundSpecial = special.find((item) => clean.includes(item));
  if (foundSpecial) return foundSpecial;
  const matches = [...clean.matchAll(/([一-龠ァ-ンA-Za-z0-9]{1,14}(?:センサ|モジュール|境界線|領域|部材|装置|システム|プログラム|組成物|方法|工程|機構|手段|層|部|体))/g)];
  return matches.length ? matches[matches.length - 1][1] : "";
}

function enrichClaims() {
  const visiting = new Set();
  state.claims.forEach((claim) => {
    claim.depth = calculateDepth(claim.number, visiting);
  });
  [...state.claims.values()].sort((a, b) => a.depth - b.depth || a.number - b.number).forEach((claim) => {
    claim.openness = calculateOpenness(claim);
  });
}

function calculateDepth(number, visiting) {
  const claim = state.claims.get(number);
  if (!claim || !claim.parents.length) return 0;
  if (visiting.has(number)) return 0;
  visiting.add(number);
  const depth = 1 + Math.max(...claim.parents.map((parent) => calculateDepth(parent, visiting)));
  visiting.delete(number);
  return depth;
}

function calculateOpenness(claim) {
  if (claim.independent) return 100;
  const parentScores = claim.parents.map((parent) => state.claims.get(parent)?.openness ?? 100);
  const base = parentScores.length ? parentScores.reduce((sum, value) => sum + value, 0) / parentScores.length : 100;
  const conditionPenalty = claim.requirements.filter((item) => item.category === "condition").length * 5;
  const exclusionPenalty = claim.requirements.filter((item) => /除く|含まない|でない/.test(item.text)).length * 6;
  return Math.max(12, Math.round(base - 10 - claim.requirements.length * 4 - conditionPenalty - exclusionPenalty));
}

function renderAll() {
  renderClaimList();
  renderDetail();
  renderMacro();
  renderDsl();
}

function renderClaimList() {
  els.claimTotal.textContent = String(state.claims.size);
  els.claimList.innerHTML = [...state.claims.values()].map((claim) => `
    <button class="claim-button ${claim.independent ? "independent" : ""} ${claim.number === state.selectedClaim ? "active" : ""}"
      style="margin-left:${Math.min(claim.depth * 13, 42)}px;width:calc(100% - ${Math.min(claim.depth * 13, 42)}px)"
      data-claim-number="${claim.number}" type="button">
      <strong>請求項${claim.number}</strong>
      <small>${claim.independent ? "独立" : `従属 → ${claim.parents.join(", ")}`} / ${typeLabel(claim.type)}${claim.targetClaims.length ? ` / 対象 ${formatClaimNumbers(claim.targetClaims)}` : ""}</small>
      <span class="mini-patch">${claim.independent ? `${claim.requirements.length}要件` : summarizePatch(claim)}</span>
    </button>
  `).join("");
}

function handleClaimSelection(event) {
  const button = event.target.closest("[data-claim-number]");
  if (!button) return;
  selectClaim(Number(button.dataset.claimNumber));
}

function handleFocusClaimSelection(event) {
  const button = event.target.closest("[data-focus-claim-number]");
  if (!button) return;
  selectClaim(Number(button.dataset.focusClaimNumber));
}

function handleFocusGraphSelection(event) {
  const node = event.target.closest("[data-focus-graph-claim]");
  if (!node) return;
  selectClaim(Number(node.dataset.focusGraphClaim));
}

function handleTreeSelection(event) {
  const node = event.target.closest("[data-tree-claim]");
  if (!node) return;
  selectClaim(Number(node.dataset.treeClaim));
  switchView("detail");
}

function selectClaim(number) {
  if (!state.claims.has(number)) return;
  state.selectedClaim = number;
  renderClaimList();
  renderDetail();
  renderTree();
}

function renderDetail() {
  const claim = state.claims.get(state.selectedClaim);
  if (!claim) return;
  const inherited = getInheritedRequirements(claim);
  els.selectedClaimMeta.textContent = claim.independent ? "INDEPENDENT CLAIM" : `DEPENDS ON ${claim.parents.join(", ")}`;
  els.selectedClaimTitle.textContent = `請求項${claim.number} · ${typeLabel(claim.type)}`;
  els.selectedClaimBadges.innerHTML = [
    claim.independent ? "独立項" : "従属項",
    `深度 ${claim.depth}`,
    claim.targetClaims.length ? `対象 ${formatClaimNumbers(claim.targetClaims)}` : null,
    claim.parents.length > 1 ? "多重従属" : null,
    claim.requirements.some((item) => item.category === "condition") ? "数値・条件あり" : null,
  ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("");
  els.selectedClaimText.textContent = claim.text;
  els.depthMetric.textContent = String(claim.depth);
  els.ownMetric.textContent = String(claim.requirements.length);
  els.inheritedMetric.textContent = String(inherited.length);
  els.opennessMetric.textContent = `${claim.openness}/100`;
  renderLayers(claim, inherited);
  renderPatches(claim);
  renderFocusClaimButtons();
  renderFocusGraph(claim);
  renderLineageComparison(claim);
  renderRequirementEditor(claim);
}

function renderFocusClaimButtons() {
  els.focusClaimButtons.innerHTML = [...state.claims.values()].map((claim) => `
    <button class="${claim.number === state.selectedClaim ? "active" : ""}"
      data-focus-claim-number="${claim.number}" type="button">
      請求項${claim.number}
      <small>${claim.independent ? "独立" : `→ ${claim.parents.join(", ")}`}</small>
    </button>
  `).join("");
}

function getClaimLineage(claim) {
  if (!claim) return [];
  const lineageNumbers = new Set();
  const visit = (number) => {
    if (lineageNumbers.has(number)) return;
    const current = state.claims.get(number);
    if (!current) return;
    current.parents.forEach(visit);
    lineageNumbers.add(number);
  };

  visit(claim.number);
  if (state.claims.has(1)) lineageNumbers.add(1);
  return [...lineageNumbers]
    .map((number) => state.claims.get(number))
    .filter(Boolean)
    .sort((a, b) => a.depth - b.depth || a.number - b.number);
}

function getRootSubject() {
  const claimOne = state.claims.get(1) || [...state.claims.values()][0];
  if (!claimOne) return "請求項1の主体";
  const category = claimOne.requirements.find((item) => item.role === "category");
  return category?.concept || extractClaimSubject(claimOne.text, claimOne.type);
}

function extractClaimSubject(text, claimType = "product") {
  const clean = String(text || "")
    .replace(/請求項[^。]+に記載の/g, "")
    .replace(/[。；;]/g, "。");
  const suffix = claimType === "method"
    ? /([一-龠ァ-ンA-Za-z0-9ー]{1,24}(?:製造方法|方法|工程))/g
    : /([一-龠ァ-ンA-Za-z0-9ー]{1,24}(?:システム|プログラム|組成物|貼付体|装置|部材|構造体|物))/g;
  const matches = [...clean.matchAll(suffix)];
  if (matches.length) return matches.at(-1)[1].replace(/^(?:前記|当該)/, "");
  return claimType === "method" ? "方法" : "請求項1の主体";
}

function buildFocusModel(claim) {
  const lineage = getClaimLineage(claim);
  const rootSubject = getRootSubject();
  const rows = [];
  const conceptNodes = new Map();

  lineage.forEach((sourceClaim) => {
    sourceClaim.requirements.forEach((requirement) => {
      const key = `claim-${sourceClaim.number}-${requirement.id}`;
      const ownConcept = normalizeConcept(requirement.concept);
      const references = [...conceptNodes.entries()]
        .filter(([concept]) =>
          concept &&
          normalizeConcept(requirement.text).includes(concept),
        )
        .map(([, node]) => node);
      const parent = references.at(-1);
      const selected = sourceClaim.number === claim.number;
      const root = sourceClaim.number === 1;
      const patch = root
        ? "base"
        : selected && !claim.independent
          ? classifyPatch(requirement, claim)
          : "inherit";
      const row = {
        key,
        sourceClaim: sourceClaim.number,
        requirement,
        selected,
        root,
        patch,
        parentKey: parent?.key || `claim-${sourceClaim.number}`,
        parentLabel: parent?.label || (sourceClaim.number === 1 ? rootSubject : `請求項${sourceClaim.number}`),
      };
      rows.push(row);
      if (ownConcept) {
        conceptNodes.set(ownConcept, {
          key,
          label: requirement.concept,
          sourceClaim: sourceClaim.number,
        });
      }
    });
  });

  return { lineage, rootSubject, rows };
}

function renderFocusGraph(claim) {
  const svg = els.focusClaimGraph;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const model = buildFocusModel(claim);
  const columnWidth = 285;
  const nodeWidth = 236;
  const nodeHeight = 54;
  const top = 34;
  const requirementTop = 124;
  const rowGap = 68;
  const rowsByClaim = new Map(
    model.lineage.map((item) => [
      item.number,
      model.rows.filter((row) => row.sourceClaim === item.number),
    ]),
  );
  const maxRows = Math.max(1, ...[...rowsByClaim.values()].map((rows) => rows.length));
  const width = Math.max(920, model.lineage.length * columnWidth + 70);
  const height = Math.max(390, requirementTop + maxRows * rowGap + 40);
  const positions = new Map();

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.height = `${height}px`;

  model.lineage.forEach((sourceClaim, columnIndex) => {
    const x = 34 + columnIndex * columnWidth;
    positions.set(`claim-${sourceClaim.number}`, { x, y: top });
    rowsByClaim.get(sourceClaim.number).forEach((row, rowIndex) => {
      positions.set(row.key, { x, y: requirementTop + rowIndex * rowGap });
    });
  });

  model.lineage.forEach((sourceClaim) => {
    if (sourceClaim.number === 1) return;
    const child = positions.get(`claim-${sourceClaim.number}`);
    const parentNumbers = sourceClaim.parents.filter((number) =>
      positions.has(`claim-${number}`),
    );
    const visibleParents = parentNumbers.length ? parentNumbers : [1];
    visibleParents.forEach((parentNumber) => {
      const parent = positions.get(`claim-${parentNumber}`);
      if (!parent || !child) return;
      svg.append(svgElement("path", {
        d: focusEdgePath(parent, child, nodeWidth, nodeHeight),
        class: `focus-edge ${sourceClaim.parents.length ? "" : "target-edge"}`,
      }));
      const label = svgElement("text", {
        x: String((parent.x + nodeWidth + child.x) / 2),
        y: String(top + 20),
        class: "focus-edge-label",
      });
      label.textContent = sourceClaim.parents.length ? "継承" : "対象";
      svg.append(label);
    });
  });

  model.rows.forEach((row) => {
    const parent = positions.get(row.parentKey) || positions.get(`claim-${row.sourceClaim}`);
    const child = positions.get(row.key);
    if (!parent || !child) return;
    const nested = row.parentKey.startsWith("claim-") && row.parentKey.split("-").length > 2;
    svg.append(svgElement("path", {
      d: nested
        ? `M ${parent.x + nodeWidth / 2} ${parent.y + nodeHeight} C ${parent.x + nodeWidth / 2} ${child.y - 18}, ${child.x + nodeWidth / 2} ${child.y - 18}, ${child.x + nodeWidth / 2} ${child.y}`
        : `M ${parent.x + 26} ${parent.y + nodeHeight} L ${parent.x + 26} ${child.y - 12} Q ${parent.x + 26} ${child.y} ${parent.x + 38} ${child.y} L ${child.x} ${child.y}`,
      class: `focus-edge requirement-edge ${nested ? "reference-edge" : ""}`,
    }));
  });

  model.lineage.forEach((sourceClaim) => {
    const position = positions.get(`claim-${sourceClaim.number}`);
    const root = sourceClaim.number === 1;
    const selected = sourceClaim.number === claim.number;
    const group = svgElement("g", {
      class: `focus-node claim-node ${root ? "root-node" : ""} ${selected ? "selected-node" : "inherited-node"}`,
      "data-focus-graph-claim": String(sourceClaim.number),
      transform: `translate(${position.x},${position.y})`,
      role: "button",
      tabindex: "0",
    });
    group.append(svgElement("rect", { width: String(nodeWidth), height: String(nodeHeight) }));
    const label = svgElement("text", { x: "14", y: "21", class: "focus-node-title" });
    label.textContent = root
      ? `請求項1 主体 · ${truncate(model.rootSubject, 18)}`
      : `請求項${sourceClaim.number} · ${selected ? "選択中" : "継承元"}`;
    const sub = svgElement("text", { x: "14", y: "40", class: "focus-node-sub" });
    sub.textContent = root
      ? "固定ルート"
      : `${typeLabel(sourceClaim.type)} / ${summarizePatch(sourceClaim).slice(0, 24)}`;
    group.append(label, sub);
    svg.append(group);
  });

  model.rows.forEach((row) => {
    const position = positions.get(row.key);
    const group = svgElement("g", {
      class: `focus-node requirement-node ${row.selected ? "selected-requirement" : "inherited-requirement"} role-${row.requirement.role}`,
      transform: `translate(${position.x},${position.y})`,
    });
    group.append(svgElement("rect", { width: String(nodeWidth), height: String(nodeHeight) }));
    const title = svgElement("text", { x: "13", y: "20", class: "focus-node-title" });
    title.textContent = `${row.requirement.id} · ${truncate(row.requirement.concept, 18)}`;
    const sub = svgElement("text", { x: "13", y: "39", class: "focus-node-sub" });
    sub.textContent = `${roleLabel(row.requirement.role)} / ${truncate(row.requirement.text, 23)}`;
    group.append(title, sub);
    svg.append(group);
  });
}

function focusEdgePath(parent, child, nodeWidth, nodeHeight) {
  return `M ${parent.x + nodeWidth} ${parent.y + nodeHeight / 2} C ${parent.x + nodeWidth + 28} ${parent.y + nodeHeight / 2}, ${child.x - 28} ${child.y + nodeHeight / 2}, ${child.x} ${child.y + nodeHeight / 2}`;
}

function renderLineageComparison(claim) {
  const model = buildFocusModel(claim);
  if (!model.rows.length) {
    els.lineageComparison.innerHTML = '<div class="empty">構成要件がありません。</div>';
    return;
  }
  const rows = model.rows.map((row) => {
    const status = row.root
      ? "基底"
      : row.selected
        ? (row.patch === "add" ? "追加" : row.patch === "limit" ? "限定" : row.patch === "replace" ? "置換" : row.patch === "exclude" ? "除外" : "固有")
        : "継承";
    return `
      <tr class="${row.selected ? "selected-comparison-row" : ""}">
        <td>請求項${row.sourceClaim}</td>
        <td><span class="comparison-status status-${escapeHtml(row.patch)}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(row.requirement.id)}</td>
        <td><strong>${escapeHtml(row.requirement.concept)}</strong></td>
        <td>${escapeHtml(roleLabel(row.requirement.role))}</td>
        <td>${escapeHtml(CATEGORY_META[row.requirement.category]?.label || "構造")}</td>
        <td>${escapeHtml(row.parentLabel)}</td>
        <td class="comparison-text">${escapeHtml(row.requirement.text)}</td>
      </tr>
    `;
  }).join("");
  els.lineageComparison.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>起源</th>
          <th>選択項との関係</th>
          <th>ID</th>
          <th>構成要素</th>
          <th>構成タイプ</th>
          <th>意味層</th>
          <th>上位要素・入れ子先</th>
          <th>要件文</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function getInheritedRequirements(claim, seen = new Set()) {
  if (!claim || !claim.parents.length || seen.has(claim.number)) return [];
  seen.add(claim.number);
  const collected = [];
  claim.parents.forEach((parentNumber) => {
    const parent = state.claims.get(parentNumber);
    if (!parent) return;
    collected.push(...getInheritedRequirements(parent, seen));
    collected.push(...parent.requirements.map((item) => ({ ...item, inherited: true, fromClaim: parent.number })));
  });
  const unique = new Map();
  collected.forEach((item) => unique.set(`${item.concept}|${item.text}`, item));
  return [...unique.values()];
}

function renderLayers(claim, inherited) {
  const all = [...inherited, ...claim.requirements];
  const layerGroups = [
    ["structure", "構造", "何があるか"],
    ["function", "機能", "何をするか"],
    ["dynamic", "動態・条件", "いつ・どう変わるか"],
  ];
  els.layerColumns.innerHTML = layerGroups.map(([key, label, note]) => {
    const items = key === "dynamic"
      ? all.filter((item) => ["dynamic", "condition"].includes(item.category))
      : all.filter((item) => item.category === key);
    return `
      <article class="layer-column ${key}">
        <h3><span>${key === "structure" ? "S" : key === "function" ? "F" : "D"}</span>${label}</h3>
        <div class="layer-items">
          ${items.length ? items.map((item) => `
            <div class="layer-item ${item.inherited ? "inherited" : ""}">
              <b>
                <span class="role-chip role-${escapeHtml(item.role || "element")}">${escapeHtml(roleLabel(item.role))}</span>
                ${item.inherited ? `継承 · 請求項${item.fromClaim}` : escapeHtml(item.concept)}
              </b>
              ${escapeHtml(item.text)}
            </div>
          `).join("") : `<div class="empty">${note}に該当する要件なし</div>`}
        </div>
      </article>
    `;
  }).join("");
}

function renderPatches(claim) {
  if (claim.independent) {
    els.patchList.innerHTML = '<div class="empty">独立項は基底構造です。従属項を選ぶと親との差分を表示します。</div>';
    return;
  }
  els.patchList.innerHTML = claim.requirements.map((item) => {
    const type = classifyPatch(item, claim);
    return `
      <article class="patch-item">
        <span class="patch-type ${type}">${type}</span>
        <p><b>${escapeHtml(item.concept)}</b><br>${escapeHtml(item.text)}</p>
      </article>
    `;
  }).join("");
}

function classifyPatch(requirement, claim) {
  const inheritedConcepts = new Set(getInheritedRequirements(claim).map((item) => normalizeConcept(item.concept)));
  const concept = normalizeConcept(requirement.concept);
  if (/除く|含まない|でない/.test(requirement.text)) return "exclude";
  if (
    /置換|代えて|複数(?:設け|の)/.test(requirement.text) &&
    [...inheritedConcepts].some((item) => concept.includes(item) || item.includes(concept))
  ) return "replace";
  if (inheritedConcepts.has(concept) || requirement.category === "condition") return "limit";
  return "add";
}

function renderRequirementEditor(claim) {
  els.requirementEditor.innerHTML = claim.requirements.map((item, index) => `
    <div class="requirement-row" data-requirement-index="${index}">
      <span class="requirement-id" title="${escapeHtml(splitReasonLabel(item.splitReason))}">
        ${escapeHtml(item.id)}
        <small>${Math.round((item.splitConfidence ?? 1) * 100)}%</small>
      </span>
      <select class="requirement-category" data-field="category">
        ${Object.entries(CATEGORY_META).map(([key, meta]) => `<option value="${key}" ${item.category === key ? "selected" : ""}>${meta.label}</option>`).join("")}
      </select>
      <select class="requirement-role" data-field="role" aria-label="構成タイプ">
        ${Object.entries(ROLE_META).map(([key, meta]) => `<option value="${key}" ${item.role === key ? "selected" : ""}>${meta.label}</option>`).join("")}
      </select>
      <input class="requirement-concept" data-field="concept" value="${escapeHtml(item.concept)}" aria-label="要素名">
      <input class="requirement-text" data-field="text" value="${escapeHtml(item.text)}" aria-label="要件文">
      <button class="merge-requirement" data-merge-requirement="${index}" type="button"
        aria-label="次の要件と結合" ${index === claim.requirements.length - 1 ? "disabled" : ""}>結合</button>
      <button class="delete-requirement" data-delete-requirement="${index}" type="button" aria-label="要件を削除">×</button>
    </div>
  `).join("");
}

function handleRequirementEdit(event) {
  if (!updateRequirementFromEvent(event)) return;
  enrichClaims();
  renderAll();
}

function handleRequirementInput(event) {
  updateRequirementFromEvent(event);
}

function updateRequirementFromEvent(event) {
  const field = event.target.dataset.field;
  if (!field) return false;
  const row = event.target.closest("[data-requirement-index]");
  const claim = state.claims.get(state.selectedClaim);
  const requirement = claim?.requirements[Number(row?.dataset.requirementIndex)];
  if (!requirement) return false;
  requirement[field] = event.target.value;
  claim.openness = calculateOpenness(claim);
  return true;
}

function handleRequirementDelete(event) {
  const button = event.target.closest("[data-delete-requirement]");
  if (!button) return;
  const claim = state.claims.get(state.selectedClaim);
  claim.requirements.splice(Number(button.dataset.deleteRequirement), 1);
  reindexRequirements(claim);
  enrichClaims();
  renderAll();
}

function handleRequirementMerge(event) {
  const button = event.target.closest("[data-merge-requirement]");
  if (!button || button.disabled) return;
  const claim = state.claims.get(state.selectedClaim);
  const index = Number(button.dataset.mergeRequirement);
  const current = claim?.requirements[index];
  const next = claim?.requirements[index + 1];
  if (!current || !next) return;
  current.text = `${current.text.replace(/。$/, "")}、${next.text}`;
  current.concept = extractConcept(current.text) || current.concept;
  current.category = classifyRequirement(current.text);
  current.role = classifyRequirementRole(current.text, "manual", claim.type);
  current.splitReason = "manual";
  current.splitConfidence = 1;
  claim.requirements.splice(index + 1, 1);
  reindexRequirements(claim);
  enrichClaims();
  renderAll();
}

function addRequirement() {
  const claim = state.claims.get(state.selectedClaim);
  claim.requirements.push({
    id: `R${claim.requirements.length + 1}`,
    text: "新しい構成要件",
    category: "structure",
    role: "element",
    concept: "新規要素",
    splitReason: "manual",
    splitConfidence: 1,
    inherited: false,
  });
  enrichClaims();
  renderAll();
}

function reindexRequirements(claim) {
  claim.requirements.forEach((item, index) => {
    item.id = `R${index + 1}`;
  });
}

function renderMacro() {
  const claims = [...state.claims.values()];
  const independent = claims.filter((claim) => claim.independent);
  const maxDepth = Math.max(0, ...claims.map((claim) => claim.depth));
  const numericClaims = claims.filter((claim) => claim.requirements.some((item) => item.category === "condition"));
  const staged = claims.filter((claim) => claim.parents.some((parent) => (state.claims.get(parent)?.depth || 0) > 0));
  const metrics = [
    ["INDEPENDENT", independent.length, "独立請求項"],
    ["MAX DEPTH", maxDepth, "最深の従属段階"],
    ["NUMERIC FALLBACKS", numericClaims.length, "数値・条件限定を持つ項"],
    ["STAGED FALLBACKS", staged.length, "従属項をさらに限定"],
  ];
  els.macroMetrics.innerHTML = metrics.map(([label, value, note]) => `
    <article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>
  `).join("");
  renderTree();
  renderScopeBars();
  renderMatrix();
  renderStrategy();
}

function renderTree() {
  const svg = els.claimTree;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const claims = [...state.claims.values()].sort((a, b) => a.number - b.number);
  const width = Math.max(760, (Math.max(0, ...claims.map((claim) => claim.depth)) + 1) * 190 + 80);
  const height = Math.max(340, claims.length * 72 + 30);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.height = `${height}px`;
  const positions = new Map(claims.map((claim, index) => [
    claim.number,
    { x: 35 + claim.depth * 190, y: 25 + index * 72 },
  ]));

  claims.forEach((claim) => {
    claim.parents.forEach((parentNumber) => {
      const parent = positions.get(parentNumber);
      const child = positions.get(claim.number);
      if (!parent || !child) return;
      const path = svgElement("path", {
        d: `M ${parent.x + 145} ${parent.y + 23} C ${parent.x + 168} ${parent.y + 23}, ${child.x - 23} ${child.y + 23}, ${child.x} ${child.y + 23}`,
        class: "tree-edge",
      });
      svg.append(path);
    });
  });

  claims.forEach((claim) => {
    const position = positions.get(claim.number);
    const group = svgElement("g", {
      class: `tree-node ${claim.independent ? "independent" : ""} ${claim.number === state.selectedClaim ? "selected" : ""}`,
      "data-tree-claim": String(claim.number),
      transform: `translate(${position.x},${position.y})`,
      role: "button",
      tabindex: "0",
    });
    group.append(svgElement("rect", { width: "145", height: "46" }));
    const title = svgElement("text", { x: "12", y: "19" });
    title.textContent = `請求項${claim.number}`;
    const sub = svgElement("text", { x: "12", y: "35", class: "tree-sub" });
    sub.textContent = claim.independent ? `${typeLabel(claim.type)}・独立` : summarizePatch(claim).slice(0, 20);
    group.append(title, sub);
    svg.append(group);
  });
}

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderScopeBars() {
  els.scopeBars.innerHTML = [...state.claims.values()].map((claim) => `
    <div class="scope-row">
      <label>請求項${claim.number}</label>
      <div class="scope-track"><div class="scope-fill" style="width:${claim.openness}%"></div></div>
      <strong>${claim.openness}</strong>
    </div>
  `).join("");
}

function renderMatrix() {
  const claims = [...state.claims.values()];
  const concepts = [...new Set(claims.flatMap((claim) => claim.requirements.map((item) => item.concept)).filter(Boolean))];
  if (!concepts.length) {
    els.claimMatrix.innerHTML = '<div class="empty">要素名を設定するとマトリクスを表示します。</div>';
    return;
  }
  const header = claims.map((claim) => `<th>請求項${claim.number}</th>`).join("");
  const rows = concepts.map((concept) => {
    const cells = claims.map((claim) => {
      const own = claim.requirements.some((item) => normalizeConcept(item.concept) === normalizeConcept(concept));
      const inherited = getInheritedRequirements(claim).some((item) => normalizeConcept(item.concept) === normalizeConcept(concept));
      const limited = own && inherited;
      if (limited) return '<td class="matrix-limited">▲限定</td>';
      if (own) return '<td class="matrix-own">●固有</td>';
      if (inherited) return '<td class="matrix-inherited">○継承</td>';
      return "<td></td>";
    }).join("");
    return `<tr><td>${escapeHtml(concept)}</td>${cells}</tr>`;
  }).join("");
  els.claimMatrix.innerHTML = `<table><thead><tr><th>構成要件</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderStrategy() {
  const claims = [...state.claims.values()];
  const independent = claims.filter((claim) => claim.independent);
  const types = new Set(independent.map((claim) => claim.type));
  const maxDepth = Math.max(0, ...claims.map((claim) => claim.depth));
  const staged = claims.filter((claim) => claim.parents.some((parent) => (state.claims.get(parent)?.depth || 0) > 0));
  const numeric = claims.filter((claim) => claim.requirements.some((item) => item.category === "condition"));
  const alternatives = claims.filter((claim) => claim.requirements.some((item) => /又は|いずれか|選択/.test(item.text)));
  const observations = [];

  if (types.size >= 2) {
    observations.push(["請求カテゴリを分散", `独立項が${[...types].map(typeLabel).join("・")}に分かれ、異なる実施態様を押さえる構造です。`, "strength"]);
  } else {
    observations.push(["請求カテゴリが単線", "独立項のカテゴリが一種類です。方法・システム・媒体等の別カテゴリを検討する余地を確認できます。", "opportunity"]);
  }
  if (staged.length) {
    observations.push(["段階的なフォールバック", `請求項${staged.map((claim) => claim.number).join("、")}は従属項をさらに限定し、拒絶対応時の段階的な着地点を形成しています。`, "strength"]);
  } else {
    observations.push(["従属階層が浅い", "すべての従属項が独立項へ直接ぶら下がっています。中間的な限定の組合せが必要か確認できます。", "opportunity"]);
  }
  if (numeric.length) {
    observations.push(["数値限定の着地点", `請求項${numeric.map((claim) => claim.number).join("、")}に数値・範囲条件があります。明確なフォールバックである一方、設計変更余地も確認対象です。`, "strength"]);
  }
  if (alternatives.length) {
    observations.push(["選択肢を含む請求", `請求項${alternatives.map((claim) => claim.number).join("、")}にOR・選択表現があります。代替態様の包含関係を確認できます。`, "strength"]);
  } else {
    observations.push(["代替態様が明示されていない", "OR構造や代替構成が検出されませんでした。実施形態のバリエーションが従属項で押さえられているか確認できます。", "opportunity"]);
  }
  if (maxDepth >= 2) {
    observations.push(["深度のある請求項ツリー", `最大深度は${maxDepth}です。広い独立項から具体的限定へ段階的に絞る構造が見えます。`, "strength"]);
  }

  els.strategyList.innerHTML = observations.map(([title, text, kind]) => `
    <article class="strategy-item ${kind === "opportunity" ? "opportunity" : ""}">
      <strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>
    </article>
  `).join("");
}

function renderDsl() {
  els.dslOutput.textContent = generateDsl();
}

function generateDsl() {
  const lines = [
    `patent ${els.patentNumber.value.trim() || "UNKNOWN"} "${els.inventionTitle.value.trim() || "名称未設定"}" {`,
    `  claim_count: ${state.claims.size}`,
    "}",
    "",
  ];
  state.claims.forEach((claim) => {
    const declaration = claim.independent
      ? `claim ${claim.number} independent ${claim.type} "${els.inventionTitle.value.trim() || "名称未設定"}" {`
      : `claim ${claim.number} depends_on ${claim.parents.length > 1 ? `any_of [${claim.parents.join(", ")}]` : claim.parents[0]} {`;
    lines.push(declaration);
    if (claim.targetClaims.length) {
      lines.push(`  target_product: any_of [${formatClaimNumbers(claim.targetClaims)}]`);
    }
    claim.requirements.forEach((item) => {
      const meta = CATEGORY_META[item.category] || CATEGORY_META.structure;
      if (claim.independent) {
        const tag = item.category === "condition" ? "condition" : item.category === "dynamic" ? "action" : item.category === "function" ? "function" : "component";
        lines.push(`  ${tag} ${item.id} "${escapeDsl(item.concept)}" {`);
        lines.push(`    text: "${escapeDsl(item.text)}"`);
        lines.push(`    layer: "${meta.label}"`);
        lines.push("  }");
      } else {
        const patch = classifyPatch(item, claim);
        lines.push(`  ${patch} ${item.id} "${escapeDsl(item.concept)}" {`);
        lines.push(`    text: "${escapeDsl(item.text)}"`);
        lines.push("  }");
      }
    });
    lines.push("}", "");
  });
  return lines.join("\n");
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active");
  if (view === "macro") renderMacro();
  if (view === "dsl") renderDsl();
}

function copyDsl() {
  navigator.clipboard.writeText(generateDsl()).then(() => {
    els.copyDsl.textContent = "コピー済み";
    window.setTimeout(() => { els.copyDsl.textContent = "コピー"; }, 1200);
  });
}

function exportJson() {
  const payload = {
    product: "ClaimGraph Viewer",
    parser: "regular expressions and deterministic rules",
    generativeAI: false,
    patentNumber: els.patentNumber.value.trim(),
    inventionTitle: els.inventionTitle.value.trim(),
    claims: [...state.claims.values()].map((claim) => ({
      number: claim.number,
      text: claim.text,
      parents: claim.parents,
      targetClaims: claim.targetClaims,
      independent: claim.independent,
      type: claim.type,
      depth: claim.depth,
      opennessProxy: claim.openness,
      requirements: claim.requirements,
    })),
    disclaimer: "The openness score is a structural proxy, not a legal assessment of claim scope.",
  };
  download(JSON.stringify(payload, null, 2), `${safeName(els.patentNumber.value)}_claimgraph.json`, "application/json;charset=utf-8");
}

function exportDsl() {
  download(generateDsl(), `${safeName(els.patentNumber.value)}.claimgraph`, "text/plain;charset=utf-8");
}

function exportTrainingData() {
  const content = buildTrainingJsonl();
  download(
    content,
    `${safeName(els.patentNumber.value.trim())}_boundary_training.jsonl`,
    "application/x-ndjson;charset=utf-8",
  );
}

function buildTrainingJsonl() {
  const patentNumber = els.patentNumber.value.trim();
  const rows = [...state.claims.values()].map((claim) =>
    JSON.stringify({
      schema: "claim-boundary-v1",
      patentNumber,
      claimNumber: claim.number,
      claimText: claim.deltaText,
      requirements: claim.requirements.map((item) => item.text),
      roles: claim.requirements.map((item) => item.role || "element"),
      parser: "human-reviewed",
    }),
  );
  return `${rows.join("\n")}\n`;
}

function download(content, fileName, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function summarizePatch(claim) {
  const counts = claim.requirements.reduce((acc, item) => {
    const type = classifyPatch(item, claim);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([type, count]) => `${type} ${count}`).join(" / ") || "差分なし";
}

function typeLabel(type) {
  return type === "method" ? "方法" : type === "system" ? "システム" : "物";
}

function roleLabel(role) {
  return ROLE_META[role]?.label || ROLE_META.element.label;
}

function splitReasonLabel(reason) {
  const labels = {
    sentence: "文末境界",
    enumeration: "列挙境界",
    predicate: "述語境界",
    category: "請求対象境界",
    terminal: "末尾",
    preamble: "前置部と本体を結合",
    manual: "手動追加",
  };
  const base = String(reason || "manual").split("+")[0];
  return labels[base] || "構文境界";
}

function formatClaimNumbers(numbers) {
  if (!numbers.length) return "";
  const sorted = [...numbers].sort((a, b) => a - b);
  const continuous = sorted.every(
    (value, index) => index === 0 || value === sorted[index - 1] + 1,
  );
  return continuous && sorted.length > 2
    ? `${sorted[0]}..${sorted.at(-1)}`
    : sorted.join(", ");
}

function normalizeConcept(value) {
  return String(value || "").replace(/前記|一対の|複数の|シート状の|\s/g, "");
}

function escapeDsl(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function safeName(value) {
  return String(value || "claimgraph").replace(/[\\/:*?"<>|]/g, "_");
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function toAsciiDigits(value) {
  return String(value || "").replace(/[０-９]/g, (digit) =>
    String(digit.charCodeAt(0) - "０".charCodeAt(0)),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
