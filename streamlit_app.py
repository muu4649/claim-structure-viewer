import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from document_import import extract_uploaded_document


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
    html = html.replace(
        "</head>",
        f"<script>window.CLAIMGRAPH_IMPORT = {payload};</script></head>",
    )
    return html


st.set_page_config(
    page_title="ClaimGraph Viewer",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    .block-container {max-width: 100%; padding: 0 0 2rem;}
    header[data-testid="stHeader"] {background: rgba(255,255,255,.9);}
    iframe {border: 0;}
    div[data-testid="stFileUploader"] {
      max-width: 1480px;
      margin: 1rem auto .5rem;
      padding: 0 2.5rem;
    }
    div[data-testid="stFileUploaderDropzone"] {
      border: 1px dashed #c8ced8;
      border-radius: 16px;
      background: #f8f9fb;
    }
    div[data-testid="stExpander"] {
      max-width: 1480px;
      margin: .5rem auto;
    }
    .import-note {
      max-width: 1400px;
      margin: 1rem auto 0;
      padding: 0 2.5rem;
      color: #717887;
      font-size: .82rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    '<p class="import-note">明細書PDFまたは請求項テキストを選択すると、'
    "生成AIや外部APIを使わずに請求項部分を抽出して下の分析画面へ読み込みます。</p>",
    unsafe_allow_html=True,
)

uploaded_file = st.file_uploader(
    "明細書PDF / 請求項テキストをインポート",
    type=["pdf", "txt"],
    accept_multiple_files=False,
)

initial_data = {}
if uploaded_file is not None:
    try:
        imported = extract_uploaded_document(uploaded_file.name, uploaded_file.getvalue())
        initial_data = {
            "claimsText": imported["claims_text"],
            "patentNumber": imported["patent_number"],
            "sourceName": imported["source_name"],
        }
        st.success(
            f"{uploaded_file.name} から請求項テキストを抽出しました。"
            f"文字数: {len(imported['claims_text']):,}"
        )
    except Exception as exc:
        st.error(f"文書を読み込めませんでした: {exc}")

with st.expander("JP7362171B1 テスト結果・運用上の注意", expanded=False):
    st.markdown(
        """
        - PDF公報 `JP7362171B1` 由来の全8請求項で回帰テスト
        - 請求項5: 請求項4への従属、深度2を確認
        - 請求項8: 独立方法クレーム、対象請求項1〜7を確認
        - 生成AI・外部APIは不使用
        - 現在は決定規則版。請求対象・要素・属性・関係・工程・機能効果へ仮分類
        - 非生成BERT境界・構成タイプ分類器向けの学習データ出力に対応
        - 入力欄へ貼り付けた請求項は、この埋め込み画面内のJavaScriptで処理

        自動分割・意味分類・相対限定度は法的判断ではなく、確認用の下書きです。
        """
    )

components.html(build_embedded_app(initial_data), height=2800, scrolling=True)
