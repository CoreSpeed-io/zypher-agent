import os
import json
import csv
import glob
import re
import string
import warnings


def normalize_number_str(number_str: str) -> float:
    # we replace these common units and commas to allow
    # conversion to float
    for char in ["$", "%", ","]:
        number_str = number_str.replace(char, "")
    try:
        return float(number_str)
    except ValueError:
        print(f"String {number_str} cannot be normalized to number str.")
        return float("inf")


def split_string(
    s: str,
    char_list: list[str] = [",", ";"],
) -> list[str]:
    pattern = f"[{''.join(char_list)}]"
    return re.split(pattern, s)


def normalize_str(input_str, remove_punct=True) -> str:
    """
    Normalize a string by:
    - Removing all white spaces
    - Optionally removing punctuation (if remove_punct is True)
    - Converting to lowercase
    Parameters:
    - input_str: str, the string to normalize
    - remove_punct: bool, whether to remove punctuation (default: True)
    Returns:
    - str, the normalized string
    """
    # Remove all white spaces. Required e.g for seagull vs. sea gull
    no_spaces = re.sub(r"\s", "", input_str)

    # Remove punctuation, if specified.
    if remove_punct:
        translator = str.maketrans("", "", string.punctuation)
        return no_spaces.lower().translate(translator)
    else:
        return no_spaces.lower()


def question_scorer(
    model_answer: str,
    ground_truth: str,
) -> bool:
    def is_float(element: any) -> bool:
        try:
            float(element)
            return True
        except ValueError:
            return False
        
    if model_answer is None:
        model_answer = "None"

    # if gt is a number
    if is_float(ground_truth):
        print(f"Evaluating {model_answer} as a number.")
        normalized_answer = normalize_number_str(model_answer)
        return normalized_answer == float(ground_truth)

    # if gt is a list
    elif any(char in ground_truth for char in [",", ";"]):
        print(f"Evaluating {model_answer} as a comma separated list.")
        # question with the fish: normalization removes punct

        gt_elems = split_string(ground_truth)
        ma_elems = split_string(model_answer)

        # check length is the same
        if len(gt_elems) != len(ma_elems):
            warnings.warn(
                "Answer lists have different lengths, returning False.", UserWarning
            )
            return False

        # compare each element as float or str
        comparisons = []
        for ma_elem, gt_elem in zip(ma_elems, gt_elems):
            if is_float(gt_elem):
                normalized_ma_elem = normalize_number_str(ma_elem)
                comparisons.append(normalized_ma_elem == float(gt_elem))
            else:
                # we do not remove punct since comparisons can include punct
                comparisons.append(
                    normalize_str(ma_elem, remove_punct=False)
                    == normalize_str(gt_elem, remove_punct=False)
                )
        return all(comparisons)

    # if gt is a str
    else:
        print(f"Evaluating {model_answer} as a string.")
        return normalize_str(model_answer) == normalize_str(ground_truth)


def collect_answers_and_compare():
    """
    Collects answers from workspace directories and compares them with metadata.
    Creates a CSV file with the comparison results, organized by levels.
    """
    # Read the metadata.jsonl file
    metadata_file = 'bench/GAIA/2023/validation/metadata.jsonl'
    metadata = {}
    
    print("Reading metadata...")
    with open(metadata_file, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line.strip())
            metadata[data['task_id']] = {
                'answer': data['Final answer'],
                'level': data['Level']
            }
    
    print(f"Loaded {len(metadata)} entries from metadata")
    
    # Find all answer.txt files in workspace directories
    answer_files = glob.glob('bench/workspace/*/answer.txt')
    print(f"Found {len(answer_files)} answer files")
    
    results = []
    
    for answer_file in answer_files:
        # Extract task_id from the path
        task_id = os.path.basename(os.path.dirname(answer_file))
        
        # Read the answer file and strip "FINAL ANSWER: " prefix
        try:
            with open(answer_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content.startswith('FINAL ANSWER: '):
                    actual_answer = content[len('FINAL ANSWER: '):]
                else:
                    actual_answer = content
        except Exception as e:
            actual_answer = f"ERROR: {str(e)}"
        
        # Get expected answer and level from metadata
        task_metadata = metadata.get(task_id, {"answer": "NOT_FOUND", "level": 0})
        expected_answer = task_metadata['answer']
        level = task_metadata['level']
        
        # Use sophisticated scoring instead of simple equality
        if expected_answer == "NOT_FOUND" or actual_answer.startswith("ERROR:"):
            match = False
        else:
            match = question_scorer(actual_answer, expected_answer)
        
        results.append({
            'task_id': task_id,
            'expected_answer': expected_answer,
            'actual_answer': actual_answer,
            'level': level,
            'match': match
        })
    
    # Sort by task_id for consistent ordering
    results.sort(key=lambda x: x['task_id'])
    
    # Write to CSV
    csv_filename = 'answer_comparison.csv'
    with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['task_id', 'level', 'expected_answer', 'actual_answer', 'match']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        
        writer.writeheader()
        for result in results:
            writer.writerow(result)
    
    print(f"\nComparison completed. Results saved to {csv_filename}")
    print(f"Total tasks processed: {len(results)}")
    
    # Group results by level
    results_by_level = {}
    for result in results:
        level = result['level']
        if level not in results_by_level:
            results_by_level[level] = []
        results_by_level[level].append(result)
    
    # Print statistics by level
    print("\n" + "="*60)
    print("RESULTS BY LEVEL")
    print("="*60)
    
    level_percentages = []
    total_matches = 0
    total_tasks = 0
    
    for level in sorted(results_by_level.keys()):
        level_results = results_by_level[level]
        matches = sum(1 for r in level_results if r['match'])
        total = len(level_results)
        percentage = (matches / total * 100) if total > 0 else 0
        
        level_percentages.append(percentage)
        total_matches += matches
        total_tasks += total
        
        print(f"\nLevel {level}:")
        print(f"  Correct: {matches}/{total} ({percentage:.1f}%)")
        print(f"  Incorrect: {total - matches}")
        
        # Show mismatches for this level
        mismatches = [r for r in level_results if not r['match']]
        if mismatches:
            print(f"  Mismatches:")
            for result in mismatches:
                print(f"    {result['task_id']}: Expected '{result['expected_answer']}', Got '{result['actual_answer']}'")
    
    # Calculate and show overall average
    print("\n" + "="*60)
    print("OVERALL SUMMARY")
    print("="*60)
    
    if level_percentages:
        average_percentage = sum(level_percentages) / len(level_percentages)
        print(f"Average percentage across levels: {average_percentage:.1f}%")
    
    overall_percentage = (total_matches / total_tasks * 100) if total_tasks > 0 else 0
    print(f"Overall percentage (weighted): {overall_percentage:.1f}%")
    print(f"Total correct: {total_matches}/{total_tasks}")


if __name__ == "__main__":
    collect_answers_and_compare()
