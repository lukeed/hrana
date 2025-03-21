const INPUT = 'https://raw.githubusercontent.com/tursodatabase/libsql/main/docs/HRANA_3_SPEC.md';
const OUTPUT = 'hrana-v3.md';

let r = await fetch(INPUT);
if (!r.ok) throw new Error(`[${r.status}] ${await r.text()}`);

await Deno.writeFile(OUTPUT, await r.bytes());
await new Deno.Command(Deno.execPath(), { args: ['fmt', OUTPUT] }).output();

console.log('+', OUTPUT);
