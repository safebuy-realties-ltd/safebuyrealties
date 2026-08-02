import { ThrottleStore } from "./throttle-store";

/** A fixed instant, so nothing here depends on how fast the suite runs. */
const T0 = 1_700_000_000_000;

describe("ThrottleStore", () => {
  let store: ThrottleStore;

  beforeEach(() => {
    store = new ThrottleStore();
  });

  it("admits requests up to the limit and refuses the one after", () => {
    for (let i = 1; i <= 5; i += 1) {
      const decision = store.hit("login:1.2.3.4", 5, 60, T0);
      expect(decision.allowed).toBe(true);
      expect(decision.count).toBe(i);
    }

    const refused = store.hit("login:1.2.3.4", 5, 60, T0);
    expect(refused.allowed).toBe(false);
    expect(refused.count).toBe(6);
    expect(refused.limit).toBe(5);
  });

  it("reports whole seconds until the window resets, never zero", () => {
    store.hit("login:1.2.3.4", 1, 60, T0);
    expect(store.hit("login:1.2.3.4", 1, 60, T0).retryAfterSeconds).toBe(60);
    // 500ms left rounds up to 1. Retry-After: 0 tells a client to retry immediately, which is the
    // one answer a limiter must never give.
    expect(store.hit("login:1.2.3.4", 1, 60, T0 + 59_500).retryAfterSeconds).toBe(1);
  });

  it("starts a fresh window once the old one has passed", () => {
    store.hit("login:1.2.3.4", 1, 60, T0);
    expect(store.hit("login:1.2.3.4", 1, 60, T0 + 30_000).allowed).toBe(false);
    expect(store.hit("login:1.2.3.4", 1, 60, T0 + 60_000).allowed).toBe(true);
  });

  it("counts each key on its own, so one caller cannot spend another's allowance", () => {
    store.hit("login:1.2.3.4", 1, 60, T0);
    expect(store.hit("login:1.2.3.4", 1, 60, T0).allowed).toBe(false);
    expect(store.hit("login:5.6.7.8", 1, 60, T0).allowed).toBe(true);
    // Same caller, different policy: also its own count.
    expect(store.hit("register:1.2.3.4", 1, 60, T0).allowed).toBe(true);
  });

  it("keeps a caller refused for the rest of the window rather than resetting on refusal", () => {
    store.hit("login:1.2.3.4", 1, 60, T0);
    const first = store.hit("login:1.2.3.4", 1, 60, T0 + 1_000);
    const later = store.hit("login:1.2.3.4", 1, 60, T0 + 30_000);
    expect(first.allowed).toBe(false);
    expect(later.allowed).toBe(false);
    expect(later.retryAfterSeconds).toBeLessThan(first.retryAfterSeconds);
  });

  describe("memory ceiling", () => {
    it("stays under it, because the key is something a caller chooses", () => {
      const small = new ThrottleStore(3);
      for (let i = 0; i < 50; i += 1) {
        small.hit(`login:10.0.0.${i}`, 5, 60, T0);
      }
      expect(small.size()).toBeLessThanOrEqual(3);
    });

    it("sweeps expired windows first, so live counters survive the ceiling", () => {
      const small = new ThrottleStore(3);
      small.hit("login:a", 5, 1, T0);
      small.hit("login:b", 5, 1, T0);
      small.hit("login:c", 5, 600, T0);

      // Past a and b's window, so the sweep frees those two and the long-lived counter is untouched.
      small.hit("login:d", 5, 600, T0 + 2_000);
      expect(small.hit("login:c", 5, 600, T0 + 2_000).count).toBe(2);
    });
  });

  it("clears everything on demand", () => {
    store.hit("login:1.2.3.4", 5, 60, T0);
    expect(store.size()).toBe(1);
    store.clear();
    expect(store.size()).toBe(0);
  });
});
