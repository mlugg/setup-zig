#!/usr/bin/env node

// Test script to validate cache key generation
const os = require('os');

console.log('=== Testing Cache Key Generation ===');
console.log('Platform:', os.platform());
console.log('Architecture:', os.arch());

// Test tarball naming
function getTarballName(version) {
  let arch = {
    arm:      'armv7a',
    arm64:    'aarch64',
    loong64:  'loongarch64',
    x64:      'x86_64',
    ia32:     'x86',
  }[os.arch()] || os.arch();

  const platform = {
    linux:   'linux',
    darwin:  'macos',
    win32:   'windows',
  }[os.platform()] || os.platform();

  // Test legacy vs new naming
  function useLegacyTarballName(version) {
    const parts = version.split('.');
    if (parts.length == 3) {
      if (parts[0] !== "0") return false;
      if (parts[1] === "14" && parts[2] !== "0") return false;
      const minor = parseInt(parts[1]);
      if (!Number.isFinite(minor)) return false;
      if (minor >= 15) return false;
      return true;
    }
    return false;
  }

  if (useLegacyTarballName(version)) {
    return `zig-${platform}-${arch}-${version}`;
  } else {
    return `zig-${arch}-${platform}-${version}`;
  }
}

function getCachePrefix(tarballName, userKey) {
  return `setup-zig-cache-${tarballName}${userKey ? `-${userKey}` : ''}`;
}

// Test different scenarios
const testCases = [
  { version: '0.14.0', userKey: '' },
  { version: '0.14.1', userKey: '' },
  { version: '0.15.0', userKey: '' },
  { version: '0.14.0', userKey: 'my-matrix-key' },
];

testCases.forEach(({ version, userKey }) => {
  const tarballName = getTarballName(version);
  const cacheKey = getCachePrefix(tarballName, userKey);
  console.log(`\nVersion: ${version}, User Key: "${userKey}"`);
  console.log(`  Tarball: ${tarballName}`);
  console.log(`  Cache Key: ${cacheKey}`);
});

console.log('\n=== Cache Key Fallback Hierarchy ===');
const version = '0.14.0';
const userKey = 'matrix-key';
const tarballName = getTarballName(version);
const primaryKey = getCachePrefix(tarballName, userKey);

const restoreKeys = [
  `setup-zig-cache-${tarballName}`, // Same version, no user key
  `setup-zig-cache-${tarballName.split('-').slice(0, -1).join('-')}`, // Version-agnostic
  'setup-zig-cache-zig-', // Any Zig cache for same arch/platform
  'setup-zig-cache-' // Broad fallback
];

console.log('Primary key:', primaryKey);
console.log('Restore keys:');
restoreKeys.forEach((key, i) => {
  console.log(`  ${i + 1}. ${key}`);
});
