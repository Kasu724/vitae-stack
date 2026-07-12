// @vitest-environment node

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { ProviderRequestError } from "@/modules/providers/contracts";
import { NodeProviderHttpTransport } from "@/modules/providers/node-http-transport";

describe("provider transport absolute deadline", () => {
  it("times out a response that continuously drips bytes", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"ok":');
      const interval = setInterval(() => response.write(" "), 20);
      const finish = setTimeout(() => {
        clearInterval(interval);
        response.end("true}");
      }, 500);
      response.on("close", () => {
        clearInterval(interval);
        clearTimeout(finish);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const port = (server.address() as AddressInfo).port;
      const baseUrl = new URL(`http://127.0.0.1:${port}/`);
      const transport = new NodeProviderHttpTransport(
        { baseUrl, privateOriginAllowed: true },
        {
          resolve: (async () => [{ address: "127.0.0.1", family: 4 }]) as never,
        },
      );
      const startedAt = Date.now();
      await expect(
        transport.postJson({
          url: new URL("slow", baseUrl),
          headers: { "content-type": "application/json" },
          body: { synthetic: true },
          timeoutMs: 100,
        }),
      ).rejects.toMatchObject({
        code: "TIMEOUT",
      } satisfies Partial<ProviderRequestError>);
      expect(Date.now() - startedAt).toBeLessThan(350);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
