// Lighthouse CI config — Phase 5 PWA performance budget.
module.exports = {
  ci: {
    collect: {
      staticDistDir: ".open-next/assets",
      url: [
        "http://localhost:3456/offline-shell.html",
        "http://localhost:3456/offline-shell.html?route=/registros",
      ],
      numberOfRuns: 2,
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: { target: "temporary-public-storage" },
  },
};
