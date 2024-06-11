const core = require('@actions/core');
const github = require('@actions/github');
const cache = require('@actions/cache');
const common = require('./common');

async function main() {
  try {
    if (core.getBooleanInput('use-cache')) {
      const prefix = await common.getCachePrefix();
      const name = prefix + github.context.runId;
      await cache.saveCache([await common.getZigCachePath()], name);
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
