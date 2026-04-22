const esbuild = require('esbuild');
const path = require('path');

const commonConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  minify: true,
  sourcemap: true,
  // We mark these as external if they have native components or issues with bundling
  // But for simple setups, standard libraries usually bundle well.
  // We'll try to bundle everything except common native-prone ones if they existed.
  external: [], 
  loader: {
    '.json': 'json',
  },
};

const builds = [
  // API Bundle
  {
    ...commonConfig,
    entryPoints: [path.join(__dirname, '../src/server.js')],
    outfile: path.join(__dirname, '../dist/server.js'),
  },
  // Worker Bundle
  {
    ...commonConfig,
    entryPoints: [path.join(__dirname, '../src/worker.js')],
    outfile: path.join(__dirname, '../dist/worker.js'),
  },
];

async function runBuilds() {
  console.log('🚀 Starting production build with esbuild...');
  try {
    const results = await Promise.all(builds.map(config => esbuild.build(config)));
    console.log('✅ Build completed successfully!');
    console.log('📦 Bundled outputs are in the /dist folder.');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

runBuilds();
