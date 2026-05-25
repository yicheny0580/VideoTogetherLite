import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { PopupApp } from "./PopupApp";

vi.mock("./storage", () => ({
  getValue: vi.fn(async (key: string) => {
    if (key === "videoTogetherLiteEnabled") {
      return false;
    }
    if (key === "DisplayLanguage") {
      return "en-us";
    }
    return undefined;
  }),
  setValue: vi.fn()
}));

describe("PopupApp", () => {
  it("renders persisted disabled state", async () => {
    render(<PopupApp />);

    expect(await screen.findByText("Disabled")).toBeTruthy();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
