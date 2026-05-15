/**
 * Lazy Anthropic client factory.
 *
 * Mirrors the `getResend()` pattern so a missing ANTHROPIC_API_KEY at build
 * time doesn't crash the build — the client is constructed lazily on the
 * first request that actually needs it.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    });
  }
  return _client;
}
