const os = require('os');
const path = require('path');
const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');

const VERSIONS_JSON = 'https://ziglang.org/download/index.json';
const MACH_VERSIONS_JSON = 'https://pkg.machengine.org/zig/index.json';
const CACHE_PREFIX = "setup-zig-global-cache-";

let _cached_version = null;
async function getVersion() {
  if (_cached_version != null) {
    return _cached_version;
  }

  const raw = core.getInput('version');
  if (raw === 'master') {
    const resp = await fetch(VERSIONS_JSON);
    const versions = await resp.json();
    _cached_version = versions['master'].version;
  } else if (raw === 'latest') {
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
    _cached_version = latest;
  } else if (raw.includes("mach")) {
    const resp = await fetch(MACH_VERSIONS_JSON);
    const versions = await resp.json();
    if (!(raw in versions)) {
      throw new Error(`Mach nominated version '${raw}' not found`);
    }
    _cached_version = versions[raw].version;
  } else {
    _cached_version = raw;
  }

  return _cached_version;
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

  return `zig-${platform}-${arch}-${version}`;
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
  return `setup-zig-cache-${job_name}-${tarball_name}-`;
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
