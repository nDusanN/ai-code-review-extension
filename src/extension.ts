import { randomBytes } from "node:crypto";
import * as path from "node:path";

import axios from "axios";
import * as vscode from "vscode";

import {
  buildOllamaChatRequest,
  deriveReviewView,
  extractOllamaChatContent,
  parseReviewResult,
  renderSafeSummary,
  ReviewAdapterError,
  type DiagnosticRecord,
  type ReviewScope,
} from "./reviewAdapter";

const DIAGNOSTIC_SOURCE = "AI Code Review";

interface ReviewSettings {
  endpoint: string;
  model: string;
  temperature: number;
  allowNonLocalEndpoint: boolean;
  requestTimeoutMs: number;
}

function readSettings(): ReviewSettings {
  const config = vscode.workspace.getConfiguration("aiCodeReview");
  return {
    endpoint: config.get<string>("ollamaEndpoint", "http://127.0.0.1:11434"),
    model: config.get<string>("model", "qwen2.5-coder:7b"),
    temperature: config.get<number>("temperature", 0),
    allowNonLocalEndpoint: config.get<boolean>("allowNonLocalEndpoint", false),
    requestTimeoutMs: config.get<number>("requestTimeoutMs", 120_000),
  };
}

/**
 * A selection that ends at column zero does not actually cover that last line,
 * so it is excluded before the original line range is computed.
 */
export function selectionScope(selection: vscode.Selection): ReviewScope {
  const endLine =
    selection.end.character === 0 && selection.end.line > selection.start.line
      ? selection.end.line - 1
      : selection.end.line;
  return { startLine: selection.start.line + 1, endLine: endLine + 1 };
}

function toVSCodeSeverity(
  severity: DiagnosticRecord["severity"],
): vscode.DiagnosticSeverity {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

function publishDiagnostics(
  collection: vscode.DiagnosticCollection,
  document: vscode.TextDocument,
  records: DiagnosticRecord[],
): void {
  const diagnostics = records.map((record) => {
    const range = new vscode.Range(
      record.startLine,
      0,
      record.endLine,
      document.lineAt(record.endLine).text.length,
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `${record.message}\n\nSuggested remediation: ${record.suggestion}`,
      toVSCodeSeverity(record.severity),
    );
    diagnostic.code = record.code;
    diagnostic.source = DIAGNOSTIC_SOURCE;
    return diagnostic;
  });
  collection.set(document.uri, diagnostics);
}

function failureMessage(error: unknown): string {
  if (error instanceof ReviewAdapterError) {
    return error.message;
  }
  if (axios.isCancel(error)) {
    return "AI Code Review was cancelled.";
  }
  if (axios.isAxiosError(error)) {
    if (error.response !== undefined) {
      return `Ollama rejected the request with HTTP ${error.response.status}. No review is shown.`;
    }
    return "Ollama request failed. Make sure Ollama is running on the configured local endpoint.";
  }
  return "AI Code Review failed for an unexpected reason. No review is shown.";
}

async function reviewSelection(
  collection: vscode.DiagnosticCollection,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("Open a Python file and select code first.");
    return;
  }

  const document = editor.document;
  const code = document.getText(editor.selection);
  if (code.trim() === "") {
    vscode.window.showErrorMessage("Select non-empty Python code first.");
    return;
  }

  const settings = readSettings();
  const scope = selectionScope(editor.selection);
  const controller = new AbortController();

  try {
    const request = buildOllamaChatRequest({
      endpoint: settings.endpoint,
      model: settings.model,
      code,
      fileName: path.basename(document.fileName),
      scope,
      temperature: settings.temperature,
      allowNonLocalEndpoint: settings.allowNonLocalEndpoint,
    });

    const response = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing selected Python code with Ollama...",
        cancellable: true,
      },
      (_progress, token) => {
        token.onCancellationRequested(() => controller.abort());
        return axios.post(request.url, request.body, {
          timeout: settings.requestTimeoutMs,
          signal: controller.signal,
          maxRedirects: 0,
        });
      },
    );

    const raw = extractOllamaChatContent(
      response.data as unknown,
      settings.model,
    );
    const result = parseReviewResult(raw, scope);
    const view = deriveReviewView(result);

    publishDiagnostics(collection, document, view.diagnostics);

    const panel = vscode.window.createWebviewPanel(
      "codeReview",
      "AI Code Review",
      vscode.ViewColumn.One,
      { enableScripts: false, localResourceRoots: [] },
    );
    panel.webview.html = renderSafeSummary(
      result,
      randomBytes(18).toString("base64"),
    );
  } catch (error) {
    collection.delete(document.uri);
    vscode.window.showErrorMessage(failureMessage(error));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const collection =
    vscode.languages.createDiagnosticCollection("ai-code-review");
  context.subscriptions.push(collection);

  context.subscriptions.push(
    vscode.commands.registerCommand("ai-code-review.reviewCode", () =>
      reviewSelection(collection),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-code-review.clearDiagnostics", () => {
      collection.clear();
    }),
  );
}

export function deactivate(): void {}
