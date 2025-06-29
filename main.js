const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const cache = require('@actions/cache');
const common = require('./common');
const minisign = require('./minisign');

// Upstream's minisign key, from https://ziglang.org/download
const MINISIGN_KEY = 'RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U';

// The base URL of the official builds of Zig. This is only used as a fallback, if all mirrors fail.
const CANONICAL = 'https://ziglang.org/builds';

// The list of mirrors we attempt to fetch from. These need not be trusted, as
// we always verify the minisign signature.
// This is an array of URLs.
const MIRRORS = require('./mirrors.json').map((x) => x[0]);

async function downloadFromMirror(mirror, tarball_filename) {
  const tarball_path = await tc.downloadTool(`${mirror}/${tarball_filename}?source=github-actions`);

  const signature_response = await fetch(`${mirror}/${tarball_filename}.minisig?source=github-actions`);
  const signature_data = Buffer.from(await signature_response.arrayBuffer());

  const tarball_data = await fs.readFile(tarball_path);

  const key = minisign.parseKey(MINISIGN_KEY);
  const signature = minisign.parseSignature(signature_data);
  if (!minisign.verifySignature(key, signature, tarball_data)) {
    throw new Error(`signature verification failed for '${mirror}/${tarball_filename}'`);
  }

  // Parse the trusted comment to validate the tarball name.
  // This prevents a malicious actor from trying to pass off one signed tarball as another.
  const match = /^timestamp:\d+\s+file:([^\s]+)\s+hashed$/.exec(signature.trusted_comment.toString());
  if (match === null || match[1] !== tarball_filename) {
    throw new Error(`filename verification failed for '${mirror}/${tarball_filename}'`);
  }

  return tarball_path;
}

async function downloadTarball(tarball_filename) {
  const preferred_mirror = core.getInput('mirror');
  if (preferred_mirror.includes("://ziglang.org/") || preferred_mirror.startsWith("ziglang.org/")) {
    throw new Error("'https://ziglang.org' cannot be used as mirror override; for more information see README.md");
  }
  if (preferred_mirror) {
    core.info(`Using mirror: ${preferred_mirror}`);
    return await downloadFromMirror(preferred_mirror, tarball_filename);
  }

  // We will attempt all mirrors before making a last-ditch attempt to the official download.
  // To avoid hammering a single mirror, we first randomize the array.
  const shuffled_mirrors = MIRRORS.map((m) => [m, Math.random()]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  for (const mirror of shuffled_mirrors) {
    core.info(`Attempting mirror: ${mirror}`);
    try {
      return await downloadFromMirror(mirror, tarball_filename);
    } catch (e) {
      core.info(`Mirror failed with error: ${e}`);
      // continue loop to next mirror
    }
  }
  core.info(`Attempting official: ${CANONICAL}`);
  return await downloadFromMirror(CANONICAL, tarball_filename);
}

async function retrieveTarball(tarball_name, tarball_ext) {
  const cache_key = `setup-zig-tarball-${tarball_name}`;
  const tarball_cache_path = await common.getTarballCachePath();

  if (await cache.restoreCache([tarball_cache_path], cache_key)) {
    return tarball_cache_path;
  }

  core.info(`Cache miss. Fetching Zig ${await common.getVersion()}`);
  const downloaded_path = await downloadTarball(`${tarball_name}${tarball_ext}`);
  await fs.copyFile(downloaded_path, tarball_cache_path)
  await cache.saveCache([tarball_cache_path], cache_key);
  return tarball_cache_path;
}

async function main() {
  try {
    // We will check whether Zig is stored in the cache. We use two separate caches.
    // * 'tool-cache' caches the final extracted directory if the same Zig build is used multiple
    //   times by one job. We have this dependency anyway for archive extraction.
    // * 'cache' only caches the unextracted archive, but it does so across runs. It's a little
    //   less efficient, but still much preferable to fetching Zig from a mirror. We have this
    //   dependency anyway for caching the global Zig cache.
    //
    // Unfortunately, tool-cache can lead to serious performance problems on GitHub-hosted Actions
    // runners -- or their Windows ones at least, because the tool cache is stored on a slow drive.
    // There are even hacky workarounds for this in official Actions:
    //
    // https://github.com/actions/setup-go/blob/d35c59abb061a4a6fb18e82ac0862c26744d6ab5/src/installer.ts#L174
    //
    // Since tool-cache is only really useful on self-hosted runners, let's just disable it by
    // default on GitHub-hosted runners, and hence execute Zig straight out of its extracted dir.
    let use_tool_cache = core.getInput('use-tool-cache');
    if (use_tool_cache === 'true') {
      use_tool_cache = true;
    } else if (use_tool_cache === 'false') {
      use_tool_cache = false;
    } else if (use_tool_cache === '') {
      use_tool_cache = process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted';
    } else {
      throw new Error("Invalid 'use-tool-cache' value. Valid values: 'true', 'false'");
    }
    core.info(`Using tool-cache: ${use_tool_cache}`);

    let zig_dir;
    if (use_tool_cache) {
      zig_dir = tc.find('zig', await common.getVersion());
    }
    if (zig_dir) {
      core.info('Using cached Zig installation from tool-cache');
    } else {
      const tarball_name = await common.getTarballName();
      const tarball_ext = await common.getTarballExt();

      core.info(`Fetching ${tarball_name}${tarball_ext}`);
      const fetch_start = Date.now();
      const tarball_path = await retrieveTarball(tarball_name, tarball_ext);
      core.info(`Fetch took ${Date.now() - fetch_start} ms`);

      core.info(`Extracting tarball ${tarball_name}${tarball_ext}`);

      const extract_start = Date.now();
      const zig_parent_dir = tarball_ext === '.zip' ?
        await tc.extractZip(tarball_path) :
        await tc.extractTar(tarball_path, null, 'xJ'); // J for xz
      core.info(`Extract took ${Date.now() - extract_start} ms`);

      const zig_inner_dir = path.join(zig_parent_dir, tarball_name);
      if (use_tool_cache) {
        core.info('Copying Zig installation to tool-cache');
        zig_dir = await tc.cacheDir(zig_inner_dir, 'zig', await common.getVersion());
      } else {
        zig_dir = zig_inner_dir;
      }
    }

    core.addPath(zig_dir);

    // Direct Zig to use the global cache as every local cache, so that we get maximum benefit from the caching below.
    core.exportVariable('ZIG_LOCAL_CACHE_DIR', await common.getZigCachePath());

    if (core.getBooleanInput('use-cache')) {
      core.info('Attempting restore of Zig cache');
      await cache.restoreCache([await common.getZigCachePath()], await common.getCachePrefix());
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
