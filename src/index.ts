import type * as t from './hrana.ts';

export type Config = {
	/**
	 * The database URL.
	 *
	 * **NOTE:** Only `https://` URLs are supported.
	 */
	url: string;

	/**
	 * Authentication token for the database.
	 */
	token?: string;

	/**
	 * Custom `fetch` implementation.
	 *
	 * @default `globalThis.fetch`
	 */
	fetch?: typeof globalThis.fetch;
};

async function pipeline<
	T extends t.BatchResult | t.StmtResult,
>(c: Config, input: t.PipelineReqBody): Promise<T | undefined> {
	let method = 'POST';
	let headers = new Headers();
	let body: BodyInit | null = null;

	if (c.token) {
		headers.set('Authorization', `Bearer ${c.token}`);
	}

	if (input != null) {
		body = JSON.stringify(input);
		headers.set('Content-Type', 'application/json');
	}

	type Reply = t.ExecuteStreamResp | t.BatchStreamResp;
	let r = await request(c, '/v3/pipeline', { method, body, headers });
	let reply = r.ok && (await r.json() as t.PipelineRespBody<Reply>).results[0];
	if (reply && reply.type === 'ok') return reply.response.result as T;
}

function request(c: Config, path: `/${string}`, init?: RequestInit) {
	if (c.token) {
		init ||= {};
		init.headers = new Headers(init.headers);
		(init.headers as Headers).set('Authorization', `Bearer ${c.token}`);
	}

	return (c.fetch || fetch)(c.url + path, init);
}

/**
 * Execute a single statement.
 */
export function execute(config: Config, query: t.Stmt): Promise<t.StmtResult | undefined> {
	return pipeline<t.StmtResult>(config, {
		baton: null,
		requests: [{
			type: 'execute',
			stmt: query,
		}, {
			type: 'close',
		}],
	});
}

/**
 * Execute a batch of statements, which will be executed sequentially.
 *
 * If the condition of a step is present and evaluates to false, the statement is not executed.
 */
export function batch(config: Config, ...steps: t.BatchStep[]): Promise<t.BatchResult | undefined> {
	return pipeline<t.BatchResult>(config, {
		baton: null,
		requests: [{
			type: 'batch',
			batch: { steps },
		}, {
			type: 'close',
		}],
	});
}

/**
 * Check if the server supports Hrana V3 over HTTP with JSON encoding.
 * @see https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#check-support-for-version-3-json
 */
export function supports(config: Config): Promise<boolean> {
	return request(config, '/v3').then((r) => r.ok);
}

export class Client {
	#c: Config;

	constructor(config: Config) {
		this.#c = config;
	}

	execute(query: t.Stmt): Promise<t.StmtResult | undefined> {
		return execute(this.#c, query);
	}

	batch(...steps: t.BatchStep[]): Promise<t.BatchResult | undefined> {
		return batch(this.#c, ...steps);
	}
}

/**
 * Parsing options for "integer" values.
 * @default "number"
 * @see https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#values
 */
export type Mode = 'number' | 'bigint' | 'string';

/**
 * The parsed Row type.
 */
export type Row = {
	[column: string]: unknown;
};

/**
 * Parse all Rows from the statement results.
 *
 * @param result The statement results.
 * @param mode The {@link Mode} for "integer" column parsing; default="number"
 */
export function parse<T extends Row = Row>(result: t.StmtResult, mode?: Mode): T[] {
	let { cols, rows } = result;
	let i = 0, len = rows.length;
	let k = 0, klen = cols.length;
	let row: Row, tmp: t.Value[];
	let c: t.Col, v: t.Value;

	let output = Array<Row>(len);

	for (; i < len; i++) {
		row = {};
		tmp = rows[i];

		for (k = 0; k < klen; k++) {
			c = cols[k];
			if (c.name) {
				v = tmp[k];
				if (c.decltype) {
					v.type = c.decltype as t.Value['type'];
				}
				row[c.name] = value(v, mode);
			}
		}

		output[i] = row;
	}

	return output as T[];
}

/**
 * Parse a column's value.
 *
 * @param raw The value to parse.
 * @param mode The integer {@link Mode}; default="number"
 */
export function value(raw: t.Value.Null): null;
export function value(raw: t.Value.Text): string;
export function value(raw: t.Value.Blob): Uint8Array;
export function value(raw: t.Value.Float): number;
export function value(raw: t.Value.Integer): number;
export function value(raw: t.Value.Integer, mode: 'number'): number;
export function value(raw: t.Value.Integer, mode: 'string'): string;
export function value(raw: t.Value.Integer, mode: 'bigint'): bigint;
export function value(raw: t.Value, mode?: Mode): string | number | bigint | Uint8Array | null;
export function value(raw: t.Value, mode?: Mode) {
	switch (raw.type) {
		case 'null':
			return null;

		case 'text':
			return raw.value;

		case 'float':
			return +raw.value;

		case 'integer': {
			if (!mode || mode === 'number') {
				return +raw.value; // mode (int)
			}

			if (mode === 'bigint') {
				return BigInt(raw.value);
			}

			return raw.value;
		}

		case 'blob':
			return decode(raw.base64);
	}
}

function decode(b64: string): Uint8Array {
	let bin = atob(b64);
	let i = 0, size = bin.length;
	let bytes = new Uint8Array(size);
	for (; i < size; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}
