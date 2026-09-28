import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

describe("application foundation", () => {
  it("reports a healthy service", async () => {
    const app = buildApp({ environment: { NODE_ENV: "test", PORT: 3000, WHATSAPP_VERIFY_TOKEN: "test-token-123" } });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("verifies the webhook and ignores a duplicate Meta message", async () => {
    const app = buildApp({ environment: { NODE_ENV: "test", PORT: 3000, WHATSAPP_VERIFY_TOKEN: "test-token-123" } });
    const verification = await app.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-token-123&hub.challenge=challenge-42"
    });
    const firstDelivery = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      payload: { messages: [{ id: "wamid-1", from: "5511999999999", text: "Olá" }] }
    });
    const duplicateDelivery = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      payload: { messages: [{ id: "wamid-1", from: "5511999999999", text: "Olá" }] }
    });

    expect(verification.body).toBe("challenge-42");
    expect(firstDelivery.json()).toMatchObject({ processed: 1, duplicates: 0 });
    expect(duplicateDelivery.json()).toMatchObject({ processed: 0, duplicates: 1 });
    await app.close();
  });
});
