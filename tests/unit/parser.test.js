import { describe, it, expect, beforeAll } from "vitest";

const { QuizAi } = window;

beforeAll(async () => {
  QuizAi.$ ||= (id) => document.getElementById(id);
  await import("../../public/assets/js/parser.js");
});

function loadScripts() {
  QuizAi.$ ||= (id) => document.getElementById(id);
  QuizAi.escapeHtml ||= (s) => {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML.replace(/\n/g, "<br/>");
  };
}

describe("stripMd", () => {
  beforeAll(loadScripts);

  it("removes **bold** markers", () => {
    expect(QuizAi.stripMd("**hello** world")).toBe("hello world");
  });

  it("removes *italic* markers", () => {
    expect(QuizAi.stripMd("*hello* world")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(QuizAi.stripMd("  **foo**  ")).toBe("foo");
  });

  it("handles empty string", () => {
    expect(QuizAi.stripMd("")).toBe("");
  });

  it("handles mixed bold and italic", () => {
    expect(QuizAi.stripMd("**bold** and *italic*")).toBe("bold and italic");
  });
});

describe("parseQuizText", () => {
  beforeAll(loadScripts);

  it("parses a simple quiz with 4 options", () => {
    const text = ["1. What is 2+2?", "A) 3", "B) 4", "C) 5", "D) 6", "Risposta: B"].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].stem).toBe("What is 2+2?");
    expect(result[0].options.A).toBe("3");
    expect(result[0].options.B).toBe("4");
    expect(result[0].options.C).toBe("5");
    expect(result[0].options.D).toBe("6");
    expect(result[0].correct).toBe("B");
    expect(result[0].hint).toBe("");
  });

  it("parses markdown-style header ### **1. ...**", () => {
    const text = [
      "### **1. What is the capital of Italy?**",
      "A) Milan",
      "B) Rome",
      "C) Naples",
      "D) Turin",
      "Risposta: B",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].stem).toBe("What is the capital of Italy?");
    expect(result[0].correct).toBe("B");
  });

  it("parses hint lines", () => {
    const text = [
      "1. What color is the sky?",
      "A) Red",
      "B) Blue",
      "C) Green",
      "D) Yellow",
      "Risposta: B",
      "Suggerimento: Look up during the day",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].hint).toBe("Look up during the day");
  });

  it("parses English hint", () => {
    const text = [
      "1. What is water?",
      "A) H2O",
      "B) CO2",
      "C) NaCl",
      "D) HCl",
      "Risposta: A",
      "Hint: Two hydrogen, one oxygen",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].hint).toBe("Two hydrogen, one oxygen");
  });

  it("parses multi-line stem", () => {
    const text = [
      "1. Which of the following",
      "are prime numbers?",
      "A) 4",
      "B) 7",
      "C) 9",
      "D) 12",
      "Risposta: B",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].stem).toContain("prime numbers");
    expect(result[0].stem).toContain("following");
  });

  it("parses multi-line options", () => {
    const text = [
      "1. Choose the correct statement:",
      "A) This is option A",
      "that spans two lines",
      "B) Option B",
      "C) Option C",
      "D) Option D",
      "Risposta: A",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].options.A).toContain("spans two lines");
  });

  it("parses multiple questions", () => {
    const text = [
      "1. Q1",
      "A) A1",
      "B) A2",
      "C) A3",
      "D) A4",
      "Risposta: A",
      "",
      "2. Q2",
      "A) B1",
      "B) B2",
      "C) B3",
      "D) B4",
      "Risposta: B",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(2);
    expect(result[0].stem).toBe("Q1");
    expect(result[1].stem).toBe("Q2");
    expect(result[0].correct).toBe("A");
    expect(result[1].correct).toBe("B");
  });

  it("handles dot or parenthesis after option letter", () => {
    const text = [
      "1. Test",
      "A. Option A",
      "B: Option B",
      "C) Option C",
      "D. Option D",
      "Risposta: A",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].options.A).toBe("Option A");
    expect(result[0].options.B).toBe("Option B");
    expect(result[0].options.C).toBe("Option C");
    expect(result[0].options.D).toBe("Option D");
  });

  it("returns empty array for invalid input", () => {
    expect(QuizAi.parseQuizText("")).toEqual([]);
    expect(QuizAi.parseQuizText("Some random text")).toEqual([]);
    expect(QuizAi.parseQuizText("No options here")).toEqual([]);
  });

  it("skips questions missing options", () => {
    const text = ["1. Q1", "A) Only one", "Risposta: A"].join("\n");
    const result = QuizAi.parseQuizText(text);
    expect(result).toEqual([]);
  });

  it("handles horizontal rules between questions", () => {
    const text = [
      "1. Q1",
      "A) A1",
      "B) A2",
      "C) A3",
      "D) A4",
      "Risposta: A",
      "---",
      "2. Q2",
      "A) B1",
      "B) B2",
      "C) B3",
      "D) B4",
      "Risposta: B",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(2);
  });

  it("handles emoji or marker before Risposta", () => {
    const text = ["1. Test", "A) Op A", "B) Op B", "C) Op C", "D) Op D", "✅ Risposta: A"].join(
      "\n",
    );

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].correct).toBe("A");
  });

  it("correctly assigns sourceIndex starting from 1", () => {
    const text = [
      "intro text",
      "",
      "1. Q1",
      "A) A1",
      "B) A2",
      "C) A3",
      "D) A4",
      "Risposta: A",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result).toHaveLength(1);
    expect(result[0].sourceIndex).toBe(1);
  });

  it("parses questions with bold formatting in options", () => {
    const text = [
      "1. Which is correct?",
      "A) **bold option**",
      "B) normal",
      "C) *italic*",
      "D) plain",
      "Risposta: A",
    ].join("\n");

    const result = QuizAi.parseQuizText(text);
    expect(result[0].options.A).toBe("bold option");
    expect(result[0].options.C).toBe("italic");
  });

  it("handles lowercase option letters", () => {
    const text = ["1. Test", "a) First", "b) Second", "c) Third", "d) Fourth", "Risposta: a"].join(
      "\n",
    );

    const result = QuizAi.parseQuizText(text);
    expect(result[0].options.A).toBe("First");
    expect(result[0].correct).toBe("A");
  });
});
