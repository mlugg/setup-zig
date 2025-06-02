const path = require('path');
const fs = require('fs').promises;
const core = require('@actions/core');
const github = require('@actions/github');
const cache = require('@actions/cache');
const common = require('./common');

async function main() {
  try {
    if (core.getBooleanInput('use-cache')) {
      const cachePath = await common.getZigCachePath();

      let accessible = true;
      try {
        await fs.access(cachePath, fs.constants.R_OK);
      } catch {
        accessible = false;
        core.info('Zig global cache directory not found or not accessible');
      }

      if (accessible) {
        const size = await totalSize(cachePath);
        const sizeLimit = core.getInput('cache-size-limit') * 1024 * 1024; // MiB -> bytes

        // Log comprehensive cache size for monitoring
        const sizeMiB = (size / 1024 / 1024).toFixed(2);
        const limitMiB = sizeLimit > 0 ? (sizeLimit / 1024 / 1024).toFixed(0) : 'unlimited';
        core.info(`Zig global cache size: ${sizeMiB} MiB (limit: ${limitMiB} MiB)`);

        // Count cache entries for additional analytics
        const cacheEntries = await countCacheEntries(cachePath);
        core.info(`Cache contains ${cacheEntries} entries`);

        if (sizeLimit !== 0 && size > sizeLimit) {
          core.info(`Cache directory reached ${size} bytes, exceeding limit of ${sizeLimit} bytes; clearing cache`);
          // We want to clear the cache and start over. Unfortunately, we can't programmatically
          // remove the old cache entries, so we instead want to save an empty cache directory.
          // To do this, delete all the contents of the cache directory before saving the cache.
          await rmDirContents(cachePath);
          core.info('Cache directory cleared due to size limit');

          // Update job summary about cache clearing
          await updateJobSummaryWithCacheClear(size, sizeLimit);
        }

        try {
          const cacheKey = await common.getCachePrefix();
          const saveStart = Date.now();
          await cache.saveCache([cachePath], cacheKey);
          const saveTime = Date.now() - saveStart;
          core.info(`Cache saved successfully in ${saveTime}ms with key: ${cacheKey}`);

          // Update job summary with post-action cache info
          await updateJobSummaryWithCacheInfo(size, cacheEntries, saveTime, cacheKey);
        } catch (error) {
          // Don't fail the action if cache save fails
          core.warning(`Failed to save cache: ${error.message}`);
        }
      } else {
        core.info('No Zig global cache to save (directory not accessible)');

        // Update job summary about inaccessible cache
        await updateJobSummaryWithNoCache();
      }
    } else {
      // Update job summary when caching is disabled
      await updateJobSummaryWithCacheDisabled();
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

async function totalSize(p) {
  try {
    const stat = await fs.stat(p);
    if (stat.isFile()) return stat.size;
    if (stat.isDirectory()) {
      let total = 0;
      for (const entry of await fs.readdir(p)) {
        total += await totalSize(path.join(p, entry));
      }
      return total;
    }
    return 0;
  } catch {
    return 0;
  }
}

async function countCacheEntries(dir) {
  try {
    const entries = await fs.readdir(dir);
    let count = 0;
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        count += await countCacheEntries(entryPath);
      } else {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function rmDirContents(dir) {
  const entries = await fs.readdir(dir);
  await Promise.all(entries.map(e => fs.rm(path.join(dir, e), { recursive: true, force: true })));
}

async function updateJobSummaryWithNoCache() {
  try {
    await core.summary
      .addHeading('💾 Cache Save Results', 3)
      .addRaw('ℹ️ No Zig global cache directory found - nothing to save\n\n')
      .write();
  } catch (error) {
    core.warning(`Failed to update job summary: ${error.message}`);
  }
}

async function updateJobSummaryWithCacheDisabled() {
  try {
    await core.summary
      .addHeading('💾 Cache Save Results', 3)
      .addRaw('⚠️ Caching is disabled (`use-cache: false`) - no cache to save\n\n')
      .write();
  } catch (error) {
    core.warning(`Failed to update job summary: ${error.message}`);
  }
}

async function updateJobSummaryWithCacheClear(cacheSize, sizeLimit) {
  try {
    const sizeMiB = (cacheSize / 1024 / 1024).toFixed(2);
    const limitMiB = (sizeLimit / 1024 / 1024).toFixed(0);

    await core.summary
      .addHeading('🗑️ Cache Cleared', 3)
      .addRaw(`⚠️ Cache directory exceeded size limit and was cleared\n\n`)
      .addTable([
        ['Metric', 'Value'],
        ['Cache Size', `${sizeMiB} MiB`],
        ['Size Limit', `${limitMiB} MiB`],
        ['Action Taken', 'Cache cleared and reset']
      ])
      .addRaw('\n')
      .write();
  } catch (error) {
    core.warning(`Failed to update job summary: ${error.message}`);
  }
}

async function updateJobSummaryWithCacheInfo(cacheSize, cacheEntries, saveTime, cacheKey) {
  try {
    const sizeMiB = (cacheSize / 1024 / 1024).toFixed(2);

    await core.summary
      .addHeading('💾 Cache Save Results', 3)
      .addTable([
        ['Metric', 'Value'],
        ['Cache Size', `${sizeMiB} MiB`],
        ['Cache Entries', `${cacheEntries}`],
        ['Save Time', `${saveTime}ms`],
        ['Cache Key', `\`${cacheKey}\``]
      ])
      .addRaw('\n')
      .addRaw('✅ Zig global cache saved successfully for next run!\n\n')
      .write();
  } catch (error) {
    core.warning(`Failed to update job summary: ${error.message}`);
  }
}

main();
