# ClaimGraph Viewer MVP仕様

この文書は現行プロトタイプの仕様を記録する。次期版の主仕様は
[ANALYST_PRODUCT_STRATEGY.md](ANALYST_PRODUCT_STRATEGY.md) とし、複数特許の
クレーム類似度、方向付き要件カバレッジ、ペア対比を中心に再設計する。

## 情報モデル

```text
Patent
└─ Claim
   ├─ parents[]
   ├─ targetClaims[]: 方法クレームが対象とする製品クレーム
   ├─ type: product | method | system
   ├─ depth
   ├─ opennessProxy
   └─ Requirement[]
      ├─ category: structure | function | dynamic | condition
      ├─ role: category | element | attribute | relation | step | function
      ├─ concept
      ├─ text
      ├─ splitReason
      ├─ splitConfidence
      └─ patch: add | limit | replace | exclude
```

同一モデルから、請求項詳細、従属ツリー、マトリクス、相対限定度、DSLを生成する。

## 詳細分析

- 原文
- 独立・従属と親番号
- 独立方法クレームの対象請求項
- 継承要件数・固有要件数
- 構造・機能・動態の三層表示
- 請求対象・要素・属性・関係・工程・機能効果の構成タイプ表示
- 従属項の差分分類
- 構成要件の手動修正
- 過分割された要件の結合
- 境界信頼度と分割根拠の表示
- BERT境界分類用JSONLの出力
- 請求項ボタンによる一項選択
- 請求項1の主体を固定ルートとした選択項の祖先系譜
- 選択項と祖先に含まれる構成要素の参照・入れ子グラフ
- 起源、追加・限定、構成タイプ、意味層、上位要素を並べる継承対比表

## 文書インポート

- PDF、UTF-8/CP932/Shift-JISのTXT
- JPO公報に含まれる文字間空白の除去
- ページ番号・公報ヘッダーの除去
- 「特許請求の範囲」から「発明の詳細な説明」までの請求項部分抽出
- 生成AI・外部解析APIを使わないローカル処理

## マクロ分析

- 独立請求項数
- 最大依存深度
- 数値限定を持つ請求項数
- 従属項をさらに限定する段階的フォールバック数
- 請求項ツリー
- 構成要件×請求項マトリクス
- 構造的広がり代理指標
- 出願戦略上の確認観点

## 非目標

- 権利範囲の法的な広狭判定
- 侵害・有効性・進歩性判断
- 明細書・審査経過を含むクレーム解釈
- 自動出願戦略の決定
