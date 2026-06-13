import html as html_module
import json
import re
from pathlib import Path

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from claim_corpus import (
    PatentDocument,
    best_claim_pair,
    corpus_similarity_values,
    dependency_depth,
    parse_claims,
    requirement_coverage,
    requirement_matches,
    text_similarity,
)
from document_import import extract_uploaded_documents


ROOT = Path(__file__).resolve().parent


def build_embedded_app(initial_data=None) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles-v2.css").read_text(encoding="utf-8")
    javascript = (ROOT / "app.js").read_text(encoding="utf-8")
    payload = json.dumps(initial_data or {}, ensure_ascii=False).replace("</", "<\\/")

    html = re.sub(
        r'<link rel="stylesheet" href="styles-v2\.css\?v=[^"]+">',
        lambda _: f"<style>{css}</style>",
        html,
    )
    html = re.sub(
        r'<script src="app\.js\?v=[^"]+"></script>',
        lambda _: f"<script>{javascript}</script>",
        html,
    )
    return html.replace(
        "</head>",
        f"<script>window.CLAIMGRAPH_IMPORT = {payload};</script></head>",
    )


def make_document(record) -> PatentDocument:
    return PatentDocument(
        patent_number=record.get("patent_number") or Path(record["source_name"]).stem,
        source_name=record["source_name"],
        claims=parse_claims(record["claims_text"]),
    )


def document_summary(document: PatentDocument):
    independent = sum(claim.independent for claim in document.claims.values())
    depths = [
        dependency_depth(claim, document.claims)
        for claim in document.claims.values()
    ]
    return {
        "特許・案件": document.label,
        "請求項": len(document.claims),
        "独立項": independent,
        "従属項": len(document.claims) - independent,
        "最大深度": max(depths, default=0),
        "入力元": document.source_name,
    }


def render_dependency_structure(document: PatentDocument):
    rows = []
    for claim in sorted(document.claims.values(), key=lambda item: item.number):
        depth = dependency_depth(claim, document.claims)
        parent_text = "独立項" if not claim.parents else " / ".join(
            f"請求項{number}" for number in claim.parents
        )
        rows.append(
            f"""
            <div class="claim-node" style="--depth:{depth}">
              <div class="claim-node-line"></div>
              <span class="claim-number">請求項{claim.number}</span>
              <span class="claim-parent">{html_module.escape(parent_text)}</span>
              <span class="claim-count">固有 {len(claim.requirements)} / 展開後 {len(claim.expanded_requirements)}</span>
            </div>
            """
        )
    st.markdown(
        f'<div class="dependency-board">{"".join(rows)}</div>',
        unsafe_allow_html=True,
    )


def similarity_matrix(documents):
    labels = unique_labels(documents)
    values = corpus_similarity_values(documents)
    return pd.DataFrame(values, index=labels, columns=labels)


def unique_labels(documents):
    counts = {}
    labels = []
    for document in documents:
        label = document.label
        counts[label] = counts.get(label, 0) + 1
        labels.append(label if counts[label] == 1 else f"{label} ({counts[label]})")
    return labels


def pair_interpretation(coverage_ab, coverage_ba):
    difference = coverage_ab - coverage_ba
    if coverage_ab >= 0.65 and difference >= 0.12:
        return "Aの要件がBに多く対応し、B側に追加限定候補がある構造です。"
    if coverage_ba >= 0.65 and difference <= -0.12:
        return "Bの要件がAに多く対応し、A側に追加限定候補がある構造です。"
    if coverage_ab >= 0.65 and coverage_ba >= 0.65:
        return "双方向の対応度が高く、構成要件の重なりが大きい候補です。"
    return "全体の文章または構成要件に差があり、部分対応を確認すべき組合せです。"


def render_claim_chart(source_claim, target_claim):
    matches = requirement_matches(source_claim, target_claim)
    frame = pd.DataFrame(
        [
            {
                "Aの構成要件": match["source"],
                "対応度": f"{float(match['score']):.0%}",
                "Bの対応候補": match["target"] or "対応候補なし",
                "判定": match["status"],
            }
            for match in matches
        ]
    )
    if frame.empty:
        st.info("比較できる構成要件がありません。")
        return
    st.dataframe(
        frame,
        width="stretch",
        hide_index=True,
        height=min(640, 80 + 48 * len(frame)),
    )


def render_similarity_heatmap(frame):
    header = "".join(
        f"<th>{html_module.escape(str(label))}</th>" for label in frame.columns
    )
    rows = []
    for row_label, values in frame.iterrows():
        cells = []
        for value in values:
            numeric = float(value)
            background_alpha = 0.08 + numeric * 0.78
            color = "#ffffff" if numeric >= 0.52 else "#1d3557"
            cells.append(
                f'<td style="background:rgba(53,104,212,{background_alpha:.2f});'
                f'color:{color}">{numeric:.0%}</td>'
            )
        rows.append(
            f"<tr><th>{html_module.escape(str(row_label))}</th>{''.join(cells)}</tr>"
        )
    st.markdown(
        f"""
        <div class="heatmap-wrap">
          <table class="similarity-heatmap">
            <thead><tr><th></th>{header}</tr></thead>
            <tbody>{''.join(rows)}</tbody>
          </table>
        </div>
        """,
        unsafe_allow_html=True,
    )


def best_pair_options(left, right):
    default_left, default_right, _ = best_claim_pair(left, right)
    left_numbers = sorted(left.claims)
    right_numbers = sorted(right.claims)
    return (
        left_numbers,
        right_numbers,
        left_numbers.index(default_left.number),
        right_numbers.index(default_right.number),
    )


def containment_candidates(documents, similarity_values, threshold=0.42, max_pairs=60):
    labels = unique_labels(documents)
    rows = []
    pairs = sorted(
        (
            (similarity_values[left_index][right_index], left_index, right_index)
            for left_index in range(len(documents))
            for right_index in range(left_index + 1, len(documents))
        ),
        reverse=True,
    )[:max_pairs]
    for _, left_index, right_index in pairs:
        left = documents[left_index]
        right = documents[right_index]
        left_claim, right_claim, similarity = best_claim_pair(left, right)
        coverage_ab = requirement_coverage(left_claim, right_claim)
        coverage_ba = requirement_coverage(right_claim, left_claim)
        for source_label, source_claim, target_label, target_claim, coverage in (
            (
                labels[left_index],
                left_claim,
                labels[right_index],
                right_claim,
                coverage_ab,
            ),
            (
                labels[right_index],
                right_claim,
                labels[left_index],
                left_claim,
                coverage_ba,
            ),
        ):
            if coverage >= threshold:
                rows.append(
                    {
                        "方向付き候補": f"{source_label} → {target_label}",
                        "クレーム": f"請求項{source_claim.number} → 請求項{target_claim.number}",
                        "文章類似度": similarity,
                        "要件カバレッジ": coverage,
                        "対象側の追加要件": max(
                            0,
                            len(target_claim.expanded_requirements)
                            - len(source_claim.expanded_requirements),
                        ),
                    }
                )
    return sorted(rows, key=lambda row: row["要件カバレッジ"], reverse=True)


st.set_page_config(
    page_title="ClaimScope Analyst",
    page_icon="◫",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    :root {
      --ink: #172033;
      --muted: #657086;
      --line: #e2e7ef;
      --navy: #15243b;
      --blue: #3568d4;
      --blue-soft: #edf3ff;
      --teal: #087f72;
      --surface: #ffffff;
    }
    .stApp {background: #f6f8fb; color: var(--ink);}
    .block-container {max-width: 1480px; padding-top: 2rem; padding-bottom: 4rem;}
    header[data-testid="stHeader"] {background: rgba(246,248,251,.88); backdrop-filter: blur(16px);}
    .analyst-hero {
      padding: 34px 38px;
      border: 1px solid #dfe5ee;
      border-radius: 24px;
      background:
        radial-gradient(circle at 92% 8%, rgba(53,104,212,.16), transparent 28%),
        linear-gradient(135deg, #fff 0%, #f8faff 100%);
      box-shadow: 0 18px 50px rgba(24,39,75,.07);
      margin-bottom: 22px;
    }
    .analyst-kicker {color:#3568d4; font-size:.72rem; font-weight:800; letter-spacing:.16em;}
    .analyst-hero h1 {margin:.45rem 0 .55rem; color:#15243b; font-size:clamp(2.1rem,4vw,4.2rem); line-height:1.06; letter-spacing:-.045em;}
    .analyst-hero p {max-width:850px; margin:0; color:#526078; font-size:1rem; line-height:1.8;}
    .method-strip {display:flex; flex-wrap:wrap; gap:8px; margin-top:18px;}
    .method-strip span {padding:6px 10px; border:1px solid #dae2ef; border-radius:999px; background:#fff; color:#536078; font-size:.75rem; font-weight:650;}
    div[data-testid="stFileUploaderDropzone"] {border:1px dashed #bac7db; border-radius:16px; background:#fff;}
    div[data-testid="stMetric"] {padding:18px; border:1px solid var(--line); border-radius:16px; background:#fff; box-shadow:0 4px 14px rgba(24,39,75,.035);}
    .dependency-board {display:grid; gap:8px; padding:4px 0 10px;}
    .claim-node {
      position:relative;
      display:grid;
      grid-template-columns:110px minmax(120px,1fr) auto;
      gap:12px;
      min-height:48px;
      margin-left:calc(var(--depth) * 28px);
      padding:11px 14px;
      align-items:center;
      border:1px solid var(--line);
      border-radius:12px;
      background:#fff;
    }
    .claim-node-line {position:absolute; left:-16px; top:-14px; bottom:50%; width:14px; border-left:1px solid #b8c4d6; border-bottom:1px solid #b8c4d6;}
    .claim-node[style*="--depth:0"] .claim-node-line {display:none;}
    .claim-number {color:#193052; font-weight:800;}
    .claim-parent {color:#3568d4; font-size:.78rem; font-weight:650;}
    .claim-count {color:#768096; font-size:.72rem;}
    .analysis-note {padding:14px 16px; border-left:3px solid #3568d4; border-radius:0 10px 10px 0; background:#edf3ff; color:#31425f;}
    .small-note {color:#6f7b91; font-size:.78rem;}
    .heatmap-wrap {overflow:auto; padding:4px 0 12px;}
    .similarity-heatmap {width:100%; min-width:620px; border-collapse:separate; border-spacing:4px;}
    .similarity-heatmap th {max-width:180px; padding:8px; color:#5f6c82; font-size:.72rem; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .similarity-heatmap tbody th {text-align:right;}
    .similarity-heatmap td {min-width:68px; height:52px; padding:8px; border-radius:9px; font-size:.78rem; font-weight:800; text-align:center;}
    div[data-testid="stTabs"] button {font-weight:700;}
    iframe {border:0; border-radius:18px;}
    @media (max-width: 760px) {
      .analyst-hero {padding:26px 22px;}
      .claim-node {grid-template-columns:88px 1fr; margin-left:calc(var(--depth) * 14px);}
      .claim-count {grid-column:1 / -1;}
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <section class="analyst-hero">
      <div class="analyst-kicker">CLAIM CORPUS ANALYTICS / LOCAL</div>
      <h1>クレームを、件数ではなく<br>構造と距離で読む。</h1>
      <p>
        複数特許の親子関係を展開し、文章ベクトルの類似度と方向付きの要件カバレッジを分離して比較します。
        生成AI・外部APIは使わず、すべての点数から元の構成要件へ戻れます。
      </p>
      <div class="method-strip">
        <span>決定規則による従属解析</span>
        <span>展開クレーム</span>
        <span>文字n-gram TF-IDF</span>
        <span>方向付き要件カバレッジ</span>
        <span>No Generative AI</span>
      </div>
    </section>
    """,
    unsafe_allow_html=True,
)

uploaded_files = st.file_uploader(
    "複数の明細書PDF・請求項TXT・クレームCSVを投入",
    type=["pdf", "txt", "csv"],
    accept_multiple_files=True,
    help="CSVは patent_number / claim_number / claim_text 列、または日本語列名に対応します。",
)

if "manual_documents" not in st.session_state:
    st.session_state.manual_documents = []

with st.expander("請求項テキストを直接追加", expanded=False):
    with st.form("manual_claim_form", clear_on_submit=True):
        manual_number = st.text_input("特許・案件番号", placeholder="例: JP2026000001A")
        manual_text = st.text_area(
            "請求項テキスト",
            height=180,
            placeholder="【請求項1】から始まる請求項テキスト",
        )
        add_manual = st.form_submit_button("コーパスへ追加", type="primary")
        if add_manual and manual_text.strip():
            st.session_state.manual_documents.append(
                {
                    "patent_number": manual_number.strip() or f"TEXT-{len(st.session_state.manual_documents) + 1}",
                    "source_name": "直接入力",
                    "claims_text": manual_text,
                }
            )

records = list(st.session_state.manual_documents)
import_errors = []
for uploaded_file in uploaded_files or []:
    try:
        records.extend(
            extract_uploaded_documents(uploaded_file.name, uploaded_file.getvalue())
        )
    except Exception as exc:
        import_errors.append(f"{uploaded_file.name}: {exc}")

with st.expander("JP7362171B1 テスト出力", expanded=False):
    st.caption("回帰テストに使用している8請求項です。通常のコーパスには自動追加されません。")
    include_demo = st.checkbox("JP7362171B1を今回のコーパスへ追加")
    if include_demo:
        records.append(
            {
                "patent_number": "JP7362171B1",
                "source_name": "テスト fixture",
                "claims_text": (ROOT / "tests/fixtures/jp7362171_claims.txt").read_text(
                    encoding="utf-8"
                ),
            }
        )

for error in import_errors:
    st.error(error)

documents = []
document_records = []
for record in records:
    document = make_document(record)
    if document.claims:
        documents.append(document)
        document_records.append(record)

if not documents:
    st.info(
        "まず2件以上を投入すると、類似度ヒートマップと方向付き含有比較が有効になります。"
        "1件だけでも親子関係と展開クレームを確認できます。"
    )
    st.stop()

total_claims = sum(len(document.claims) for document in documents)
independent_claim_count = sum(
    claim.independent
    for document in documents
    for claim in document.claims.values()
)
metric_columns = st.columns(4)
metric_columns[0].metric("分析文献", f"{len(documents)}件")
metric_columns[1].metric("全請求項", f"{total_claims}項")
metric_columns[2].metric("独立項", f"{independent_claim_count}項")
metric_columns[3].metric("分析方式", "非生成・ローカル")

overview_tab, similarity_tab, pair_tab, detail_tab = st.tabs(
    ["コーパス・親子構造", "類似度マップ", "方向付き含有・対比", "単一特許の詳細"]
)

with overview_tab:
    st.subheader("コーパス一覧")
    st.dataframe(
        pd.DataFrame([document_summary(document) for document in documents]),
        width="stretch",
        hide_index=True,
    )
    st.subheader("請求項の親子関係と継承量")
    selected_overview = st.selectbox(
        "表示する特許",
        range(len(documents)),
        format_func=lambda index: unique_labels(documents)[index],
        key="overview_document",
    )
    render_dependency_structure(documents[selected_overview])
    st.caption(
        "「展開後」は、当該従属項の固有要件に祖先クレームの要件を加えた比較用表現です。"
    )

with similarity_tab:
    st.subheader("特許間のクレーム類似度")
    if len(documents) < 2:
        st.info("類似度マップには2件以上の文献が必要です。")
    else:
        matrix = similarity_matrix(documents)
        render_similarity_heatmap(matrix)
        st.caption(
            "全コーパス共通の文字n-gram TF-IDF空間で独立項をベクトル化し、"
            "相互の最良対応を平均した対称指標です。"
        )
        st.subheader("方向付き要件カバレッジ候補")
        candidates = containment_candidates(documents, matrix.values)
        if candidates:
            candidate_frame = pd.DataFrame(candidates)
            candidate_frame["文章類似度"] = candidate_frame["文章類似度"].map(
                lambda value: f"{value:.0%}"
            )
            candidate_frame["要件カバレッジ"] = candidate_frame[
                "要件カバレッジ"
            ].map(lambda value: f"{value:.0%}")
            st.dataframe(
                candidate_frame,
                width="stretch",
                hide_index=True,
            )
        else:
            st.info("現在の閾値を超える方向付きカバレッジ候補はありません。")
        st.caption(
            "矢印は法的な権利範囲の包含ではなく、左側クレームの要件が右側で"
            "対応しやすいことを示す分析候補です。"
        )

with pair_tab:
    st.subheader("クレームペアの方向付き比較")
    if len(documents) < 2:
        st.info("方向付き比較には2件以上の文献が必要です。")
    else:
        labels = unique_labels(documents)
        patent_columns = st.columns(2)
        left_index = patent_columns[0].selectbox(
            "特許 A",
            range(len(documents)),
            format_func=lambda index: labels[index],
            key="left_patent",
        )
        right_candidates = [index for index in range(len(documents)) if index != left_index]
        right_index = patent_columns[1].selectbox(
            "特許 B",
            right_candidates,
            format_func=lambda index: labels[index],
            key="right_patent",
        )
        left_document = documents[left_index]
        right_document = documents[right_index]
        left_numbers, right_numbers, default_left, default_right = best_pair_options(
            left_document,
            right_document,
        )
        claim_columns = st.columns(2)
        left_number = claim_columns[0].selectbox(
            "比較する請求項 A",
            left_numbers,
            index=default_left,
            format_func=lambda number: f"請求項{number}",
            key=f"left_claim_{left_index}_{right_index}",
        )
        right_number = claim_columns[1].selectbox(
            "比較する請求項 B",
            right_numbers,
            index=default_right,
            format_func=lambda number: f"請求項{number}",
            key=f"right_claim_{left_index}_{right_index}",
        )
        left_claim = left_document.claims[left_number]
        right_claim = right_document.claims[right_number]
        similarity = text_similarity(left_claim.expanded_text, right_claim.expanded_text)
        coverage_ab = requirement_coverage(left_claim, right_claim)
        coverage_ba = requirement_coverage(right_claim, left_claim)

        comparison_metrics = st.columns(3)
        comparison_metrics[0].metric("文章類似度 A ↔ B", f"{similarity:.0%}")
        comparison_metrics[1].metric("要件カバレッジ A → B", f"{coverage_ab:.0%}")
        comparison_metrics[2].metric("要件カバレッジ B → A", f"{coverage_ba:.0%}")
        st.markdown(
            f'<div class="analysis-note">{pair_interpretation(coverage_ab, coverage_ba)}'
            " 法的な包含・侵害判断ではなく、読むべき組合せを絞るための構造指標です。</div>",
            unsafe_allow_html=True,
        )

        text_columns = st.columns(2)
        with text_columns[0]:
            st.markdown(f"**{left_document.label} / 請求項{left_number}**")
            st.text_area(
                "A 展開クレーム",
                left_claim.expanded_text,
                height=220,
                disabled=True,
                label_visibility="collapsed",
            )
        with text_columns[1]:
            st.markdown(f"**{right_document.label} / 請求項{right_number}**")
            st.text_area(
                "B 展開クレーム",
                right_claim.expanded_text,
                height=220,
                disabled=True,
                label_visibility="collapsed",
            )

        st.subheader("構成要件対比表 A → B")
        render_claim_chart(left_claim, right_claim)
        with st.expander("逆方向 B → A の未対応・追加要件を確認", expanded=False):
            render_claim_chart(right_claim, left_claim)

with detail_tab:
    st.subheader("単一特許ドリルダウン")
    st.caption("複数特許分析で気になった文献を、従来の構造ビューで精読します。")
    selected_detail = st.selectbox(
        "詳細表示する特許",
        range(len(documents)),
        format_func=lambda index: unique_labels(documents)[index],
        key="detail_document",
    )
    selected_document = documents[selected_detail]
    source_record = document_records[selected_detail]
    initial_data = {
        "claimsText": source_record["claims_text"],
        "patentNumber": selected_document.patent_number,
        "sourceName": selected_document.source_name,
    }
    components.html(build_embedded_app(initial_data), height=2600, scrolling=True)
