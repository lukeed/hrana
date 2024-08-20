type uint32 = number;
type uint64 = number;
type double = number;

export type Value =
	| { type: 'null' }
	| { type: 'integer'; value: string }
	| { type: 'float'; value: number }
	| { type: 'text'; value: string }
	| { type: 'blob'; base64: string };

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
	rows: Array<Array<Value>>;
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
