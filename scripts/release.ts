import { assert } from 'jsr:@std/assert@^1.0';
import { resolve } from 'jsr:@std/path@^1.0';

const version = Deno.args[0];
assert(version, 'Missing <version> value!');

let input = resolve('deno.json');
let content = await Deno.readTextFile(input);

let config = JSON.parse(content);
config.version = version;

type Options = Omit<Deno.CommandOptions, 'args'> & { cmd: string[] };
async function run(label: string, options: Options) {
	let [cmd, ...args] = options.cmd;
	let p = await new Deno.Command(cmd, { ...options, args }).output();
	assert(p.code === 0, label);
}

content = JSON.stringify(config, null, 2);
await Deno.writeTextFile(input, content);

// prevent CI error
await run('deno fmt', {
	cmd: ['deno', 'fmt', input],
});

await run('git add', {
	cmd: ['git', 'add', input],
});

await run('git commit', {
	cmd: ['git', 'commit', '-m', `v${version}`],
});

await run('git tag', {
	cmd: ['git', 'tag', `v${version}`],
});

await run('git push', {
	cmd: ['git', 'push', 'origin', 'main', '--tags'],
});
