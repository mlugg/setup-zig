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
        const prefix = await common.getCachePrefix();
        const name = prefix + github.context.runId;
        await cache.saveCache([cache_path], name);
      }
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
