import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import oxc from 'npm:oxc-transform@^0.27';
import { minify } from 'npm:terser@5.32.0';

const Quiet = Deno.args.includes('--quiet');

const version = Deno.args[0];
console.log('? version:', version);

// build "jsr.json" file
// @see https://jsr.io/schema/config-file.v1.json
let jsr = {
	version: version,
	name: '@lukeed/hrana',
	exports: {
		'.': './index.ts',
	},
};

function log(...args: unknown[]) {
	Quiet || console.log(...args);
}

function bail(label: string, errors: string[]): never {
	console.error('[%s] error(s)', label, errors);
	Deno.exit(1);
}

function write(file: string, text: string) {
	log('  +', basename(file));
	return Deno.writeTextFile(file, text);
}

function copy(file: string) {
	let input = resolve(file);
	if (existsSync(input)) {
		let filename = basename(input);
		let output = join(outdir, filename);

		log('  +', filename);
		return Deno.copyFile(input, output);
	}
}

async function transform(file: string) {
	let entry = resolve(file);
	let filename = basename(entry);
	let source = await Deno.readTextFile(entry);

	let xform = oxc.transform(entry, source, {
		typescript: {
			onlyRemoveTypeImports: true,
			declaration: true,
		},
	});

	if (xform.errors.length > 0) {
		bail('transform', xform.errors);
	}

	let rgx = /\.tsx?$/;
	let dts = filename.replace(rgx, '.d.mts');
	entry = filename.replace(rgx, '.mjs');

	let outfile = join(outdir, dts);
	await write(outfile, xform.declaration!);

	outfile = join(outdir, entry);
	await write(outfile, xform.code);

	try {
		let min = await minify(xform.code, {
			ecma: 2020,
			mangle: true,
			compress: true,
			toplevel: true,
			module: true,
		});

		if (!min.code) throw 1;

		let bytes = await gzip(min.code);
		log('::notice::%s (%d b)', entry, bytes);
	} catch (err) {
		bail('terser', err);
	}
}

async function gzip(raw: string) {
	let gzip = new CompressionStream('gzip');

	let writer = gzip.writable.getWriter();
	writer.write(new TextEncoder().encode(raw));
	writer.close();

	let size = 0;
	let reader = gzip.readable.getReader();

	while (true) {
		let b = await reader.read();
		if (b.done) return size;
		size += b.value.length;
	}
}

// --- JSR ---

let outdir = resolve('jsr');
let outfile = join(outdir, 'jsr.json');

if (existsSync(outdir)) {
	console.log('! removing "jsr" directory');
	await Deno.remove(outdir, { recursive: true });
}

await Deno.mkdir(outdir);
log('jsr/');

await copy('src/index.ts');
await copy('src/hrana.ts');
await copy('readme.md');
await copy('license');

await write(outfile, JSON.stringify(jsr, null, 2));

// build "/npm" package
// ---

outdir = resolve('npm');

if (existsSync(outdir)) {
	console.log('! removing "npm" directory');
	await Deno.remove(outdir, { recursive: true });
}

await Deno.mkdir(outdir);
log('npm/');

await copy('package.json');
await copy('readme.md');
await copy('license');

await copy('src/hrana.ts');

await transform('src/index.ts');
