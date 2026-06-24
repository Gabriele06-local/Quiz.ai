import { describe, it, expect, beforeAll } from "vitest";
import "../../public/assets/js/study-modes.js";

const { StudyModeUtils } = window.QuizAi;

describe("normalizeAnswer", () => {
  it("lowercases and trims", () => {
    expect(StudyModeUtils.normalizeAnswer("  Hello World  ")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(StudyModeUtils.normalizeAnswer("hello   world")).toBe("hello world");
  });

  it("normalizes unicode NFC", () => {
    const composed = "\u00E9";
    const decomposed = "\u0065\u0301";
    expect(StudyModeUtils.normalizeAnswer(decomposed)).toBe(
      StudyModeUtils.normalizeAnswer(composed),
    );
  });

  it("normalizes apostrophe variants (right single quotation mark)", () => {
    expect(StudyModeUtils.normalizeAnswer("don't")).toBe("don't");
    expect(StudyModeUtils.normalizeAnswer("don\u2019t")).toBe("don't");
    expect(StudyModeUtils.normalizeAnswer("don`t")).toBe("don't");
  });

  it("handles empty/null/undefined", () => {
    expect(StudyModeUtils.normalizeAnswer("")).toBe("");
    expect(StudyModeUtils.normalizeAnswer(null)).toBe("");
    expect(StudyModeUtils.normalizeAnswer(undefined)).toBe("");
  });
});

describe("openAnswersMatch", () => {
  it("exact match returns true", () => {
    expect(StudyModeUtils.openAnswersMatch("hello", "hello")).toBe(true);
  });

  it("case-insensitive match", () => {
    expect(StudyModeUtils.openAnswersMatch("Hello", "hello")).toBe(true);
  });

  it("normalized match", () => {
    expect(StudyModeUtils.openAnswersMatch("héllo", "he\u0301llo")).toBe(true);
  });

  it("returns true when shorter user input is contained in longer correct answer (within 60% length)", () => {
    expect(StudyModeUtils.openAnswersMatch("hello world", "hello")).toBe(true);
  });

  it("returns true when correct answer is contained in user input", () => {
    expect(StudyModeUtils.openAnswersMatch("the hello world example", "hello world")).toBe(true);
  });

  it("returns false for completely different answers", () => {
    expect(StudyModeUtils.openAnswersMatch("cat", "dog")).toBe(false);
  });

  it("returns false when one input is empty", () => {
    expect(StudyModeUtils.openAnswersMatch("", "hello")).toBe(false);
    expect(StudyModeUtils.openAnswersMatch("hello", "")).toBe(false);
  });

  it("returns false for single char mismatch", () => {
    expect(StudyModeUtils.openAnswersMatch("a", "b")).toBe(false);
  });

  it("returns false when user input is too short relative to correct answer", () => {
    expect(StudyModeUtils.openAnswersMatch("hello", "hello world")).toBe(false);
  });
});

describe("tryStemBlank", () => {
  it("replaces a word from correctText in the stem with _____", () => {
    const stem = "The capital of France is Paris";
    const correct = "Paris";
    const result = StudyModeUtils.tryStemBlank(stem, correct);
    expect(result).toBe("The capital of France is _____");
  });

  it("returns null for short correctText", () => {
    expect(StudyModeUtils.tryStemBlank("hello world", "ab")).toBeNull();
  });

  it("is case-insensitive when matching", () => {
    const stem = "Hello World";
    const correct = "world";
    const result = StudyModeUtils.tryStemBlank(stem, correct);
    expect(result).toBe("Hello _____");
  });

  it("returns null when no word matches", () => {
    const stem = "The sky is blue";
    const correct = "red";
    const result = StudyModeUtils.tryStemBlank(stem, correct);
    expect(result).toBeNull();
  });

  it("ignores words <= 2 chars in correctText", () => {
    const stem = "Foo bar baz";
    const correct = "a b";
    const result = StudyModeUtils.tryStemBlank(stem, correct);
    expect(result).toBeNull();
  });
});

describe("shuffleArray", () => {
  it("returns a new array with same elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = StudyModeUtils.shuffleArray(arr);
    expect(shuffled).not.toBe(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it("does not mutate original array", () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    StudyModeUtils.shuffleArray(arr);
    expect(arr).toEqual(copy);
  });

  it("handles empty array", () => {
    expect(StudyModeUtils.shuffleArray([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(StudyModeUtils.shuffleArray([42])).toEqual([42]);
  });
});
