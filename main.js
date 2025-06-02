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

async function retrieveTarball(tarballName, tarballExt, summaryData = {}) {
  const cacheKey = `setup-zig-tarball-${tarballName}`;
  const tarballCachePath = await common.getTarballCachePath();

  // Cache restore strategy: Only reuse tarball caches from the exact same tarball name
  // Cross-version tarball reuse is unsafe as different versions have different content
  // No fallback keys - tarballs are version-specific and should be exact matches only
  const restoreKeys = []; // No restore keys - exact match only

  try {
    const restoreStart = Date.now();
    const restoredKey = await cache.restoreCache([tarballCachePath], cacheKey, restoreKeys);
    const restoreTime = Date.now() - restoreStart;

    if (restoredKey) {
      core.info(`Zig tarball cache restored from key: ${restoredKey} (${restoreTime}ms)`);
      summaryData.tarballCached = true;
      summaryData.timings.tarballRestore = restoreTime;
      return tarballCachePath;
    }
  } catch (error) {
    core.warning(`Cache restore failed: ${error.message}. Proceeding with download.`);
  }

  core.info(`Cache miss. Fetching Zig ${await common.getVersion()}`);
  const downloadedPath = await downloadTarball(`${tarballName}${tarballExt}`);
  await fs.copyFile(downloadedPath, tarballCachePath);

  try {
    const saveStart = Date.now();
    await cache.saveCache([tarballCachePath], cacheKey);
    const saveTime = Date.now() - saveStart;
    core.info(`Tarball cached with key: ${cacheKey} (${saveTime}ms)`);
    summaryData.timings.tarballSave = saveTime;
  } catch (error) {
    core.warning(`Failed to save tarball cache: ${error.message}`);
  }

  return tarballCachePath;
}

async function generateJobSummary(summaryData) {
  try {
    const totalTime = Date.now() - summaryData.installationTime;

    // Create summary header
    await core.summary
      .addHeading('🔧 Setup Zig Compiler', 2)
      .addRaw('\n')
      .write();

    // Installation info section
    await core.summary
      .addHeading('📦 Installation Details', 3)
      .addTable([
        ['Property', 'Value'],
        ['Zig Version', `\`${summaryData.zigVersion}\``],
        ['Platform', `\`${summaryData.platform}\``],
        ['Total Setup Time', `${totalTime}ms`]
      ])
      .addRaw('\n')
      .write();

    // Cache performance section
    if (summaryData.cacheEnabled) {
      const cacheIcon = summaryData.zigCacheHit ? '✅' : '❌';
      const cacheStatus = summaryData.zigCacheHit ? 'HIT' : 'MISS';
      const tarballIcon = summaryData.tarballCached ? '✅' : '❌';
      const tarballStatus = summaryData.tarballCached ? 'HIT' : 'MISS';

      await core.summary
        .addHeading('🚀 Cache Performance', 3)
        .addTable([
          ['Cache Type', 'Status', 'Key', 'Time (ms)'],
          ['Zig Global Cache', `${cacheIcon} ${cacheStatus}`, `\`${summaryData.zigCacheKey}\``, `${summaryData.timings.cacheRestore || 'N/A'}`],
          ['Tarball Cache', `${tarballIcon} ${tarballStatus}`, summaryData.tarballCached ? '✅ Restored' : '❌ Downloaded', `${summaryData.timings.tarballRestore || summaryData.timings.tarballSave || 'N/A'}`]
        ])
        .addRaw('\n')
        .write();
    } else {
      await core.summary
        .addHeading('🚀 Cache Performance', 3)
        .addRaw('⚠️ Caching is disabled (`use-cache: false`)\n\n')
        .write();
    }

    // Performance breakdown
    if (Object.keys(summaryData.timings).length > 0) {
      const timingRows = [['Operation', 'Time (ms)']];

      if (summaryData.timings.totalFetch) {
        timingRows.push(['Total Fetch/Extract', `${summaryData.timings.totalFetch}`]);
      }
      if (summaryData.timings.extract) {
        timingRows.push(['Archive Extraction', `${summaryData.timings.extract}`]);
      }
      if (summaryData.timings.cacheRestore) {
        timingRows.push(['Cache Restore', `${summaryData.timings.cacheRestore}`]);
      }
      if (summaryData.timings.tarballRestore) {
        timingRows.push(['Tarball Cache Restore', `${summaryData.timings.tarballRestore}`]);
      }
      if (summaryData.timings.tarballSave) {
        timingRows.push(['Tarball Cache Save', `${summaryData.timings.tarballSave}`]);
      }

      if (timingRows.length > 1) {
        await core.summary
          .addHeading('⏱️ Performance Breakdown', 3)
          .addTable(timingRows)
          .addRaw('\n')
          .write();
      }
    }

    // Tips section
    await core.summary
      .addHeading('💡 Tips', 3)
      .addRaw('- Cache hits significantly speed up subsequent runs\n')
      .addRaw('- Use `cache-key` input for matrix builds to ensure proper cache isolation\n')
      .addRaw('- Consider adjusting `cache-size-limit` if you have large Zig projects\n\n')
      .write();

  } catch (error) {
    core.warning(`Failed to generate job summary: ${error.message}`);
  }
}

async function main() {
  try {
    // Initialize job summary tracking
    const summaryData = {
      zigVersion: await common.getVersion(),
      platform: `${os.platform()}-${os.arch()}`,
      installationTime: Date.now(),
      cacheEnabled: core.getBooleanInput('use-cache'),
      tarballCached: false,
      zigCacheHit: false,
      zigCacheKey: 'none',
      timings: {}
    };

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
      const tarballPath = await retrieveTarball(tarballName, tarballExt, summaryData);
      summaryData.timings.totalFetch = Date.now() - fetchStart;
      core.info(`fetch took ${summaryData.timings.totalFetch} ms`);

      core.info(`Extracting tarball ${tarballName}${tarballExt}`);

      const extractStart = Date.now();
      const zigParentDir = tarballExt === '.zip' ?
        await tc.extractZip(tarballPath) :
        await tc.extractTar(tarballPath, null, 'xJ'); // J for xz
      summaryData.timings.extract = Date.now() - extractStart;
      core.info(`extract took ${summaryData.timings.extract} ms`);

      const zigInnerDir = path.join(zigParentDir, tarballName);
      zigDir = await tc.cacheDir(zigInnerDir, 'zig', await common.getVersion());
    }

    core.addPath(zigDir);

    // Set version output for downstream jobs
    const resolvedVersion = summaryData.zigVersion;
    core.setOutput('zig-version', resolvedVersion);
    core.info(`Zig ${resolvedVersion} installed and added to PATH`);

    // Direct Zig to use the global cache as every local cache, so that we get maximum benefit from the caching below.
    core.exportVariable('ZIG_LOCAL_CACHE_DIR', await common.getZigCachePath());

    if (core.getBooleanInput('use-cache')) {
      const cacheKey = await common.getCachePrefix();
      const tarballName = await common.getTarballName();

      // Log cache key information for debugging
      core.info(`Cache configuration: key="${cacheKey}", tarball="${tarballName}"`);

      // Cache restore strategy: Only reuse caches from the exact same Zig version
      // Cross-version cache reuse is unsafe due to compiler-specific build artifacts
      const restoreKeys = [
        `setup-zig-cache-${tarballName}`, // Same version, no user key (safe fallback)
      ];

      try {
        const restoreStart = Date.now();
        const restoredKey = await cache.restoreCache([await common.getZigCachePath()], cacheKey, restoreKeys);
        const restoreTime = Date.now() - restoreStart;

        if (restoredKey) {
          core.info(`Zig global cache restored from key: ${restoredKey} (${restoreTime}ms)`);
          if (restoredKey !== cacheKey) {
            core.info(`Cache fallback used - exact key was: ${cacheKey}`);
          }

          // Set output for cache hit analytics
          core.setOutput('cache-hit', 'true');
          core.setOutput('cache-key-used', restoredKey);

          // Update summary data
          summaryData.zigCacheHit = true;
          summaryData.zigCacheKey = restoredKey;
          summaryData.timings.cacheRestore = restoreTime;
        } else {
          core.info(`No Zig global cache found after ${restoreTime}ms, starting fresh`);
          core.setOutput('cache-hit', 'false');
          core.setOutput('cache-key-used', 'none');

          // Update summary data
          summaryData.zigCacheHit = false;
          summaryData.zigCacheKey = 'none';
          summaryData.timings.cacheRestore = restoreTime;
        }
      } catch (error) {
        core.warning(`Cache restore failed: ${error.message}. Continuing without cache.`);
        core.setOutput('cache-hit', 'false');
        core.setOutput('cache-key-used', 'error');

        // Update summary data
        summaryData.zigCacheHit = false;
        summaryData.zigCacheKey = 'error';
      }
    }

    // Generate job summary
    await generateJobSummary(summaryData);
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
