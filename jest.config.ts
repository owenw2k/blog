import nextJest from "next/jest.js";

import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", "!src/app/layout.tsx"],
  coverageThreshold: {
    global: {
      lines: 90,
      branches: 90,
      functions: 90,
      statements: 90,
    },
  },
};

export default createJestConfig(config);
