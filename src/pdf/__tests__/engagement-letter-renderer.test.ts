/**
 * Engagement-letter renderer (Req #29, Stage 1) — pure HTML, no browser.
 */

import { describe, test, expect } from "vitest";
import {
  renderEngagementLetterHtml,
  letterMarkdownToHtml,
} from "../engagement-letter-renderer";

describe("letterMarkdownToHtml", () => {
  test("renders headings, bold, hr and paragraphs", () => {
    const html = letterMarkdownToHtml("# Title\n\n## Sub\n\nA **bold** line.\n\n---");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Sub</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<hr/>");
  });

  test("escapes HTML in content", () => {
    const html = letterMarkdownToHtml("Hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("highlights remaining gaps (placeholders + unfilled tokens)", () => {
    const html = letterMarkdownToHtml("Albo n. [PLACEHOLDER: ordine] for {{client_residence}}");
    expect(html).toContain('<span class="gap">[PLACEHOLDER: ordine]</span>');
    expect(html).toContain('<span class="gap">{{client_residence}}</span>');
  });
});

describe("renderEngagementLetterHtml", () => {
  test("produces a full branded A4 draft document", () => {
    const html = renderEngagementLetterHtml({
      bodyMd: "# Lettera di Incarico\n\nCorpo della lettera.",
      documentName: "Lettera di Incarico Professionale",
      versionLabel: "v1",
      language: "it",
      draft: true,
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("@page");
    expect(html).toContain("Roberto Scrigna");
    expect(html).toContain("v1");
    expect(html).toContain("BOZZA / ANTEPRIMA");
    expect(html).toContain("Corpo della lettera.");
  });
});
