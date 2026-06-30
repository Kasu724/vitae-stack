import type {
  AIProvider,
  ProviderRequest,
  ProviderResponse,
} from "./contracts";

export class FakeProvider implements AIProvider {
  public readonly kind = "fake" as const;
  public readonly requests: ProviderRequest[] = [];

  public constructor(
    private readonly responses: Array<ProviderResponse | Error>,
  ) {}

  public async generate(request: ProviderRequest): Promise<ProviderResponse> {
    this.requests.push(structuredClone(request));
    const next = this.responses.shift();
    if (!next) throw new Error("Fake provider has no response configured.");
    if (next instanceof Error) throw next;
    return Promise.resolve(structuredClone(next));
  }
}
