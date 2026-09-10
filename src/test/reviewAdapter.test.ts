import * as assert from "assert";

import {
  buildOllamaChatRequest,
  deriveReviewView,
  escapeHtml,
  extractOllamaChatContent,
  parseReviewResult,
  renderSafeSummary,
  REVIEW_PROMPT_VERSION,
  REVIEW_SCHEMA,
  validateEndpoint,
  type ReviewResult,
} from "../reviewAdapter";

function result(): ReviewResult {
  return {
    schema_version: "review-prediction-v1.0.0",
    issues: [
      {
        issue_type: "runtime",
        severity: "high",
        line_start: 10,
        line_end: 10,
        description: "Empty input causes division by zero.",
        evidence: "The divisor uses len(items) without an empty guard.",
        trigger: "items is empty",
        suggestion: "Handle empty input before dividing.",
      },
    ],
    quality_findings: [
      {
        finding_type: "dead_code",
        line_start: 11,
        line_end: 11,
        description: "This statement is unreachable.",
        evidence: "The preceding statement always returns from the function.",
        suggestion: "Remove the unreachable statement.",
      },
    ],
  };
}

const scope = { startLine: 10, endLine: 11 };

suite("review adapter payload", () => {
  test("builds a schema-constrained /api/chat request", () => {
    const request = buildOllamaChatRequest({
      endpoint: "http://127.0.0.1:11434",
      model: "qwen2.5-coder:7b",
      code: "first()\nsecond()",
      fileName: "sample.py",
      scope,
    });

    assert.strictEqual(request.url, "http://127.0.0.1:11434/api/chat");
    const body = request.body as {
      model: string;
      messages: { role: string; content: string }[];
      format: unknown;
      stream: boolean;
      options: { temperature: number };
    };
    assert.strictEqual(body.model, "qwen2.5-coder:7b");
    assert.strictEqual(body.stream, false);
    assert.strictEqual(body.options.temperature, 0);
    assert.strictEqual(body.format, REVIEW_SCHEMA);
    assert.strictEqual(body.messages.length, 2);
    assert.ok(body.messages[0].content.includes(REVIEW_PROMPT_VERSION));
    assert.ok(body.messages[1].content.includes("10 | first()"));
    assert.ok(body.messages[1].content.includes("11 | second()"));
  });

  test("rejects empty code, scope mismatch and bad temperature", () => {
    assert.throws(
      () =>
        buildOllamaChatRequest({
          endpoint: "http://127.0.0.1:11434",
          model: "llama3",
          code: "   ",
          fileName: "sample.py",
          scope,
        }),
      /non-empty Python code/,
    );
    assert.throws(
      () =>
        buildOllamaChatRequest({
          endpoint: "http://127.0.0.1:11434",
          model: "llama3",
          code: "only()",
          fileName: "sample.py",
          scope,
        }),
      /do not match/,
    );
    assert.throws(
      () =>
        buildOllamaChatRequest({
          endpoint: "http://127.0.0.1:11434",
          model: "llama3",
          code: "first()\nsecond()",
          fileName: "sample.py",
          scope,
          temperature: 5,
        }),
      /Temperature/,
    );
  });

  test("blocks non-loopback endpoints unless opted in", () => {
    assert.throws(
      () => validateEndpoint("https://ollama.example.com"),
      /Non-loopback/,
    );
    assert.strictEqual(
      validateEndpoint("https://ollama.example.com", true).hostname,
      "ollama.example.com",
    );
    assert.strictEqual(
      validateEndpoint("http://localhost:11434").hostname,
      "localhost",
    );
    assert.throws(() => validateEndpoint("ftp://localhost"), /HTTP\(S\)/);
    assert.throws(() => validateEndpoint("not a url"), /valid URL/);
  });
});

suite("strict review-prediction-v1 parsing", () => {
  test("accepts a valid payload unchanged", () => {
    assert.deepStrictEqual(
      parseReviewResult(JSON.stringify(result()), scope),
      result(),
    );
  });

  test("rejects markdown fences and invalid JSON without fallback", () => {
    assert.throws(
      () => parseReviewResult("```json\n{}\n```", { startLine: 1, endLine: 1 }),
      /invalid JSON/,
    );
  });

  test("rejects legacy free-form fields and missing arrays", () => {
    assert.throws(
      () =>
        parseReviewResult(
          JSON.stringify({ ...result(), final_verdict: "pass" }),
          scope,
        ),
      /review-prediction-v1/,
    );
    assert.throws(
      () =>
        parseReviewResult(
          JSON.stringify({
            correctness_issues: [],
            edge_cases: [],
            final_verdict: "pass",
          }),
          scope,
        ),
      /review-prediction-v1/,
    );
  });

  test("rejects out-of-scope lines and whitespace-only text", () => {
    assert.throws(
      () =>
        parseReviewResult(JSON.stringify(result()), {
          startLine: 1,
          endLine: 9,
        }),
      /outside reviewed lines/,
    );

    const whitespace = result();
    whitespace.issues[0].description = "     ";
    assert.throws(
      () => parseReviewResult(JSON.stringify(whitespace), scope),
      /non-whitespace/,
    );
  });
});

suite("derived view and error handling", () => {
  test("derives verdict, severity and zero-based diagnostics", () => {
    const view = deriveReviewView(result());

    assert.strictEqual(view.verdict, "primary_issues_found");
    assert.strictEqual(view.diagnostics.length, 1);
    assert.strictEqual(view.diagnostics[0].code, "runtime");
    assert.strictEqual(view.diagnostics[0].severity, "error");
    assert.strictEqual(view.diagnostics[0].startLine, 9);
    assert.strictEqual(view.diagnostics[0].endLine, 9);
    assert.strictEqual(view.qualityFindings.length, 1);

    const qualityOnly = result();
    qualityOnly.issues = [];
    const emptyView = deriveReviewView(qualityOnly);
    assert.strictEqual(emptyView.verdict, "no_primary_issues");
    assert.strictEqual(emptyView.diagnostics.length, 0);
  });

  test("validates the Ollama chat envelope before parsing", () => {
    assert.strictEqual(
      extractOllamaChatContent(
        { model: "qwen2.5-coder:7b", message: { content: "{}" }, done: true },
        "qwen2.5-coder:7b",
      ),
      "{}",
    );
    assert.throws(
      () =>
        extractOllamaChatContent(
          { model: "other:latest", message: { content: "{}" }, done: true },
          "qwen2.5-coder:7b",
        ),
      /different model/,
    );
    assert.throws(
      () =>
        extractOllamaChatContent(
          { model: "qwen2.5-coder:7b", message: { content: "{}" } },
          "qwen2.5-coder:7b",
        ),
      /incomplete chat response/,
    );
    assert.throws(
      () => extractOllamaChatContent({ response: "{}" }, "llama3"),
      /incomplete chat response/,
    );
  });

  test("escapes model-controlled strings in the summary", () => {
    const malicious = result();
    malicious.issues[0].description = "<script>globalThis.pwned = true</script>";
    malicious.quality_findings[0].evidence = '<img src=x onerror="alert(1)">';
    const html = renderSafeSummary(malicious, "0123456789abcdef01234567");

    assert.strictEqual(escapeHtml("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;");
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.throws(
      () => renderSafeSummary(result(), "short"),
      /nonce/,
    );
  });
});
