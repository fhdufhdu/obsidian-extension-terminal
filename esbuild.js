const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: production ? false : 'inline',
    platform: 'node',
    outfile: 'main.js',
    external: ['obsidian', 'node-pty', 'electron'],
    logLevel: 'info',
    loader: {
      '.css': 'text',
    },
  });
  if (watch) {
    await ctx.watch();
    console.log('watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
