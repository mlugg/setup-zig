# Setup Zig Action Tests

This directory contains test files and validation scripts for the setup-zig GitHub Action.

## Test Files

### `basic-validation.js`
Basic validation test for job summary data structure and timing calculations.
```bash
node test/basic-validation.js
```

### `cache-key-analysis.js`
Analyzes cache key generation logic and fallback hierarchy for different Zig versions and platforms.
```bash
node test/cache-key-analysis.js
```

### `job-summary-test.js`
Tests the GitHub Actions job summary generation functionality with mock data.
```bash
node test/job-summary-test.js
```

### `tarball-cache-safety.js`
Demonstrates the safety issues with the old tarball cache restore strategy and validates the new exact-match approach.
```bash
node test/tarball-cache-safety.js
```

## Running Tests

To run all tests:
```bash
# Run individual tests
node test/basic-validation.js
node test/cache-key-analysis.js
node test/job-summary-test.js
node test/tarball-cache-safety.js

# Or run all tests with a simple loop
for test in test/*.js; do echo "Running $test..."; node "$test"; echo; done
```

## Test Dependencies

Most tests are standalone and don't require external dependencies. The `job-summary-test.js` requires the `@actions/core` package which is already included in the main project dependencies.

## Adding New Tests

When adding new test files:
1. Use descriptive filenames (e.g., `feature-name-test.js`)
2. Include a shebang line: `#!/usr/bin/env node`
3. Add clear console output explaining what's being tested
4. Update this README with a description of the new test
