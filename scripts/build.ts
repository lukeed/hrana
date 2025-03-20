import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { transform } from 'npm:oxc-transform@0.61.0';
import { minify } from 'npm:oxc-minify@0.61.0';

const Quiet = Deno.args.includes('--quiet');

let pkg = await import('../package.json', {
	with: { type: 'json' },
}).then((m) => m.default);

// build "jsr.json" file
// @see https://jsr.io/schema/config-file.v1.json
let jsr = {
	version: pkg.version,
	name: `@lukeed/${pkg.name}`,
	exports: {
		'.': './index.ts',
	},
	publish: {
		include: [
			'license',
			'index.ts',
			'readme.md',
		],
	},
};

function log(...args: unknown[]) {
	Quiet || console.log(...args);
}

function bail(label: string, errors: unknown): never {
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

async function reset(target: string) {
	let name = basename(target);

	if (existsSync(target)) {
		console.log('! removing "%s" directory', name);
		await Deno.remove(outdir, { recursive: true });
	}

	await Deno.mkdir(outdir, { recursive: true });
	log('%s/', name);
}

async function translate(file: string) {
	let entry = resolve(file);
	let filename = basename(entry);
	let source = await Deno.readTextFile(entry);

	let xform = transform(entry, source, {
		typescript: {
			allowNamespaces: true,
			onlyRemoveTypeImports: true,
			declaration: {
				stripInternal: true,
			},
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
		let min = minify(outfile, xform.code, {
			compress: {
				dropConsole: true,
			},
			mangle: {
				toplevel: true,
			},
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

let outdir = resolve('build/jsr');
let outfile = join(outdir, 'jsr.json');

await reset(outdir);

await copy('src/index.ts');
await copy('readme.md');
await copy('license');

await write(outfile, JSON.stringify(jsr, null, 2));

// build "/npm" package
// ---

outdir = resolve('build/npm');
await reset(outdir);

await write(
	join(outdir, 'package.json'),
	JSON.stringify(pkg, null, 2),
);

await copy('readme.md');
await copy('license');

await translate('src/index.ts');
