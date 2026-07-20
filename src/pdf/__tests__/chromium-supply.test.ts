import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const chromiumMocks = vi.hoisted(() => ({
  executablePath: vi.fn(),
  launch: vi.fn(),
}));

vi.mock("@sparticuz/chromium-min", () => ({
  default: {
    args: ["--no-sandbox"],
    executablePath: chromiumMocks.executablePath,
  },
}));

vi.mock("puppeteer-core", () => ({
  default: { launch: chromiumMocks.launch },
}));

describe("Chromium pack supply", () => {
  beforeEach(() => {
    vi.resetModules();
    chromiumMocks.executablePath.mockReset();
    chromiumMocks.launch.mockReset();
    delete process.env.CHROMIUM_PATH;
    delete process.env.CHROMIUM_PACK_URL;
    process.env.VERCEL = "1";
  });

  afterEach(() => {
    delete process.env.CHROMIUM_PATH;
    delete process.env.CHROMIUM_PACK_URL;
    delete process.env.VERCEL;
  });

  test("respects a CHROMIUM_PACK_URL override set before launch", async () => {
    const { launchPdfBrowser } = await import("../chromium-launcher");
    const packUrl =
      "https://artifacts.example.com/chromium/chromium-v147.0.2-pack.x64.tar";
    process.env.CHROMIUM_PACK_URL = packUrl;
    chromiumMocks.executablePath.mockResolvedValue("/tmp/chromium");
    chromiumMocks.launch.mockResolvedValue({ close: vi.fn() });

    await launchPdfBrowser();

    expect(chromiumMocks.executablePath).toHaveBeenCalledWith(packUrl);
  });

  test("rejects a mismatched pack URL and names both versions", async () => {
    const { launchPdfBrowser } = await import("../chromium-launcher");
    process.env.CHROMIUM_PACK_URL =
      "https://artifacts.example.com/chromium/chromium-v146.0.0-pack.x64.tar";

    await expect(launchPdfBrowser()).rejects.toThrow(
      /146\.0\.0.*147\.0\.2|147\.0\.2.*146\.0\.0/
    );
    expect(chromiumMocks.executablePath).not.toHaveBeenCalled();
    expect(chromiumMocks.launch).not.toHaveBeenCalled();
  });

  test("retries the remote dependency step once before succeeding", async () => {
    const { launchPdfBrowser } = await import("../chromium-launcher");
    chromiumMocks.executablePath
      .mockRejectedValueOnce(new Error("temporary artifact outage"))
      .mockResolvedValueOnce("/tmp/chromium");
    chromiumMocks.launch.mockResolvedValue({ close: vi.fn() });

    await launchPdfBrowser();

    expect(chromiumMocks.executablePath).toHaveBeenCalledTimes(2);
    expect(chromiumMocks.launch).toHaveBeenCalledTimes(1);
  });
});
