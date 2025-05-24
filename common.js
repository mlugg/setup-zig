const os = require('os');
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');

const VERSIONS_JSON = 'https://ziglang.org/download/index.json';
const MACH_VERSIONS_JSON = 'https://pkg.machengine.org/zig/index.json';
const CACHE_PREFIX = "setup-zig-global-cache-";

// Mach uses `mach_zig_version` in `build.zig.zon` to signify Mach nominated versions.
// See: https://github.com/marler8997/anyzig?tab=readme-ov-file#mach-versions-and-download-mirror
const MACH_ZIG_VERSION_REGEX = /\.\s*mach_zig_version\s*=\s*"(.*?)"/;
const MINIMUM_ZIG_VERSION_REGEX = /\.\s*minimum_zig_version\s*=\s*"(.*?)"/;

let _cached_version = null;
async function getVersion() {
  if (_cached_version != null) {
    return _cached_version;
  }

  let raw = core.getInput('version');
  if (raw === '') {
    try {
      const zon = await fs.promises.readFile('build.zig.zon', 'utf8');

      // Look for `mach_zig_version` first
      let match = MACH_ZIG_VERSION_REGEX.exec(zon);
      if (match !== null) {
        _cached_version = await getMachVersion(match[1]);
        return _cached_version;
      }

      // Else, look for `mach_zig_version` first
      match = MINIMUM_ZIG_VERSION_REGEX.exec(zon);
      if (match !== null) {
        _cached_version = match[1];
        return _cached_version;
      }

      core.info('Failed to find `mach_zig_version` or `minimum_zig_version` in build.zig.zon (using latest)');
    } catch (e) {
      core.info(`Failed to read build.zig.zon (using latest): ${e}`);
    }

    raw = 'latest';
  }

  if (raw === 'master') {
    _cached_version = await getMasterVersion();
  } else if (raw === 'latest') {
    _cached_version = await getLatestVersion();
  } else if (raw.includes("mach")) {
    _cached_version = await getMachVersion(raw);
  } else {
    _cached_version = raw;
  }

  return _cached_version;
}

async function getMachVersion(raw) {
  const resp = await fetch(MACH_VERSIONS_JSON);
  const versions = await resp.json();
  if (!(raw in versions)) {
    throw new Error(`Mach nominated version '${raw}' not found`);
  }
  return versions[raw].version;
}
async function getMasterVersion() {
  const resp = await fetch(VERSIONS_JSON);
  const versions = await resp.json();
  return versions['master'].version;
}
async function getLatestVersion() {
  const resp = await fetch(VERSIONS_JSON);
  const versions = await resp.json();
  let latest = null;
  let latest_major;
  let latest_minor;
  let latest_patch;
  for (const version in versions) {
    if (version === 'master') continue;
    const [major_str, minor_str, patch_str] = version.split('.')
    const major = Number(major_str);
    const minor = Number(minor_str);
    const patch = Number(patch_str);
    if (latest === null) {
      latest = version;
      latest_major = major;
      latest_minor = minor;
      latest_patch = patch;
      continue;
    }
    if (major > latest_major ||
        (major == latest_major && minor > latest_minor) ||
        (major == latest_major && minor == latest_minor && patch > latest_patch))
    {
      latest = version;
      latest_major = major;
      latest_minor = minor;
      latest_patch = patch;
    }
  }
  return latest;
}

async function getTarballName() {
  const version = await getVersion();

  let arch = {
    arm:      'armv7a',
    arm64:    'aarch64',
    loong64:  'loongarch64',
    mips:     'mips',
    mipsel:   'mipsel',
    mips64:   'mips64',
    mips64el: 'mips64el',
    ppc64:    'powerpc64',
    riscv64:  'riscv64',
    s390x:    's390x',
    ia32:     'x86',
    x64:      'x86_64',
  }[os.arch()];

  // For some incomprehensible reason, Node.js's brain-damaged build system explicitly throws away
  // the knowledge that it is building for ppc64le, so os.arch() will identify it as ppc64 even on
  // little endian.
  if (arch === 'powerpc64' && os.endianness() === 'LE') {
    arch = 'powerpc64le';
  }

  const platform = {
    aix:     'aix',
    android: 'android',
    freebsd: 'freebsd',
    linux:   'linux',
    darwin:  'macos',
    openbsd: 'openbsd',
    sunos:   'solaris',
    win32:   'windows',
  }[os.platform()];

  let legacy_format = true;
  const parts = version.split('.');
  if (parts.length === 3) {
    const major = parseInt(parts[0]);
    const minor = parseInt(parts[1]);
    const patch = parseInt(parts[2]);
    legacy_format = major === 0 && minor < 14 || (minor === 14 && patch === 0);
  }

  return legacy_format ? `zig-${platform}-${arch}-${version}` : `zig-${arch}-${platform}-${version}`;
}

async function getTarballExt() {
  return {
    linux:  '.tar.xz',
    darwin: '.tar.xz',
    win32:  '.zip',
  }[os.platform()];
}

async function getCachePrefix() {
  const tarball_name = await getTarballName();
  const job_name = github.context.job.replaceAll(/[^\w]/g, "_");
  const user_key = core.getInput('cache-key');

  return `setup-zig-cache-${job_name}-${tarball_name}-${user_key}-`;
}

async function getZigCachePath() {
  let env_output = '';
  await exec.exec('zig', ['env'], {
    listeners: {
      stdout: (data) => {
        env_output += data.toString();
      },
    },
  });
  return JSON.parse(env_output)['global_cache_dir'];
}

async function getTarballCachePath() {
  return path.join(process.env['RUNNER_TEMP'], await getTarballName());
}

module.exports = {
  getVersion,
  getTarballName,
  getTarballExt,
  getCachePrefix,
  getZigCachePath,
  getTarballCachePath,
};
