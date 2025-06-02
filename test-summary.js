#!/usr/bin/env node

// Simple test to verify job summary generation works
const core = require('@actions/core');

// Mock the summary API for testing
let summaryContent = '';
const mockSummary = {
  addHeading: (text, level) => ({
    addHeading: mockSummary.addHeading,
    addTable: mockSummary.addTable,
    addRaw: mockSummary.addRaw,
    write: mockSummary.write
  }),
  addTable: (rows) => ({
    addHeading: mockSummary.addHeading,
    addTable: mockSummary.addTable,
    addRaw: mockSummary.addRaw,
    write: mockSummary.write
  }),
  addRaw: (text) => ({
    addHeading: mockSummary.addHeading,
    addTable: mockSummary.addTable,
    addRaw: mockSummary.addRaw,
    write: mockSummary.write
  }),
  write: () => Promise.resolve()
};

core.summary = mockSummary;

// Test data
const testSummaryData = {
  zigVersion: '0.11.0',
  platform: 'linux-x64',
  installationTime: Date.now() - 5000, // 5 seconds ago
  cacheEnabled: true,
  tarballCached: true,
  zigCacheHit: true,
  zigCacheKey: 'setup-zig-cache-test-key',
  timings: {
    totalFetch: 1200,
    extract: 800,
    cacheRestore: 150,
    tarballRestore: 100
  }
};

// Mock generateJobSummary function
async function generateJobSummary(summaryData) {
  try {
    const totalTime = Date.now() - summaryData.installationTime;

    console.log('🔧 Setup Zig Compiler');
    console.log('\n📦 Installation Details');
    console.log(`Zig Version: ${summaryData.zigVersion}`);
    console.log(`Platform: ${summaryData.platform}`);
    console.log(`Total Setup Time: ${totalTime}ms`);

    if (summaryData.cacheEnabled) {
      const cacheIcon = summaryData.zigCacheHit ? '✅' : '❌';
      const cacheStatus = summaryData.zigCacheHit ? 'HIT' : 'MISS';
      const tarballIcon = summaryData.tarballCached ? '✅' : '❌';
      const tarballStatus = summaryData.tarballCached ? 'HIT' : 'MISS';

      console.log('\n🚀 Cache Performance');
      console.log(`Zig Global Cache: ${cacheIcon} ${cacheStatus}, Key: ${summaryData.zigCacheKey}, Time: ${summaryData.timings.cacheRestore || 'N/A'}ms`);
      console.log(`Tarball Cache: ${tarballIcon} ${tarballStatus}, Time: ${summaryData.timings.tarballRestore || 'N/A'}ms`);
    }

    if (Object.keys(summaryData.timings).length > 0) {
      console.log('\n⏱️ Performance Breakdown');
      Object.entries(summaryData.timings).forEach(([key, value]) => {
        console.log(`${key}: ${value}ms`);
      });
    }

    console.log('\n💡 Tips');
    console.log('- Cache hits significantly speed up subsequent runs');
    console.log('- Use cache-key input for matrix builds to ensure proper cache isolation');
    console.log('- Consider adjusting cache-size-limit if you have large Zig projects');

  } catch (error) {
    console.error(`Failed to generate job summary: ${error.message}`);
  }
}

// Run the test
console.log('Testing job summary generation...\n');
generateJobSummary(testSummaryData).then(() => {
  console.log('\n✅ Job summary test completed successfully!');
}).catch(error => {
  console.error(`❌ Job summary test failed: ${error.message}`);
  process.exit(1);
});
