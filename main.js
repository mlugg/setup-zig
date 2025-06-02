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

async function downloadFromMirror(mirror, tarballFilename) {
  const tarballPath = await tc.downloadTool(`${mirror}/${tarballFilename}?source=github-actions`);

  const signatureResponse = await fetch(`${mirror}/${tarballFilename}.minisig?source=github-actions`);
  const signatureData = Buffer.from(await signatureResponse.arrayBuffer());

  const tarballData = await fs.readFile(tarballPath);

  const key = minisign.parseKey(MINISIGN_KEY);
  const signature = minisign.parseSignature(signatureData);
  if (!minisign.verifySignature(key, signature, tarballData)) {
    throw new Error(`signature verification failed for '${mirror}/${tarballFilename}'`);
  }

  // Parse the trusted comment to validate the tarball name.
  // This prevents a malicious actor from trying to pass off one signed tarball as another.
  const match = /^timestamp:\d+\s+file:([^\s]+)\s+hashed$/.exec(signature.trusted_comment.toString());
  if (match === null || match[1] !== tarballFilename) {
    throw new Error(`filename verification failed for '${mirror}/${tarballFilename}'`);
  }

  return tarballPath;
}

async function downloadTarball(tarballFilename) {
  const preferredMirror = core.getInput('mirror');
  if (preferredMirror.includes("://ziglang.org/") || preferredMirror.startsWith("ziglang.org/")) {
    throw new Error("'https://ziglang.org' cannot be used as mirror override; for more information see README.md");
  }
  if (preferredMirror) {
    core.info(`Using mirror: ${preferredMirror}`);
    return await downloadFromMirror(preferredMirror, tarballFilename);
  }

  // We will attempt all mirrors before making a last-ditch attempt to the official download.
  // To avoid hammering a single mirror, we first randomize the array.
  const shuffledMirrors = MIRRORS.map((m) => [m, Math.random()]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  for (const mirror of shuffledMirrors) {
    core.info(`Attempting mirror: ${mirror}`);
    try {
      return await downloadFromMirror(mirror, tarballFilename);
    } catch (e) {
      core.info(`Mirror failed with error: ${e}`);
      // continue loop to next mirror
    }
  }
  core.info(`Attempting official: ${CANONICAL}`);
  return await downloadFromMirror(CANONICAL, tarballFilename);
}

async function retrieveTarball(tarballName, tarballExt) {
  const cacheKey = `setup-zig-tarball-${tarballName}`;
  const tarballCachePath = await common.getTarballCachePath();

  // Try to restore the cache with prefix fallback
  const restoreKeys = [
    `setup-zig-tarball-${tarballName.split('-').slice(0, -1).join('-')}-`, // Version-agnostic prefix
    'setup-zig-tarball-' // Broad prefix fallback
  ];

  const restoredKey = await cache.restoreCache([tarballCachePath], cacheKey, restoreKeys);
  if (restoredKey) {
    core.info(`Zig tarball cache restored from key: ${restoredKey}`);
    return tarballCachePath;
  }

  core.info(`Cache miss. Fetching Zig ${await common.getVersion()}`);
  const downloadedPath = await downloadTarball(`${tarballName}${tarballExt}`);
  await fs.copyFile(downloadedPath, tarballCachePath)
  await cache.saveCache([tarballCachePath], cacheKey);
  return tarballCachePath;
}

async function main() {
  try {
    // We will check whether Zig is stored in the cache. We use two separate caches.
    // * 'tool-cache' caches the final extracted directory if the same Zig build is used multiple
    //   times by one job. We have this dependency anyway for archive extraction.
    // * 'cache' only caches the unextracted archive, but it does so across runs. It's a little
    //   less efficient, but still much preferable to fetching Zig from a mirror. We have this
    //   dependency anyway for caching the global Zig cache.

    let zigDir = tc.find('zig', await common.getVersion());
    if (!zigDir) {
      const tarballName = await common.getTarballName();
      const tarballExt = await common.getTarballExt();

      core.info(`Fetching ${tarballName}${tarballExt}`);
      const fetchStart = Date.now();
      const tarballPath = await retrieveTarball(tarballName, tarballExt);
      core.info(`fetch took ${Date.now() - fetchStart} ms`);

      core.info(`Extracting tarball ${tarballName}${tarballExt}`);

      const extractStart = Date.now();
      const zigParentDir = tarballExt === '.zip' ?
        await tc.extractZip(tarballPath) :
        await tc.extractTar(tarballPath, null, 'xJ'); // J for xz
      core.info(`extract took ${Date.now() - extractStart} ms`);

      const zigInnerDir = path.join(zigParentDir, tarballName);
      zigDir = await tc.cacheDir(zigInnerDir, 'zig', await common.getVersion());
    }

    core.addPath(zigDir);

    // Direct Zig to use the global cache as every local cache, so that we get maximum benefit from the caching below.
    core.exportVariable('ZIG_LOCAL_CACHE_DIR', await common.getZigCachePath());

    if (core.getBooleanInput('use-cache')) {
      const cacheKey = await common.getCachePrefix();
      const restoreKeys = [
        cacheKey.slice(0, -1), // Remove trailing dash for exact match
        await common.getCachePrefixForJob(), // Job-specific prefix
        'setup-zig-cache-' // Broad prefix fallback
      ];

      const restoredKey = await cache.restoreCache([await common.getZigCachePath()], cacheKey.slice(0, -1), restoreKeys);
      if (restoredKey) {
        core.info(`Zig global cache restored from key: ${restoredKey}`);
      } else {
        core.info('No Zig global cache found, starting fresh');
      }
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
