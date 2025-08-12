#!/usr/bin/env python3
"""
find_missing_level2.py

Usage:
    python find_missing_level2.py <csv_file> <jsonl_file>

Given a CSV file with columns (task_id, level, …) and a JSONL file whose
records contain "task_id" and "Level", this script lists every task_id that
has Level == 2 in the JSONL **and** is absent from the CSV.
"""

import csv
import json
import sys
from typing import Set, List


def load_level2_ids_from_csv(path: str) -> Set[str]:
    """Return the set of task_ids whose level is 2 in the CSV."""
    ids = set()
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("level", "").strip() == "2":
                ids.add(row["task_id"].strip())
    return ids


def find_missing_level2(csv_path: str, jsonl_path: str) -> list[str]:
    csv_level2_ids = load_level2_ids_from_csv(csv_path)
    missing = []

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj = json.loads(line)

            # --- fix starts here ---
            level_value = obj.get("Level", obj.get("level", None))
            if level_value is None:
                continue
            if str(level_value).strip() != "2":
                continue
            # --- fix ends here ---

            tid = obj["task_id"].strip()
            if tid not in csv_level2_ids:
                missing.append(tid)

    return missing


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python find_missing_level2.py <csv_file> <jsonl_file>")
        sys.exit(1)

    csv_file, jsonl_file = sys.argv[1], sys.argv[2]
    for task_id in find_missing_level2(csv_file, jsonl_file):
        print(task_id)
