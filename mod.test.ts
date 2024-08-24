import { assertEquals } from 'jsr:@std/assert@^1';
import { encodeBase64 } from 'jsr:@std/encoding@^1/base64';
import { encodeBase64Url } from 'jsr:@std/encoding@^1/base64url';

import * as mod from './mod.ts';
import type { StmtResult, Value } from './hrana.ts';

Deno.test('value', async (t) => {
	function run(expect: unknown, input: Value, mode?: mod.Mode) {
		let output = mod.value(input, mode);
		assertEquals(output, expect);
	}

	await t.step('null', () => {
		run(null, {
			type: 'null',
		});
	});

	await t.step('text', () => {
		run('', {
			type: 'text',
			value: '',
		});

		run('foobar', {
			type: 'text',
			value: 'foobar',
		});
	});

	await t.step('blob', () => {
		let input = 'hello 123';
		let expect = new TextEncoder().encode(input);

		run(expect, {
			type: 'blob',
			base64: btoa(input),
		});

		run(expect, {
			type: 'blob',
			base64: encodeBase64(input),
		});

		run(expect, {
			type: 'blob',
			base64: encodeBase64Url(input),
		});
	});

	await t.step('float', () => {
		run(1.23, {
			type: 'float',
			value: 1.23,
		});

		run(1.0, {
			type: 'float',
			value: 1.0,
		});
	});

	await t.step('integer', () => {
		run(123, {
			type: 'integer',
			value: '123',
		});

		run(123, {
			type: 'integer',
			value: '123',
		}, 'number');

		run('123', {
			type: 'integer',
			value: '123',
		}, 'string');

		run(123n, {
			type: 'integer',
			value: '123',
		}, 'bigint');
	});
});

Deno.test('parse', async (t) => {
	// select 1
	let result: StmtResult = {
		cols: [{ name: '1', decltype: null }],
		rows: [[{ type: 'integer', value: '1' }]],
		affected_row_count: 0,
		last_insert_rowid: null,
		rows_read: 0,
		rows_written: 0,
		query_duration_ms: 0.039,
	};

	await t.step('simple', () => {
		let output = mod.parse(result);
		assertEquals(output, [{ 1: 1 }]);
	});

	await t.step('simple w/ mode', () => {
		let output = mod.parse(result, 'bigint');
		assertEquals(output, [{ 1: 1n }]);
	});

	await t.step('multiple columns', () => {
		result.cols = [{
			name: 'name',
			decltype: null,
		}, {
			name: 'age',
			decltype: null,
		}];

		result.rows = [
			[{ type: 'text', value: 'lukeed' }, { type: 'float', value: 34.5 }],
			[{ type: 'text', value: 'foobar' }, { type: 'text', value: 'unknown' }],
			[{ type: 'text', value: 'anon' }, { type: 'null' }],
		];

		let output = mod.parse(result);
		assertEquals(output, [{
			name: 'lukeed',
			age: 34.5,
		}, {
			name: 'foobar',
			age: 'unknown',
		}, {
			name: 'anon',
			age: null,
		}]);
	});
});
