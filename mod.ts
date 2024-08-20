type uint32 = number;
type uint64 = number;
type double = number;

type Value =
	| { type: 'null' }
	| { type: 'integer'; value: string }
	| { type: 'float'; value: number }
	| { type: 'text'; value: string }
	| { type: 'blob'; base64: string };

type Stmt = {
	sql: string;
	args?: Value[];
	want_rows?: boolean;
	named_args?: Array<{
		name: string;
		value: Value;
	}>;
};

type StreamRequest =
	| CloseStreamReq
	| ExecuteStreamReq
	| BatchStreamReq;

type StreamResponse =
	| CloseStreamResp
	| ExecuteStreamResp
	| BatchStreamResp;

// https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#execute-a-pipeline-of-requests-json
type PipelineReqBody = {
	baton: string | null;
	requests: Array<StreamRequest>;
};

type PipelineRespBody<T extends StreamResponse> = {
	baton: string | null;
	base_url: string | null;
	results: Array<
		| StreamResultOk<T>
		| StreamResultError
	>;
};

type CloseStreamReq = {
	type: 'close';
};

type CloseStreamResp = {
	type: 'close';
};

type StreamResultOk<T extends StreamResponse> = {
	type: 'ok';
	response: T;
};

type StreamResultError = {
	type: 'error';
	error: Error;
};

type BatchStreamReq = {
	type: 'batch';
	batch: Batch;
};

type BatchStreamResp = {
	type: 'batch';
	result: BatchResult;
};

type ExecuteStreamReq = {
	type: 'execute';
	stmt: Stmt;
};

type ExecuteStreamResp = {
	type: 'execute';
	result: StmtResult;
};

type StmtResult = {
	cols: Array<Col>;
	rows: Array<Array<Value>>;
	affected_row_count: uint64;
	last_insert_rowid: string | null;
	rows_read: uint64;
	rows_written: uint64;
	query_duration_ms: double;
};

type Col = {
	name: string | null;
	decltype: string | null;
};

type Batch = {
	steps: Array<BatchStep>;
};

type BatchStep = {
	stmt: Stmt;
	condition?: BatchCond | null;
};

type BatchCond =
	| { type: 'ok'; step: uint32 }
	| { type: 'error'; step: uint32 }
	| { type: 'not'; cond: BatchCond }
	| { type: 'and'; conds: Array<BatchCond> }
	| { type: 'or'; conds: Array<BatchCond> }
	| { type: 'is_autocommit' };

type BatchResult = {
	step_results: Array<StmtResult | null>;
	step_errors: Array<Error | null>;
};

// ---

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

async function pipeline<T extends StreamResponse>(c: Config, input: PipelineReqBody): Promise<
	PipelineRespBody<T> | undefined
> {
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

	let r = await request(c, '/v3/pipeline', { method, body, headers });
	if (r.ok) return r.json() as Promise<PipelineRespBody<T>>;
}

function request(c: Config, path: `/${string}`, init?: RequestInit) {
	if (c.token) {
		init ||= {};
		init.headers = new Headers(init.headers);
		(init.headers as Headers).set('Authorization', `Bearer ${c.token}`);
	}

	return (c.fetch || fetch)(c.url + path, init);
}

export async function execute(config: Config, query: Stmt): Promise<StmtResult | undefined> {
	let reply = await pipeline<ExecuteStreamResp>(config, {
		baton: null,
		requests: [{
			type: 'execute',
			stmt: query,
		}, {
			type: 'close',
		}],
	});

	let result = reply && reply.results[0];
	if (result && result.type === 'ok') {
		return result.response.result;
	}
}

export async function batch(
	config: Config,
	...steps: BatchStep[]
): Promise<BatchResult | undefined> {
	let reply = await pipeline<BatchStreamResp>(config, {
		baton: null,
		requests: [{
			type: 'batch',
			batch: {
				steps,
			},
		}, {
			type: 'close',
		}],
	});

	let result = reply && reply.results[0];
	if (result && result.type === 'ok') {
		return result.response.result;
	}
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

	execute(query: Stmt): Promise<StmtResult | undefined> {
		return execute(this.#c, query);
	}

	batch(...steps: BatchStep[]): Promise<BatchResult | undefined> {
		return batch(this.#c, ...steps);
	}
}
