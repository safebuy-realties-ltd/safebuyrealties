/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  coverageReporters: ["text-summary", "json-summary", "lcov"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@alexasomba/paystack-node$": "<rootDir>/../test/mocks/paystack-node.mock.ts",
  },

  // The floor, measured on e80e24c over all 155 files that collectCoverageFrom names:
  //   statements 41.70% (1773/4251)   branches 41.89% (747/1783)
  //   functions  42.55% (283/665)     lines    42.86% (1611/3758)
  //
  // Set a little under each so ordinary work does not break main for whoever merges next, which is
  // how a floor gets deleted rather than raised. Room before each trips, at today's covered counts:
  // 181 more uncovered statements, 84 branches, 42 functions, 171 lines. Raise these deliberately
  // when the real number moves; that is the ratchet, and it is a person's decision, not automatic.
  //
  // Deliberately global-only, no per-directory groups. Jest removes any file matching a path or
  // glob key from `global`, so carving out the five directories that already cover well
  // (poa, config, platform-config, health, storage — 86.55% between them) would drop what `global`
  // actually measures to 33.88%. A reader would then see `statements: 33` in a repository that
  // covers 41.70% and believe the floor is lower than it is. Per-directory bars are worth having;
  // they are not worth buying with a number that reads as a lie.
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 40,
      functions: 40,
      lines: 41,
    },
  },
};
