# How to Test Your Custom Setup Zig Action

## Method 1: Local Testing in Same Repository

1. **Push your changes** to your GitHub repository:
   ```bash
   git add .
   git commit -m "Add job summary and Node.js 22 support"
   git push origin main
   ```

2. **The workflow in `.github/workflows/test-action.yml`** will automatically run and test your action.

3. **Check the Actions tab** in your GitHub repository to see:
   - ✅ All test jobs passing
   - 📊 Job summaries with cache performance metrics
   - ⏱️ Timing information for each step

## Method 2: Test in Another Repository

Create a new repository or use an existing Zig project with this workflow:

```yaml
name: Test Custom Setup Zig
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Zig
        uses: your-username/setup-zig@main  # Replace with your repo
        with:
          version: 'latest'
          use-cache: true
      - name: Test
        run: zig version
```

## Method 3: Test with act (Local GitHub Actions Runner)

Install `act` to run GitHub Actions locally:

```bash
# Install act
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run your workflow locally
cd /home/user/github/setup-zig
act -j test-basic
```

## What to Look For in Tests

### ✅ Successful Indicators:
- All jobs complete without errors
- Zig is installed and `zig version` works
- Cache hits show up in subsequent runs
- Job summary displays timing and cache metrics
- Works across different OS (Ubuntu, Windows, macOS)

### 📊 Job Summary Features to Verify:
- Installation details table
- Cache performance metrics
- Timing breakdown
- Optimization tips
- Visual indicators (✅ for cache hits, ❌ for misses)

### 🚀 Performance Improvements to Observe:
- First run: Cache miss, longer setup time
- Second run: Cache hit, much faster setup
- Timing metrics showing where time is spent

## Debugging Tips

If tests fail, check:
1. **Action logs** - Look for error messages in the Actions tab
2. **Job summary** - Check if summary generation works
3. **Cache behavior** - Verify cache keys are working
4. **Node.js 22** - Ensure the runtime is working correctly

## Next Steps

1. Push your changes and run the tests
2. Check the job summaries for the new features
3. Verify cache performance improvements
4. Test with real Zig projects to ensure everything works
