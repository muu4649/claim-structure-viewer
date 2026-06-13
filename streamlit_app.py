import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent


def build_embedded_app() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles-v2.css").read_text(encoding="utf-8")
    javascript = (ROOT / "app.js").read_text(encoding="utf-8")

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
    return html


st.set_page_config(
    page_title="ClaimGraph Viewer",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    .block-container {max-width: 100%; padding: 0;}
    header[data-testid="stHeader"] {background: transparent;}
    iframe {border: 0;}
    </style>
    """,
    unsafe_allow_html=True,
)

with st.expander("テスト状況・運用上の注意", expanded=True):
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

components.html(build_embedded_app(), height=1800, scrolling=True)
