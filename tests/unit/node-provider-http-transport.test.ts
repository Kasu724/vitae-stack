import { describe, expect, it } from "vitest";

import { createPinnedLookup } from "@/modules/providers/node-http-transport";

describe("pinned provider DNS lookup", () => {
  it("returns an address list when Node requests all addresses", () => {
    const lookup = createPinnedLookup({ address: "203.0.113.10", family: 4 });
    lookup(
      "provider.example",
      { all: true } as never,
      ((error: NodeJS.ErrnoException | null, addresses: unknown) => {
        expect(error).toBeNull();
        expect(addresses).toEqual([{ address: "203.0.113.10", family: 4 }]);
      }) as never,
    );
  });
});
