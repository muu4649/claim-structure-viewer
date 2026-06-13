"""Fine-tune a non-generative encoder for patent claim boundary classification."""

import argparse
import json
import random
from pathlib import Path

from datasets import Dataset
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)


DEFAULT_MODEL = "tohoku-nlp/bert-base-japanese-v3"
CONTEXT_CHARS = 180


def read_annotations(path):
    rows = []
    with Path(path).open(encoding="utf-8") as source:
        for line in source:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def candidate(left, right, label, metadata):
    return {
        "left": left[-CONTEXT_CHARS:],
        "right": right[:CONTEXT_CHARS],
        "label": label,
        **metadata,
    }


def build_examples(rows):
    examples = []
    for row in rows:
        requirements = [text.strip() for text in row["requirements"] if text.strip()]
        metadata = {
            "patent_number": row.get("patentNumber", ""),
            "claim_number": row.get("claimNumber", 0),
        }

        for index in range(len(requirements) - 1):
            examples.append(
                candidate(
                    requirements[index],
                    requirements[index + 1],
                    1,
                    metadata,
                )
            )

        for requirement in requirements:
            for position, character in enumerate(requirement):
                if character not in "、;；":
                    continue
                left = requirement[:position]
                right = requirement[position + 1 :]
                if left and right:
                    examples.append(candidate(left, right, 0, metadata))
    return examples


def metrics(prediction):
    labels = prediction.label_ids
    predictions = prediction.predictions.argmax(axis=-1)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels,
        predictions,
        average="binary",
        zero_division=0,
    )
    return {
        "accuracy": accuracy_score(labels, predictions),
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("annotations", help="Exported claim-boundary-v1 JSONL")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--output", default="models/claim-boundary")
    parser.add_argument("--epochs", type=float, default=4)
    args = parser.parse_args()

    examples = build_examples(read_annotations(args.annotations))
    if len(examples) < 100:
        raise SystemExit(
            "At least 100 boundary candidates are required. "
            "For a useful model, collect corrections from 50-100 patents."
        )

    random.Random(42).shuffle(examples)
    split = max(1, int(len(examples) * 0.8))
    train_data = Dataset.from_list(examples[:split])
    eval_data = Dataset.from_list(examples[split:])

    tokenizer = AutoTokenizer.from_pretrained(args.model)

    def tokenize(batch):
        return tokenizer(
            batch["left"],
            batch["right"],
            truncation=True,
            max_length=384,
        )

    train_data = train_data.map(tokenize, batched=True)
    eval_data = eval_data.map(tokenize, batched=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model,
        num_labels=2,
        id2label={0: "CONTINUE", 1: "BOUNDARY"},
        label2id={"CONTINUE": 0, "BOUNDARY": 1},
    )

    training_args = TrainingArguments(
        output_dir=args.output,
        learning_rate=2e-5,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=16,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        report_to="none",
        seed=42,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_data,
        eval_dataset=eval_data,
        tokenizer=tokenizer,
        compute_metrics=metrics,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)


if __name__ == "__main__":
    main()
