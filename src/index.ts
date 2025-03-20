/**
 * The native Hrana types.
 */
export namespace Hrana {
	type uint32 = number;
	type uint64 = number;
	type double = number;

	/**
	 * The value structures that come from the Hrana server.
	 */
	export type Value =
		| Value.Text
		| Value.Float
		| Value.Integer
		| Value.Blob
		| Value.Null;

	/**
	 * The {@link Hrana.Value} sub-types.
	 */
	export namespace Value {
		/**
		 * The parsed value JS type(s) that {@link parse} and/or {@link decode} will return.
		 */
		export type Decoded = string | number | bigint | Uint8Array | null;

		/**
		 * A string value.
		 */
		export type Text = {
			type: 'text';
			value: string;
		};

		/**
		 * A null value.
		 */
		export type Null = {
			type: 'null';
		};

		/**
		 * A floating-point value.
		 */
		export type Float = {
			type: 'float';
			value: number;
		};

		/**
		 * An integer value.
		 */
		export type Integer = {
			type: 'integer';
			value: string;
		};

		/**
		 * A binary value.
		 */
		export type Blob = {
			type: 'blob';
			base64: string;
		};
	}

	/**
	 * An Hrana error response structure
	 */
	export type Error = {
		message: string;
		code?: string | null;
	};

	/**
	 * A Hrana statement structure.
	 */
	export type Stmt = {
		sql: string;
		args?: Value[];
		want_rows?: boolean;
		named_args?: Array<{
			name: string;
			value: Value;
		}>;
	};

	/**
	 * An Hrana `StreamRequest` structure.
	 */
	export type StreamRequest =
		| CloseStreamReq
		| ExecuteStreamReq
		| BatchStreamReq;

	/**
	 * An Hrana `StreamResponse` structure.
	 */
	export type StreamResponse =
		| CloseStreamResp
		| ExecuteStreamResp
		| BatchStreamResp;

	/**
	 * An Hrana `PipelineReqBody` structure.
	 * @see https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#execute-a-pipeline-of-requests-json
	 */
	export type PipelineReqBody = {
		baton: string | null;
		requests: Array<StreamRequest>;
	};

	/**
	 * An Hrana `PipelineRespBody` structure.
	 * @see https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#execute-a-pipeline-of-requests-json
	 */
	export type PipelineRespBody<T extends StreamResponse> = {
		baton: string | null;
		base_url: string | null;
		results: Array<
			| StreamResultOk<T>
			| StreamResultError
		>;
	};

	/**
	 * An Hrana `CloseStreamReq` structure.
	 *
	 * The close request closes the stream.
	 */
	type CloseStreamReq = {
		type: 'close';
	};

	/**
	 * An Hrana `CloseStreamResp` structure.
	 *
	 * The response from closing a stream.
	 */
	type CloseStreamResp = {
		type: 'close';
	};

	/**
	 * An Hrana `StreamResultOk` structure.
	 *
	 * Successfully executed a pipeline of requests.
	 */
	type StreamResultOk<T extends StreamResponse> = {
		type: 'ok';
		response: T;
	};

	/**
	 * An Hrana `StreamResultError` structure.
	 *
	 * An error occurred while executing a pipeline of requests.
	 */
	type StreamResultError = {
		type: 'error';
		error: Error;
	};

	/**
	 * An Hrana `BatchStreamReq` structure.
	 *
	 * The request to execute a batch of statements.
	 */
	export type BatchStreamReq = {
		type: 'batch';
		batch: Batch;
	};

	/**
	 * An Hrana `BatchStreamResp` structure.
	 *
	 * The response from executing a batch of statements.
	 */
	export type BatchStreamResp = {
		type: 'batch';
		result: BatchResult;
	};

	/**
	 * An Hrana `ExecuteStreamReq` structure.
	 *
	 * The request to execute a statement.
	 */
	export type ExecuteStreamReq = {
		type: 'execute';
		stmt: Stmt;
	};

	/**
	 * An Hrana `ExecuteStreamResp` structure.
	 *
	 * The response from executing a statement.
	 */
	export type ExecuteStreamResp = {
		type: 'execute';
		result: StmtResult;
	};

	/**
	 * A Hrana statement result structure.
	 */
	export type StmtResult = {
		cols: Array<Col>;
		rows: Array<Value[]>;
		affected_row_count: uint64;
		last_insert_rowid: string | null;
		rows_read: uint64;
		rows_written: uint64;
		query_duration_ms: double;
	};

	/**
	 * Hrana Column information.
	 */
	export type Col = {
		name: string | null;
		decltype: string | null;
	};

	/**
	 * An Hrana batch structure.
	 */
	export type Batch = {
		steps: Array<BatchStep>;
	};

	/**
	 * An individual Hrana batch step structure.
	 */
	export type BatchStep = {
		stmt: Stmt;
		condition?: BatchCond | null;
	};

	/**
	 * An Hrana batch condition structure.
	 */
	export type BatchCond =
		| { type: 'ok'; step: uint32 }
		| { type: 'error'; step: uint32 }
		| { type: 'not'; cond: BatchCond }
		| { type: 'and'; conds: Array<BatchCond> }
		| { type: 'or'; conds: Array<BatchCond> }
		| { type: 'is_autocommit' };

	/**
	 * The result of executing a batch.
	 */
	export type BatchResult = {
		step_results: Array<StmtResult | null>;
		step_errors: Array<Error | null>;
	};
}

/**
 * The credentials and/or configuration for the Hrana client.
 */
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
export function batch(config: Config, steps: Hrana.BatchStep[]): Promise<Hrana.BatchResult> {
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
 * The Transaction Mode.
 *
 * * `IMMEDIATE` - starts a transaction and commits it immediately.
 * * `DEFERRED` - only starts a transaction once a read/write is attempted. (default)
 * * `READONLY` - starts a read-only transaction that fails if any writes occur.
 *
 * @see https://www.sqlite.org/lang_transaction.html
 * @source https://github.com/tursodatabase/libsql/commit/91f4780c0b5eeb738c10abd82d1d8a97e99b2923
 */
export type TransactionMode = 'readonly' | 'immediate' | 'deferred';

/**
 * Execute a transaction.
 *
 * > [!NOTE]
 * > Throws an `Error` for pipeline statement errors.
 * > Throws the `Response` for non-2xx status codes (eg, Authorization issues).
 *
 * @param config The Hrana configuration.
 * @param type The transaction mode.
 * @param stmts The statements to execute.
 */
export async function transaction(
	config: Config,
	type: TransactionMode,
	...stmts: Hrana.Stmt[]
): Promise<Hrana.BatchResult> {
	let i = 0, len = stmts.length;
	let steps: Hrana.BatchStep[] = [{
		stmt: {
			sql: `BEGIN ${type}`,
		},
	}];

	for (; i < len; i++) {
		steps.push({
			stmt: stmts[i],
			condition: {
				type: 'and',
				conds: [
					{ type: 'ok', step: i }, // points to previous item
					{ type: 'not', cond: { type: 'is_autocommit' } },
				],
			},
		});
	}

	len = steps.length;
	steps.push({
		stmt: {
			sql: 'COMMIT',
		},
	});

	steps.push({
		stmt: {
			sql: 'ROLLBACK',
		},
		condition: {
			type: 'not',
			cond: {
				type: 'ok',
				step: len, // points to COMMIT
			},
		},
	});

	// NOTE: may throw
	let r = await batch(config, steps);

	// remove BEGIN, COMMIT, ROLLBACK steps
	r.step_results = r.step_results.slice(1, len);
	r.step_errors = r.step_errors.slice(1, len);

	return r;
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
export type IntegerMode = 'number' | 'bigint' | 'string';

/**
 * The parsed Row type.
 */
export type Row = {
	[column: string]: unknown;
};

/**
 * A custom transformer function for a column.
 */
export type Transformer<T> = (value: Hrana.Value.Decoded) => T;

/**
 * A map of column names to transformer functions.
 */
export type Transformers<T extends Row> = {
	[K in keyof T]?: Transformer<T[K]>;
};

/**
 * Parse all Rows from the statement results.
 *
 * @param result The statement results.
 * @param options The parsing options.
 */
export function parse<T extends Row = Row>(
	result: Hrana.StmtResult,
	options?: IntegerMode | Transformers<T>,
): T[] {
	let { cols, rows } = result;
	let i = 0, len = rows.length;
	let k = 0, klen = cols.length;
	let row: Row, tmp: Hrana.Value[];
	let c: Hrana.Col, v: Hrana.Value;

	let output = Array<Row>(len);

	let mode: IntegerMode | undefined;
	let tx: Transformers<T> = {};

	if (typeof options === 'string') {
		mode = options;
	} else if (options) {
		tx = options;
	}

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

				row[c.name] = decode(v, mode);
				if (tx[c.name]) {
					row[c.name] = tx[c.name]!(row[c.name] as Hrana.Value.Decoded);
				}
			}
		}

		output[i] = row;
	}

	return output as T[];
}

/**
 * Decode a value.
 *
 * @param raw The value to parse.
 * @param mode The integer {@link IntegerMode}; default="number"
 */
export function decode(raw: Hrana.Value.Null): null;
export function decode(raw: Hrana.Value.Text): string;
export function decode(raw: Hrana.Value.Blob): Uint8Array;
export function decode(raw: Hrana.Value.Float): number;
export function decode(raw: Hrana.Value.Integer): number;
export function decode(raw: Hrana.Value.Integer, mode: 'number'): number;
export function decode(raw: Hrana.Value.Integer, mode: 'string'): string;
export function decode(raw: Hrana.Value.Integer, mode: 'bigint'): bigint;
export function decode(raw: Hrana.Value, mode?: IntegerMode): Hrana.Value.Decoded;
export function decode(raw: Hrana.Value, mode?: IntegerMode): Hrana.Value.Decoded {
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
	}

	// type-only assertion
	raw satisfies Hrana.Value.Blob;

	let bin = atob(raw.base64);
	let i = 0, size = bin.length;
	let bytes = new Uint8Array(size);
	for (; i < size; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

/**
 * Encode a JS value into its Hrana representation.
 *
 * @param v The value to encode.
 */
export function encode(
	v: Hrana.Value.Decoded | ArrayBuffer | Uint8Array | boolean | undefined,
): Hrana.Value {
	if (v == null) {
		return {
			type: 'null',
		};
	}

	switch (typeof v) {
		case 'string':
			return {
				type: 'text',
				value: v,
			};

		case 'number':
			return {
				type: 'float',
				value: v,
			};

		case 'bigint':
			return {
				type: 'integer',
				value: '' + v,
			};

		case 'boolean':
			return {
				type: 'integer',
				value: v ? '1' : '0',
			};
	}

	// type-only assertion
	v satisfies Uint8Array | ArrayBuffer;

	return {
		type: 'blob',
		base64: btoa(
			// @ts-expect-error; Uint8Array is ArrayLike<number>
			String.fromCharCode.apply(null, new Uint8Array(v)),
		),
	};
}
