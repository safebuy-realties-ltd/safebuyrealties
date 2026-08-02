import {
  DEFAULT_TRUST_PROXY_HOPS,
  isTrustProxyValueIgnored,
  resolveTrustProxyHops,
} from "./trust-proxy";

describe("resolveTrustProxyHops", () => {
  it("assumes one proxy when nothing is set, which is what every platform here puts in front", () => {
    expect(resolveTrustProxyHops(undefined)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(resolveTrustProxyHops("")).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(resolveTrustProxyHops("   ")).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });

  it("takes the hop count the deployment declares", () => {
    expect(resolveTrustProxyHops("2")).toBe(2);
    expect(resolveTrustProxyHops(" 3 ")).toBe(3);
  });

  it("accepts zero, which is trust nothing and is right for a process reached directly", () => {
    expect(resolveTrustProxyHops("0")).toBe(0);
  });

  it.each([
    ["a word", "true"],
    ["a fraction", "1.5"],
    ["a negative count", "-1"],
    ["a list", "1,2"],
  ])(
    "falls back rather than throwing on %s, because a typo must not stop the API booting",
    (_label, raw) => {
      expect(resolveTrustProxyHops(raw)).toBe(DEFAULT_TRUST_PROXY_HOPS);
      expect(isTrustProxyValueIgnored(raw)).toBe(true);
    },
  );

  it("reports nothing ignored when the value is absent or understood", () => {
    expect(isTrustProxyValueIgnored(undefined)).toBe(false);
    expect(isTrustProxyValueIgnored("")).toBe(false);
    expect(isTrustProxyValueIgnored("2")).toBe(false);
  });

  it("never yields a value that would make X-Forwarded-For client-writable", () => {
    // `trust proxy: true` believes the whole header, including the part the client wrote, so a
    // caller could choose which rate limit bucket to be counted in. A number never can.
    for (const raw of [undefined, "", "true", "yes", "-4", "1.5", "0", "1", "2"]) {
      expect(typeof resolveTrustProxyHops(raw)).toBe("number");
      expect(Number.isInteger(resolveTrustProxyHops(raw))).toBe(true);
      expect(resolveTrustProxyHops(raw)).toBeGreaterThanOrEqual(0);
    }
  });
});
