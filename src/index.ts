export namespace Hrana {
	type uint32 = number;
	type uint64 = number;
	type double = number;

	export type Value =
		| Value.Text
		| Value.Float
		| Value.Integer
		| Value.Blob
		| Value.Null;

	export namespace Value {
		export type Text = {
			type: 'text';
			value: string;
		};

		export type Null = {
			type: 'null';
		};

		export type Float = {
			type: 'float';
			value: number;
		};

		export type Integer = {
			type: 'integer';
			value: string;
		};

		export type Blob = {
			type: 'blob';
			base64: string;
		};
	}

	export type Error = {
		message: string;
		code?: string | null;
	};

	export type Stmt = {
		sql: string;
		args?: Value[];
		want_rows?: boolean;
		named_args?: Array<{
			name: string;
			value: Value;
		}>;
	};

	export type StreamRequest =
		| CloseStreamReq
		| ExecuteStreamReq
		| BatchStreamReq;

	export type StreamResponse =
		| CloseStreamResp
		| ExecuteStreamResp
		| BatchStreamResp;

	// https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#execute-a-pipeline-of-requests-json
	export type PipelineReqBody = {
		baton: string | null;
		requests: Array<StreamRequest>;
	};

	export type PipelineRespBody<T extends StreamResponse> = {
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

	export type BatchStreamReq = {
		type: 'batch';
		batch: Batch;
	};

	export type BatchStreamResp = {
		type: 'batch';
		result: BatchResult;
	};

	export type ExecuteStreamReq = {
		type: 'execute';
		stmt: Stmt;
	};

	export type ExecuteStreamResp = {
		type: 'execute';
		result: StmtResult;
	};

	export type StmtResult = {
		cols: Array<Col>;
		rows: Array<Value[]>;
		affected_row_count: uint64;
		last_insert_rowid: string | null;
		rows_read: uint64;
		rows_written: uint64;
		query_duration_ms: double;
	};

	export type Col = {
		name: string | null;
		decltype: string | null;
	};

	export type Batch = {
		steps: Array<BatchStep>;
	};

	export type BatchStep = {
		stmt: Stmt;
		condition?: BatchCond | null;
	};

	export type BatchCond =
		| { type: 'ok'; step: uint32 }
		| { type: 'error'; step: uint32 }
		| { type: 'not'; cond: BatchCond }
		| { type: 'and'; conds: Array<BatchCond> }
		| { type: 'or'; conds: Array<BatchCond> }
		| { type: 'is_autocommit' };

	export type BatchResult = {
		step_results: Array<StmtResult | null>;
		step_errors: Array<Error | null>;
	};
}

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
	T extends Hrana.BatchResult | Hrana.StmtResult,
>(c: Config, input: Hrana.PipelineReqBody): Promise<T> {
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
	if (!r.ok) throw r;

	type Reply = Hrana.ExecuteStreamResp | Hrana.BatchStreamResp;
	let reply = (await r.json() as Hrana.PipelineRespBody<Reply>).results[0];
	if (reply.type === 'ok') return reply.response.result as T;

	let err = new Error(reply.error.message);
	(err as any).code = reply.error.code;
	throw err;
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
 *
 * > [!NOTE]
 * > Throws an `Error` for pipeline statement errors.
 * > Throws the `Response` for non-2xx status codes (eg, Authorization issues).
 */
export function execute(config: Config, query: Hrana.Stmt): Promise<Hrana.StmtResult> {
	return pipeline<Hrana.StmtResult>(config, {
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
 *
 * > [!NOTE]
 * > Throws an `Error` for pipeline statement errors.
 * > Throws the `Response` for non-2xx status codes (eg, Authorization issues).
 */
export function batch(config: Config, ...steps: Hrana.BatchStep[]): Promise<Hrana.BatchResult> {
	return pipeline<Hrana.BatchResult>(config, {
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

// export class Client {
// 	#c: Config;

// 	constructor(config: Config) {
// 		this.#c = config;
// 	}

// 	execute(query: t.Stmt): Promise<t.StmtResult | undefined> {
// 		return execute(this.#c, query);
// 	}

// 	batch(...steps: t.BatchStep[]): Promise<t.BatchResult | undefined> {
// 		return batch(this.#c, ...steps);
// 	}
// }

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
export function parse<T extends Row = Row>(result: Hrana.StmtResult, mode?: Mode): T[] {
	let { cols, rows } = result;
	let i = 0, len = rows.length;
	let k = 0, klen = cols.length;
	let row: Row, tmp: Hrana.Value[];
	let c: Hrana.Col, v: Hrana.Value;

	let output = Array<Row>(len);

	for (; i < len; i++) {
		row = {};
		tmp = rows[i];

		for (k = 0; k < klen; k++) {
			c = cols[k];
			if (c.name) {
				v = tmp[k];
				if (c.decltype) {
					v.type = c.decltype.toLowerCase() as Hrana.Value['type'];
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
export function value(raw: Hrana.Value.Null): null;
export function value(raw: Hrana.Value.Text): string;
export function value(raw: Hrana.Value.Blob): Uint8Array;
export function value(raw: Hrana.Value.Float): number;
export function value(raw: Hrana.Value.Integer): number;
export function value(raw: Hrana.Value.Integer, mode: 'number'): number;
export function value(raw: Hrana.Value.Integer, mode: 'string'): string;
export function value(raw: Hrana.Value.Integer, mode: 'bigint'): bigint;
export function value(raw: Hrana.Value, mode?: Mode): string | number | bigint | Uint8Array | null;
export function value(raw: Hrana.Value, mode?: Mode) {
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
