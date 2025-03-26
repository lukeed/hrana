# hrana [![CI](https://github.com/lukeed/hrana/workflows/CI/badge.svg)](https://github.com/lukeed/hrana/actions?query=workflow%3ACI) [![licenses](https://licenses.dev/b/npm/hrana)](https://licenses.dev/npm/hrana)

> A tiny (1034b) runtime-agnostic Hrana HTTP client

## Install

This package is compatible with all JavaScript runtimes and is available on multiple registries:

- **npm** &mdash; available as [`hrana`](https://www.npmjs.com/package/hrana)
- **JSR** &mdash; available as [`@lukeed/hrana`](https://jsr.io/@lukeed/hrana)

## Usage

```ts
import * as hrana from 'hrana';

let credentials: hrana.Config = {
  url: 'https://<database>.turso.io',
  token: 'eyJ...',
};

let rows = await hrana.execute(credentials, {
  sql: 'select * from users where orgid=? limit 2',
  args: [
    hrana.encode('acme'),
  ],
});
//-> {
//->   cols: [
//->     { name: "id", decltype: "INTEGER" },
//->     { name: "name", decltype: "TEXT" },
//->     // ...
//->   ],
//->   rows: [
//->     [
//->       { type: "integer", value: "1" },
//->       { type: "text", value: "lukeed" }
//->       // ...
//->     ],
//->     [
//->       { type: "integer", value: "12" },
//->       { type: "text", value: "foobar" }
//->       // ...
//->     ],
//->   ],
//->   affected_row_count: 0,
//->   last_insert_rowid: null,
//->   replication_index: "...",
//->   rows_read: 2,
//->   rows_written: 0,
//->   query_duration_ms: 0.09,
//-> }

type User = {
  id: number;
  name: string;
  // ...
};

let users = hrana.parse<User>(rows);
//-> [
//->   { id: 1, name: 'lukeed' },
//->   { id: 12, name: 'foobar' },
//-> ]
```

### Transformers

When converting a `Hrana.StmtResult` into your custom `T` type, you may provide `parse()` with column-specific transformers.

For example, to parse an `apps.configs` (TEXT) column into JSON, you can do this:

```ts
type App = {
  id: number;
  name: string;
  config: {
    plan: string;
    seats: number;
  };
};

let apps = hrana.parse<App>(rows, {
  config: (v) => JSON.parse(v as string),
});
//-> [
//->   {
//->     id: 123,
//->     name: 'Example',
//->     config: {
//->       plan: 'Free',
//->       seats: 1,
//->     }
//->   }
//-> ]
```

### Batch Statements

You can execute multiple statements in one roundtrip. These may also be executed conditionally based
on the success or failure of previous statements.

> See the [Hrana 3 Spec](https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md#batches) for more information.

```ts
let r = await hrana.batch(credentials, [{
  stmt: {
    sql: `select 1`,
  },
}, {
  stmt: {
    sql: `select * from users limit 1`,
  },
  condition: {
    type: 'and',
    conds: [{
      type: 'ok',
      step: 0, // only run if Step#0 is ok
    }],
  },
}]);
```

### Transactions

A transaction is like a [batch statement](#batch-statements) except that the group of statements fails/succeeds collectively.

The `transaction()` helper manages the `condition` value for each step, and wraps the group with the proper `BEGIN`, `COMMIT`, and `ROLLBACK` statements.

```ts
let tx = await hrana.transaction(credentials, 'deferred', {
  sql: 'select * from apps limit 1',
}, {
  sql: 'select * from apps limit 1 offset 2',
});

console.log(
  tx.step_results.forEach((r) =>
    r && m.parse<App>(r, {
      config: (v) => JSON.parse(v as string),
    })
  ),
);
```

## API

Please refer to the [generated API documentation](https://jsr.io/@lukeed/hrana/doc), as it's always
kept up-to-date.

> **Note:** The API is the same across all JavaScript runtimes, regardless of [registry](#install) — only the package name changes.

## License

MIT © [Luke Edwards](https://lukeed.com)
