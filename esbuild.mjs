import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** VS Code extensions are CommonJS and must treat `vscode` as external. */
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
