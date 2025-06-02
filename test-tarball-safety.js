#!/usr/bin/env node

// Test script to demonstrate tarball cache key safety issues
console.log('=== Tarball Cache Key Safety Analysis ===\n');

// Example tarball names for different scenarios
const testCases = [
  { name: 'zig-linux-x86_64-0.14.0', description: 'Legacy naming - Zig 0.14.0 on Linux x64' },
  { name: 'zig-linux-x86_64-0.14.1', description: 'Legacy naming - Zig 0.14.1 on Linux x64' },
  { name: 'zig-x86_64-linux-0.15.0', description: 'New naming - Zig 0.15.0 on Linux x64' },
  { name: 'zig-x86_64-linux-0.15.1', description: 'New naming - Zig 0.15.1 on Linux x64' },
  { name: 'zig-aarch64-macos-0.15.0', description: 'New naming - Zig 0.15.0 on macOS ARM64' },
];

console.log('🔍 Testing problematic OLD restore key strategy:\n');

testCases.forEach(testCase => {
  const { name, description } = testCase;
  const cacheKey = `setup-zig-tarball-${name}`;

  // OLD problematic restore keys
  const oldRestoreKeys = [
    `setup-zig-tarball-${name.split('-').slice(0, -1).join('-')}`, // Version-agnostic prefix
    'setup-zig-tarball-' // Broad prefix fallback
  ];

  console.log(`${description}:`);
  console.log(`  Primary key: ${cacheKey}`);
  console.log(`  ❌ UNSAFE restore keys:`);
  oldRestoreKeys.forEach((key, i) => {
    console.log(`    ${i + 1}. ${key}`);
  });
  console.log();
});

console.log('⚠️  PROBLEMS with old approach:');
console.log('1. Version-agnostic keys could match wrong Zig versions');
console.log('2. "setup-zig-tarball-zig-linux-x86_64" could match ANY Linux x64 version');
console.log('3. "setup-zig-tarball-" could match ANY tarball regardless of platform/version');
console.log('4. Could lead to using wrong tarball for a specific Zig version');
console.log('5. Potential build failures due to version mismatches\n');

console.log('✅ NEW safe strategy:\n');

testCases.forEach(testCase => {
  const { name, description } = testCase;
  const cacheKey = `setup-zig-tarball-${name}`;

  console.log(`${description}:`);
  console.log(`  Primary key: ${cacheKey}`);
  console.log(`  ✅ SAFE restore keys: [] (exact match only)`);
  console.log();
});

console.log('✅ BENEFITS of new approach:');
console.log('1. Exact version matching - no cross-version contamination');
console.log('2. Platform safety - no wrong architecture/OS matches');
console.log('3. Predictable behavior - cache hit means exact tarball match');
console.log('4. Consistent with global cache safety strategy');
console.log('5. Eliminates potential for subtle build failures\n');

console.log('📊 Impact analysis:');
console.log('- Cache hit rate may be slightly lower (exact matches only)');
console.log('- BUT: Eliminates risk of using wrong tarball version');
console.log('- Tarball downloads are relatively fast compared to Zig cache builds');
console.log('- Safety is more important than marginal cache hit rate improvement');
console.log('\n✅ Recommendation: Use exact-match strategy for tarball caching');
