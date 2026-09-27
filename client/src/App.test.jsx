import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.jsx";
import { HighlightedText } from "./HighlightedText.jsx";
import { normalizeUrl } from "./normalizeUrl.js";

// jsdom has no EventSource, and tests should not need a real server anyway.
class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = {};
    this.onerror = null;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  close() {
    this.closed = true;
  }

  emit(type, data) {
    act(() => {
      for (const handler of this.listeners[type] ?? []) {
        handler({ data: JSON.stringify(data) });
      }
    });
  }

  fail() {
    act(() => this.onerror?.(new Event("error")));
  }
}

const lastSource = () => FakeEventSource.instances.at(-1);

async function startScan(user, { url = "example.com", keyword = "react" } = {}) {
  await user.type(screen.getByLabelText("Website URL"), url);
  await user.type(screen.getByLabelText("Keyword"), keyword);
  await user.click(screen.getByRole("button", { name: "Find" }));
  return lastSource();
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

describe("App", () => {
  it("enables Find only when both fields are filled", async () => {
    const user = userEvent.setup();
    render(<App />);
    const find = screen.getByRole("button", { name: "Find" });

    expect(find).toBeDisabled();
    await user.type(screen.getByLabelText("Website URL"), "example.com");
    expect(find).toBeDisabled();
    await user.type(screen.getByLabelText("Keyword"), "react");
    expect(find).toBeEnabled();
  });

  it("opens one stream per scan with the normalized URL", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    const url = new URL(source.url, "http://localhost");
    expect(url.pathname).toBe("/api/scan");
    expect(url.searchParams.get("url")).toBe("https://example.com");
    expect(url.searchParams.get("keyword")).toBe("react");
  });

  it("starts a scan with the Enter key", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("Website URL"), "example.com");
    await user.type(screen.getByLabelText("Keyword"), "react{Enter}");
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("streams matches live and highlights them regardless of case", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    source.emit("status", { state: "scrolling" });
    source.emit("matches", { newMatches: ["React is great", "I like REACT"], total: 2 });
    expect(screen.getByRole("status")).toHaveTextContent("2 found so far");

    source.emit("done", { total: 2, truncated: false, timedOut: false });

    expect(screen.getByRole("heading", { name: "Results (2)" })).toBeInTheDocument();
    const marks = screen.getAllByText((_, el) => el?.tagName === "MARK").map((el) => el.textContent);
    expect(marks).toEqual(["React", "REACT"]);
    expect(source.closed).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a friendly message when nothing is found", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user, { keyword: "vue" });

    source.emit("done", { total: 0, truncated: false, timedOut: false });

    expect(screen.getByText("Nothing found for “vue”.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("warns when the scan hit the time limit", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    source.emit("matches", { newMatches: ["react"], total: 1 });
    source.emit("done", { total: 1, truncated: false, timedOut: true });

    expect(screen.getByText(/time limit was reached/)).toBeInTheDocument();
  });

  it("shows errors sent by the server", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    source.emit("scan-error", { message: "This address points to a local or private network." });

    expect(screen.getByRole("alert")).toHaveTextContent("local or private network");
    expect(source.closed).toBe(true);
    expect(screen.getByRole("button", { name: "Find" })).toBeEnabled();
  });

  it("does not let EventSource silently reconnect after a dropped connection", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    source.fail();

    expect(source.closed).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("Lost connection");
  });

  it("cancels a running scan", async () => {
    const user = userEvent.setup();
    render(<App />);
    const source = await startScan(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(source.closed).toBe(true);
    expect(screen.getByText("Scan cancelled.")).toBeInTheDocument();
  });

  it("ignores events from a previous scan", async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = await startScan(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Find" }));
    const second = lastSource();

    first.emit("matches", { newMatches: ["stale react"], total: 1 });
    second.emit("done", { total: 0, truncated: false, timedOut: false });

    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
  });

  it("closes the stream when the page unmounts", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const source = await startScan(user);

    unmount();

    expect(source.closed).toBe(true);
  });
});

describe("HighlightedText", () => {
  it("treats regex characters in the keyword literally", () => {
    const { container } = render(<HighlightedText text="I write C++ and c++ daily" query="c++" />);
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["C++", "c++"]);
  });

  it("renders plain text without a query", () => {
    const { container } = render(<HighlightedText text="plain" query="" />);
    expect(container.textContent).toBe("plain");
    expect(container.querySelector("mark")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it.each([
    ["example.com", "https://example.com"],
    ["  example.com/path  ", "https://example.com/path"],
    ["http://example.com", "http://example.com"],
    ["HTTPS://example.com", "HTTPS://example.com"],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
