import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { invoke } from "@forge/bridge";
import Configuration from "./Configuration";

jest.mock("@forge/bridge", () => ({ invoke: jest.fn() }));

const generatedUrl = "https://example.atlassian-dev.net/webtrigger/test?token=a%2Bb";
const copyLabel = "Copier l'URL générée dans le presse-papier";
let container;
let root;
let originalClipboard;

function copyText() {
  return container.querySelector(`[aria-label="${copyLabel}"]`);
}

async function click(element) {
  await act(async () => {
    Simulate.click(element);
  });
}

async function generateUrl() {
  const button = Array.from(container.querySelectorAll("button"))
    .find(element => element.textContent === "Générer URL");
  await click(button);
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
  invoke.mockReset();
  invoke.mockImplementation(async (name) => {
    if (name === "getAllConnections") return [];
    if (name === "generateMyWebTriggerUrl") return generatedUrl;
    throw new Error(`Unexpected resolver: ${name}`);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Configuration />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    delete navigator.clipboard;
  }
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("shows generated URL as link-styled text without a button or navigation", async () => {
  expect(copyText()).toBeNull();
  await generateUrl();
  expect(copyText().textContent).toBe(generatedUrl);
  expect(copyText().tagName).toBe("SPAN");
  expect(copyText().style.textDecoration).toBe("underline");
  expect(copyText().getAttribute("role")).toBe("button");
  expect(copyText().tabIndex).toBe(0);
  expect(container.querySelector("a")).toBeNull();
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

test("copies the exact generated URL and announces success", async () => {
  await generateUrl();
  await click(copyText());
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(generatedUrl);
  expect(container.querySelector('[role="status"]').textContent)
    .toBe("URL copiée dans le presse-papier !");
  expect(copyText().getAttribute("aria-disabled")).toBe("false");
});

test.each(["Enter", " "])("copies using the %s key", async (key) => {
  await generateUrl();
  const preventDefault = jest.fn();
  await act(async () => {
    Simulate.keyDown(copyText(), { key, preventDefault });
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(generatedUrl);
});

test("ignores unrelated keys and repeated keydown events", async () => {
  await generateUrl();
  await act(async () => {
    Simulate.keyDown(copyText(), { key: "Escape" });
    Simulate.keyDown(copyText(), { key: "Enter", repeat: true });
  });
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

test("waits for the clipboard write and prevents further activation while copying", async () => {
  let finishCopy;
  navigator.clipboard.writeText.mockImplementation(() => new Promise(resolve => {
    finishCopy = resolve;
  }));
  await generateUrl();
  await click(copyText());
  expect(copyText().getAttribute("aria-disabled")).toBe("true");
  expect(container.querySelector('[role="status"]')).toBeNull();
  await click(copyText());
  await act(async () => {
    Simulate.keyDown(copyText(), { key: "Enter" });
  });
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  await act(async () => finishCopy());
  expect(copyText().getAttribute("aria-disabled")).toBe("false");
  expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("reports a clipboard refusal and allows retrying", async () => {
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
  await generateUrl();
  await click(copyText());
  expect(container.querySelector('[role="alert"]').textContent)
    .toContain("copier manuellement");
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(copyText().getAttribute("aria-disabled")).toBe("false");
  await click(copyText());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("handles browsers without the Clipboard API", async () => {
  delete navigator.clipboard;
  await generateUrl();
  await click(copyText());
  expect(container.querySelector('[role="alert"]').textContent)
    .toContain("Impossible de copier l'URL");
  expect(copyText().getAttribute("aria-disabled")).toBe("false");
});

test("clears old feedback and copies the new URL after regeneration", async () => {
  await generateUrl();
  await click(copyText());
  const nextUrl = "https://example.atlassian-dev.net/webtrigger/next";
  invoke.mockResolvedValueOnce(nextUrl);
  await generateUrl();
  expect(container.querySelector('[role="status"]')).toBeNull();
  await click(copyText());
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(nextUrl);
});
