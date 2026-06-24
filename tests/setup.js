import { vi } from "vitest";

vi.stubGlobal("window", {
  ...window,
  QuizAi: {},
});

vi.stubGlobal("location", {
  protocol: "http:",
  hostname: "localhost",
  href: "http://localhost/",
});

vi.stubGlobal("localStorage", {
  _data: {},
  getItem(key) {
    return this._data[key] ?? null;
  },
  setItem(key, val) {
    this._data[key] = String(val);
  },
  removeItem(key) {
    delete this._data[key];
  },
  clear() {
    this._data = {};
  },
});

vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(cb, 16));
vi.stubGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
