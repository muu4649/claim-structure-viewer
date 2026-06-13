# 非生成型・構成要件境界モデル

## 採用方針

初期モデルは `tohoku-nlp/bert-base-japanese-v3` を使う。

Model card: https://huggingface.co/tohoku-nlp/bert-base-japanese-v3

- Encoder-onlyで文章生成を行わない
- Apache 2.0
- 日本語の単語分割をモデル側のTokenizerで扱える
- 約BERT base規模で、量子化後は小規模CPU運用を狙える

比較候補は `ku-nlp/deberta-v2-base-japanese`。日本語NLU性能は有望だが、
Juman++による事前分かち書きとCC BY-SA 4.0への対応が必要になる。

Model card: https://huggingface.co/ku-nlp/deberta-v2-base-japanese

## 学習タスク

請求項内の読点・改行・列挙終端を境界候補とし、前後文脈から二値分類する。

```text
[CLS] 境界より前の文脈 [SEP] 境界より後の文脈 [SEP]
                           ↓
                    BOUNDARY / CONTINUE
```

生成は行わず、分類スコアだけを返す。

境界モデルの次段では、分割済み構成を次の6タイプへ分類するEncoder-onlyの
多クラス分類ヘッドを追加する。

```text
請求対象 / 要素 / 属性 / 関係 / 工程 / 機能・効果
```

画面から出力するJSONLには、境界正解に加えて `roles` を保存する。

## 運用

1. 構文ルールで初期分割
2. 画面上で結合・追加・文言修正
3. 「学習データ」からJSONLを出力
4. 50〜100公報以上の修正結果を蓄積
5. `ml/train_boundary_classifier.py` でfine-tuning
6. 境界F1と請求項単位の完全一致率を評価
7. ONNX INT8へ量子化して推論専用に配備

学習データが少ない間はモデル判定を主判定にせず、構文ルールを優先する。

## 評価指標

- Boundary precision / recall / F1
- 請求項単位の完全一致率
- 過分割率
- 未分割率
- 独立項・従属項別のF1
- 物・方法・システムカテゴリ別のF1
- 構成タイプ別macro F1
