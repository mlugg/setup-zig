const path = require('path');
const fs = require('fs').promises;
const core = require('@actions/core');
const github = require('@actions/github');
const cache = require('@actions/cache');
const common = require('./common');

async function main() {
  try {
    if (core.getBooleanInput('use-cache')) {
      const cache_path = await common.getZigCachePath();

      let accessible = true;
      try {
        await fs.access(cache_path, fs.constants.R_OK);
      } catch {
        accessible = false;
      }

      if (accessible) {
        core.info('Checking cache size');
        const size = await dirSize(cache_path);
        const size_limit = core.getInput('cache-size-limit') * 1024 * 1024; // MiB -> bytes
        if (size_limit !== 0 && size > size_limit) {
          core.info(`Cache directory reached ${size} bytes, exceeding limit of ${size_limit} bytes; clearing cache`);
          // We want to clear the cache and start over. Unfortunately, we can't programmatically
          // remove the old cache entries, so we instead want to save an empty cache directory.
          // To do this, delete all the contents of the cache directory before saving the cache.
          await rmDirContents(cache_path);
        } else {
          core.info(`Cache directory is ${size} bytes, below limit of ${size_limit} bytes; keeping intact`);
        }

        const prefix = await common.getCachePrefix();
        const name = `${prefix}${github.context.runId}-${github.context.runAttempt}`;
        core.info('Saving Zig cache');
        await cache.saveCache([cache_path], name);
      } else {
        core.info('Zig cache directory is inaccessible; nothing to save');
      }
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

async function dirSize(dir_path) {
  try {
    let total = 0;
    for (const ent of await fs.readdir(dir_path, { withFileTypes: true, recursive: true })) {
      if (ent.isFile()) {
        try {
          const stat = await fs.stat(path.join(ent.parentPath, ent.name));
          total += stat.size;
        } catch {}
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function rmDirContents(dir) {
  const entries = await fs.readdir(dir);
  await Promise.all(entries.map(e => fs.rm(path.join(dir, e), { recursive: true, force: true })));
}

main();
