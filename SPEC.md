# ClaimGraph Viewer MVP仕様

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
