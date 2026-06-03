# AI Code Review Assistant (VS Code Extension)

VS Code extension that provides **structured AI-powered Python code review** using a locally hosted LLM via Ollama. The system is designed for **educational use and research in automated code evaluation techniques**.

---

## Overview

This project implements a lightweight code review assistant inside VS Code that analyzes selected Python code and returns structured feedback in JSON format. The model runs locally through **Ollama**, enabling reproducible experiments and controlled evaluation setups.

The tool is part of an academic thesis focused on **LLM-based code understanding and evaluation strategies**.

---

## Key Features

- AI-powered Python code review directly inside VS Code
- Structured JSON output (no free-form text)
- Local inference using Ollama (no external API dependency)
- Webview-based review visualization
- Strict prompt engineering for deterministic evaluation format
- Lightweight and extensible architecture

---

## Architecture

- **Frontend:** VS Code Extension API (TypeScript)
- **Model runtime:** Ollama (local LLM inference)
- **Model used:** `llama3` (configurable)
- **Transport:** HTTP request to local Ollama server
- **Output:** Structured JSON parsed + rendered in Webview

---

## Workflow

1. User selects Python code in editor
2. Command `ai-code-review.reviewCode` is triggered
3. Selected code is embedded into a structured evaluation prompt
4. Prompt is sent to local Ollama endpoint
5. Model returns strict JSON response
6. Extension parses output and renders structured feedback UI

## Research Context (Thesis Component)

This project is designed as part of an academic thesis exploring:

### 1. Prompt Engineering Strategies
- Zero-shot vs few-shot prompting
- Role-based evaluation prompting
- Structured output enforcement (JSON constraints)

### 2. Code Analysis Approaches
- Prompt-only reasoning vs hybrid static-analysis + prompt input
- Error detection reliability across different prompt designs

### 3. Model Behavior Evaluation
- Consistency of small LLMs (e.g. Llama 3 small variants)
- Sensitivity to prompt structure
- Robustness of structured outputs under constrained decoding

### 4. Local LLM Deployment
- Offline inference using Ollama
- Reproducibility of experiments without API variability

---

## Technical Constraints

- Requires Ollama running locally  
- Default endpoint:http://localhost:11434/api/generate
- Model:llama3
- Requires VS Code API environment

---

## Limitations

- Model output is not guaranteed to always be valid JSON (handled via parsing fallback)
- Performance depends on local hardware
- No semantic execution of Python code (static analysis only through LLM reasoning)

---

## Future Improvements

- Integration with AST-based static analysis tools (e.g. `ast`, `pylint`)
- Multi-model comparison framework
- Fine-grained rubric scoring system
- Dataset logging for research evaluation
- Support for multiple programming languages


---

## Output Schema

The model is constrained to return:

```json
{
  "correctness_issues": [],
  "edge_cases": [],
  "code_quality": {
    "readability": "",
    "structure": ""
  },
  "complexity": {
    "time": "",
    "space": ""
  },
  "final_verdict": ""
}
