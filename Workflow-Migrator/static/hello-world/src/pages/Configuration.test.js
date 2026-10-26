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

function copyButton() {
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

test("only offers copying after URL generation, without opening a link", async () => {
  expect(copyButton()).toBeNull();
  await generateUrl();
  expect(copyButton().textContent).toBe(generatedUrl);
  expect(copyButton().getAttribute("type")).toBe("button");
  expect(container.querySelector("a")).toBeNull();
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
});

test("copies the exact generated URL and announces success", async () => {
  await generateUrl();
  await click(copyButton());
  expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(generatedUrl);
  expect(container.querySelector('[role="status"]').textContent)
    .toBe("URL copiée dans le presse-papier !");
  expect(copyButton().disabled).toBe(false);
});

test("waits for the clipboard write before confirming success", async () => {
  let finishCopy;
  navigator.clipboard.writeText.mockImplementation(() => new Promise(resolve => {
    finishCopy = resolve;
  }));
  await generateUrl();
  await click(copyButton());
  expect(copyButton().disabled).toBe(true);
  expect(container.querySelector('[role="status"]')).toBeNull();
  await act(async () => finishCopy());
  expect(copyButton().disabled).toBe(false);
  expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("reports a clipboard refusal and allows retrying", async () => {
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
  await generateUrl();
  await click(copyButton());
  expect(container.querySelector('[role="alert"]').textContent)
    .toContain("copier manuellement");
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(copyButton().disabled).toBe(false);
  await click(copyButton());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("handles browsers without the Clipboard API", async () => {
  delete navigator.clipboard;
  await generateUrl();
  await click(copyButton());
  expect(container.querySelector('[role="alert"]').textContent)
    .toContain("Impossible de copier l'URL");
  expect(copyButton().disabled).toBe(false);
});

test("clears old feedback and copies the new URL after regeneration", async () => {
  await generateUrl();
  await click(copyButton());
  const nextUrl = "https://example.atlassian-dev.net/webtrigger/next";
  invoke.mockResolvedValueOnce(nextUrl);
  await generateUrl();
  expect(container.querySelector('[role="status"]')).toBeNull();
  await click(copyButton());
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(nextUrl);
});
