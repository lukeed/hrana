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

// https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#check-support-for-version-3-json
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
