import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // dom.js attaches to window.QuizAi. In jsdom env, document is already available.
  require("../../public/assets/js/dom.js");
});

describe("$", () => {
  it("returns element by id", () => {
    document.body.innerHTML = '<div id="root">hello</div>';
    const el = window.QuizAi.$("root");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("hello");
  });

  it("returns null for non-existent id", () => {
    const el = window.QuizAi.$("nonexistent");
    expect(el).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    const result = window.QuizAi.escapeHtml("<script>alert('xss')</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;");
  });

  it("converts newlines to <br/>", () => {
    const result = window.QuizAi.escapeHtml("line1\nline2");
    expect(result).toContain("<br/>");
  });

  it("handles plain text unchanged", () => {
    const result = window.QuizAi.escapeHtml("hello world");
    expect(result).toBe("hello world");
  });

  it("handles ampersands", () => {
    const result = window.QuizAi.escapeHtml("a & b");
    expect(result).toContain("&amp;");
  });
});
