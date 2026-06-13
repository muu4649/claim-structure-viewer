# Streamlit Community Cloudへの配備

## 1. このフォルダだけをGitHubへ置く

親フォルダには別案件のファイルがあるため、`claim-structure-viewer` を独立した
GitHubリポジトリにする。

最低限、次のファイルを含める。

```text
claim-structure-viewer/
├── .streamlit/config.toml
├── app.js
├── document_import.py
├── index.html
├── requirements.txt
├── streamlit_app.py
└── styles-v2.css
```

テスト、仕様書、READMEもそのまま含めてよい。

## 2. GitHubへpushする

新しい空のGitHubリポジトリを作成した後、このフォルダで実行する。

```bash
git init
git add .
git commit -m "Initial ClaimGraph Viewer"
git branch -M main
git remote add origin https://github.com/USER/claim-structure-viewer.git
git push -u origin main
```

`USER` はGitHubユーザー名へ置き換える。

## 3. Community Cloudで作成する

1. https://share.streamlit.io/ を開き、GitHubでログインする。
2. `Create app` を選択する。
3. Repositoryに作成したリポジトリを指定する。
4. Branchは `main` を指定する。
5. Main file pathは `streamlit_app.py` を指定する。
6. Advanced settingsのPython versionは `3.12` を指定する。
7. Deployを実行する。

アプリがサブフォルダにある構成で配備する場合のMain file pathは
`claim-structure-viewer/streamlit_app.py` とする。

## 4. 更新方法

ローカルで修正してGitHubへpushすると、Community Cloud側へ自動反映される。

```bash
git add .
git commit -m "Update claim parser"
git push
```

## 情報管理

- 生成AI・外部解析APIは使用していない。
- PDF/TXTはStreamlitサーバー上で請求項部分を抽出し、構造解析は埋め込み画面内のJavaScriptで処理する。
- Community Cloudは外部クラウドサービスであるため、未公開出願や秘密情報の
  入力可否は所属組織の情報管理基準に従う。
