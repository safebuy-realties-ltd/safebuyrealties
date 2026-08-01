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

  // The floor, measured on b92d447 over all 167 files that collectCoverageFrom names:
  //   statements 71.05% (3479/4896)   branches 51.95% (1090/2098)
  //   functions  53.88% (430/798)     lines    72.07% (3107/4311)
  //
  // Set a little under each so ordinary work does not break main for whoever merges next, which is
  // how a floor gets deleted rather than raised. Room before each trips, at today's totals:
  // 100 more uncovered statements, 61 branches, 23 functions, 89 lines.
  //
  // The ratchet, which is the mechanism and not a good intention. `npm run coverage:ratchet` reads
  // this file and the summary the last run wrote, and prints the number each floor has earned: the
  // measured percentage floored to a whole percent, less two, and never below what is already here.
  // A ratchet that turns both ways is a spring. Raising it stays a person's edit in a pull request
  // with those figures in the body, because a floor that moves on its own is a floor nobody reads.
  //
  // These four came up from 40/40/40/41, measured on e80e24c at 41.70 / 41.89 / 42.55 / 42.86, on
  // the strength of the handover week and the three waves after it. That is the first turn.
  //
  // Deliberately global-only, no per-directory groups. Jest removes any file matching a path or
  // glob key from `global`, so carving out the five directories that already cover well
  // (poa, config, platform-config, health, storage — 86.55% between them) would drop what `global`
  // actually measures to 33.88%. A reader would then see `statements: 33` in a repository that
  // covers 41.70% and believe the floor is lower than it is. Per-directory bars are worth having;
  // they are not worth buying with a number that reads as a lie.
  coverageThreshold: {
    global: {
      statements: 69,
      branches: 49,
      functions: 51,
      lines: 70,
    },
  },
};
