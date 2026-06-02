import * as vscode from "vscode";
import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "llama3";

export function activate(context: vscode.ExtensionContext) {

  let disposable = vscode.commands.registerCommand(
    "ai-code-review.reviewCode",
    async () => {

      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const code = editor.document.getText(editor.selection);

      if (!code) {
        vscode.window.showErrorMessage("Select code first");
        return;
      }

      vscode.window.showInformationMessage("Analyzing code with Ollama...");

      const prompt = `
You are an expert Python code reviewer and software engineering evaluator.

Your role:
- STRICT and ANALYTICAL
- Evaluate code like in university grading or industrial code review

TASK:
Analyze the provided Python code and return structured feedback.

Follow these steps internally:
1. Understand code purpose
2. Detect correctness issues (bugs, logic errors)
3. Identify edge cases and failure scenarios
4. Evaluate code quality (readability, structure, best practices)
5. Estimate complexity if relevant

FEW-SHOT EXAMPLES:

EXAMPLE 1:
CODE:
def add(a, b):
    return a + b

OUTPUT:
{
  "correctness_issues": [],
  "edge_cases": [],
  "code_quality": {
    "readability": "high",
    "structure": "excellent"
  },
  "complexity": {
    "time": "O(1)",
    "space": "O(1)"
  },
  "final_verdict": "pass"
}

EXAMPLE 2:
CODE:
def divide(a, b):
    return a / b

OUTPUT:
{
  "correctness_issues": [
    "No handling of division by zero"
  ],
  "edge_cases": [
    "b can be zero causing runtime error"
  ],
  "code_quality": {
    "readability": "high",
    "structure": "good"
  },
  "complexity": {
    "time": "O(1)",
    "space": "O(1)"
  },
  "final_verdict": "needs_improvement"
}

RULES:
- Output MUST be valid JSON only
- No explanations outside JSON
- Be strict and consistent
- If uncertain, write "unknown"

CODE:
${code}
`;

      try {
        const response = await axios.post(OLLAMA_URL, {
          model: MODEL,
          prompt: prompt,
          stream: false,
          format: "json" // Strictly constrains Ollama to return ONLY valid JSON structures
        });

        const raw = response.data.response;

        let parsed;

        try {
          // Clean the output in case markdown backticks are returned
          const cleanedJson = extractJson(raw);
          parsed = JSON.parse(cleanedJson);
        } catch (e) {

          vscode.window.showErrorMessage("Model did not return valid JSON. Check console for output logs.");
          return;
        }

        const panel = vscode.window.createWebviewPanel(
          "codeReview",
          "AI Code Review",
          vscode.ViewColumn.One,
          {}
        );

        panel.webview.html = getWebviewContent(parsed);

      } catch (err) {
        vscode.window.showErrorMessage("Ollama request failed. Make sure Ollama is running locally.");
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function extractJson(rawStr: string): string {
  let cleaned = rawStr.trim();
  
  // Strip away markdown code fences (```json or ```) if the model still outputs them
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  }
  
  return cleaned;
}

function getWebviewContent(data: any) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #1e1e1e;
        color: #ffffff;
        padding: 20px;
      }

      .box {
        background: #2a2a2a;
        border-radius: 10px;
        padding: 15px;
        margin-bottom: 15px;
      }

      .title {
        color: #4fc3f7;
        font-size: 16px;
        margin-bottom: 8px;
        font-weight: bold;
      }

      ul {
        padding-left: 20px;
      }

      .verdict {
        font-size: 18px;
        font-weight: bold;
        color: #00e676;
      }
    </style>
  </head>

  <body>

    <div class="box">
      <div class="title">Final Verdict</div>
      <div class="verdict">${data.final_verdict || "N/A"}</div>
    </div>

    <div class="box">
      <div class="title">Code Quality</div>
      <div>Readability: ${data.code_quality?.readability || "N/A"}</div>
      <div>Structure: ${data.code_quality?.structure || "N/A"}</div>
    </div>

    <div class="box">
      <div class="title">Correctness Issues</div>
      <ul>
        ${(data.correctness_issues || []).map((i: string) => `<li>${i}</li>`).join("")}
      </ul>
    </div>

    <div class="box">
      <div class="title">Edge Cases</div>
      <ul>
        ${(data.edge_cases || []).map((i: string) => `<li>${i}</li>`).join("")}
      </ul>
    </div>

  </body>
  </html>
  `;
}
