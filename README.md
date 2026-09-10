# AI Code Review Assistant (VS Code Extension)

VS Code extension that provides **structured AI-powered Python code review** using a locally hosted LLM via Ollama. The system is designed for **educational use and research in automated code evaluation techniques**.

The extension is a standalone tool: it installs, runs and is used on its own, but it speaks the same public contract as the research backend in `nDusanN/bachelor-thesis` (`review-prediction-v1`).

---

## Overview

This project implements a code review assistant inside VS Code that analyzes selected Python code and returns a strictly validated structured review. The model runs locally through **Ollama**, enabling reproducible experiments and controlled evaluation setups.

The tool is part of an academic thesis focused on **LLM-based code understanding and evaluation strategies**.

---

## Key Features

- AI-powered Python code review directly inside VS Code
- Schema-constrained Ollama `/api/chat` request (`review-prediction-v1` JSON Schema as `format`)
- Strict, fail-closed parsing: invalid output is reported as an error, never rendered
- Primary issues published as **inline diagnostics** on the original source lines
- Non-scored quality findings kept separate from primary issues
- Verdict derived deterministically by the extension, never taken from the model
- Local inference using Ollama (no external API dependency), loopback-only by default
- Script-free webview summary with a restrictive CSP and full HTML escaping

---

## Architecture

- **Frontend:** VS Code Extension API (TypeScript)
- **Model runtime:** Ollama (local LLM inference)
- **Default model:** `qwen2.5-coder:7b` (configurable)
- **Transport:** HTTP `POST` to `<endpoint>/api/chat` (Axios, redirects disabled)
- **Contract:** `src/schemas/review-prediction-v1.schema.json`
- **Output:** validated `ReviewResult` rendered as diagnostics + webview summary

The contract logic lives in `src/reviewAdapter.ts`; `src/extension.ts` owns only VS Code lifecycle, settings, transport, diagnostics, and the panel.

---

## Workflow

1. User selects Python code in the editor
2. Command `ai-code-review.reviewCode` is triggered
3. The adapter builds a versioned `/api/chat` payload with original line numbers and the JSON Schema in `format`
4. The request goes to the configured local Ollama endpoint
5. The chat envelope is validated (model identity, `done`, message content)
6. The content is strictly validated against `review-prediction-v1`; scope, line ranges and minimum text lengths are enforced
7. Primary issues become inline diagnostics; the summary panel shows the derived verdict and the separate quality findings

Any failure in steps 4–6 produces an actionable error message and no review output.

---

## Requirements

- Ollama running locally (`ollama serve`)
- The configured model already installed (the extension never pulls models)
- VS Code `^1.120.0`

---

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `aiCodeReview.ollamaEndpoint` | `http://127.0.0.1:11434` | Base URL; `/api/chat` is appended |
| `aiCodeReview.model` | `qwen2.5-coder:7b` | Ollama model tag |
| `aiCodeReview.temperature` | `0` | Sampling temperature (0–1) |
| `aiCodeReview.allowNonLocalEndpoint` | `false` | Opt-in required before source leaves loopback |
| `aiCodeReview.requestTimeoutMs` | `120000` | Request timeout in milliseconds |

All settings are `machine`-scoped so a repository cannot redirect source code through workspace settings.

## Commands

- **AI Code Review** (`ai-code-review.reviewCode`) — review the current selection
- **AI Code Review: Clear Diagnostics** (`ai-code-review.clearDiagnostics`)

---

## Development

```bash
npm install
npm run compile   # tsc -p ./
npm run lint      # eslint src
npm test          # compile + lint + vscode-test (mocha)
```

Tests cover the request payload, strict parsing, derived view, Ollama envelope validation, endpoint policy, and HTML escaping.

---

## Output Schema

The model is constrained to `review-prediction-v1`:

```json
{
  "schema_version": "review-prediction-v1.0.0",
  "issues": [
    {
      "issue_type": "correctness | runtime | performance | security",
      "severity": "low | medium | high | critical",
      "line_start": 1,
      "line_end": 1,
      "description": "",
      "evidence": "",
      "trigger": null,
      "suggestion": ""
    }
  ],
  "quality_findings": [
    {
      "finding_type": "dead_code | duplication | excessive_complexity | excessive_length",
      "line_start": null,
      "line_end": null,
      "description": "",
      "evidence": "",
      "suggestion": ""
    }
  ]
}
```

`additionalProperties` is disallowed, both arrays are required, and there is no `final_verdict` field — the verdict is derived from `issues.length`.

---

## Research Context (Thesis Component)

This project is designed as part of an academic thesis exploring:

### 1. Prompt Engineering Strategies
- Zero-shot vs few-shot prompting
- Role-based evaluation prompting
- Structured output enforcement (JSON Schema constrained decoding)

### 2. Code Analysis Approaches
- Prompt-only reasoning vs hybrid static-analysis + prompt input
- Error detection reliability across different prompt designs

### 3. Model Behavior Evaluation
- Consistency of small LLMs
- Sensitivity to prompt structure
- Robustness of structured outputs under constrained decoding

### 4. Local LLM Deployment
- Offline inference using Ollama
- Reproducibility of experiments without API variability

The extension is an interactive demonstration only. It does not run experiments, load references, write predictions, or participate in scoring; it reuses only the public schema artifact produced by the research backend.

---

## Limitations

- Output that is not valid `review-prediction-v1` is rejected, so a weak model may produce no review at all
- Performance depends on local hardware
- No semantic execution of Python code (static reasoning by the LLM only)
- An empty `issues` list is not proof of correctness

---

## Future Improvements

- Integration with AST-based static analysis tools (e.g. `ast`, `pylint`)
- Multi-model comparison framework
- Fine-grained rubric scoring system
- Support for multiple programming languages
