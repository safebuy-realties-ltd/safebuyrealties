import { resolveVerifyBaseUrl } from "./poa-verify-config";

describe("resolveVerifyBaseUrl", () => {
  it("prefers POA_VERIFY_BASE_URL when set", () => {
    expect(
      resolveVerifyBaseUrl({
        POA_VERIFY_BASE_URL: "https://verify.safebuyrealties.com/poa",
        FRONTEND_URL: "https://app.example.com",
      }),
    ).toBe("https://verify.safebuyrealties.com/poa");
  });

  it("strips trailing slashes from POA_VERIFY_BASE_URL", () => {
    expect(resolveVerifyBaseUrl({ POA_VERIFY_BASE_URL: "https://example.com/verify//" })).toBe(
      "https://example.com/verify",
    );
  });

  it("falls back to the first FRONTEND_URL origin with /verify appended", () => {
    expect(
      resolveVerifyBaseUrl({
        FRONTEND_URL: "https://safebuyrealties-app.vercel.app,http://localhost:8080",
      }),
    ).toBe("https://safebuyrealties-app.vercel.app/verify");
  });

  it("trims whitespace around the first FRONTEND_URL entry", () => {
    expect(resolveVerifyBaseUrl({ FRONTEND_URL: "  http://localhost:8080 , http://x.test " })).toBe(
      "http://localhost:8080/verify",
    );
  });

  it("ignores a FRONTEND_URL entry that is not a URL", () => {
    expect(resolveVerifyBaseUrl({ FRONTEND_URL: "not-a-url" })).toBe(
      "https://safebuyrealties.com/verify",
    );
  });

  it("falls back to the default when neither variable is set", () => {
    expect(resolveVerifyBaseUrl({})).toBe("https://safebuyrealties.com/verify");
  });

  it("falls back to the default when both variables are blank", () => {
    expect(resolveVerifyBaseUrl({ POA_VERIFY_BASE_URL: "   ", FRONTEND_URL: "  ,  " })).toBe(
      "https://safebuyrealties.com/verify",
    );
  });
});
