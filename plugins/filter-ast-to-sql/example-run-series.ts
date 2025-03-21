const db: any = {};
async function runSeries({ series: arr, state, result }: { series: any[]; state: any; result: any; }) {
  let sql: string | undefined = undefined, params: any;
  for (const item of arr) {
    if (Array.isArray(item)) {
      // state becomes an array of states
      // also, series inside the parallel would work fine
      state = await Promise.all(item.map(e => runSeries({ series: Array.isArray(e) ? e : [e], state, result })));
      continue;
    }
    let series: any[] | undefined = undefined;
    // run the transform function with the previous state and result
    // this is never awaited as it should always return sync'ly
    ({ state, sql, params, series } = item({ state, result }));
    // run the sql query
    if (sql) result = await db.all(sql, params);
    else result = undefined;
    // if the item returns a series, start the series with the item's returned state and result
    // the last item in the series will return the new state
    if (series) state = await runSeries({ series, state, result })
    // clear it for the next request
    sql = undefined;
    params = undefined;
  }
  // this never returns result as the last function in any series should return the final result, not a sql query.
  return state;
}

function runSeriesSync({ series: arr, state, result }: { series: any[]; state: any; result: any; }) {
  let sql: string | undefined = undefined, params: any;
  for (const item of arr) {
    if (Array.isArray(item)) {
      // state becomes an array of states
      // also, series inside the parallel would work fine
      state = item.map(e => runSeriesSync({ series: Array.isArray(e) ? e : [e], state, result }));
      continue;
    }
    let series: any[] | undefined = undefined;
    // run the transform function with the previous state and result
    // this is never awaited as it should always return sync'ly
    ({ state, sql, params, series } = item({ state, result }));
    // run the sql query
    if (sql) result = db.all(sql, params);
    else result = undefined;
    // if the item returns a series, start the series with the item's returned state and result
    // the last item in the series will return the new state
    if (series) state = runSeriesSync({ series, state, result });
    // clear it for the next request
    sql = undefined;
    params = undefined;
  }
  // this never returns result as the last function in any series should return the final result, not a sql query.
  return state;
}

function runGenSync(
  gen: FilterGenerator<FilterResult>
) {
  function dball(sql: string, params: any) {
    console.log("sync", sql, params);
    return `sync result for ${sql}`;
  }
  let res = gen.next();
  while (!res.done) {
    res = gen.next(res.value.map(e => ({
      result: dball(e.sql, e.params)
    })));
  }
  return res.value;
}

async function runGenAsync(
  gen: FilterGenerator<FilterResult>
) {
  async function dball(sql: string, params: any) {
    console.log("async", sql, params);
    return `async result for ${sql}`;
  }
  let res = gen.next();
  while (!res.done) {
    res = gen.next(await Promise.all(res.value.map(async e => ({
      result: await dball(e.sql, e.params)
    }))));
  }
  return res.value;
}

// these are the main type definitions for the generator function
type YieldInput = { sql: string; params: any };
type YieldOutput<Input extends YieldInput> = Input extends { sql: infer S } ? { result: S } : never;
// this is the generator type
type FilterGenerator<T> = Generator<YieldInput[], T, YieldOutput<YieldInput>[]>;
// the root generator function must return the filter result
type FilterResult = { titles: string[] };

type MapInputToOutput<T extends YieldInput[]> = T extends [
  infer First extends YieldInput,
  ...infer Rest extends YieldInput[]
] ? [YieldOutput<First>, ...MapInputToOutput<Rest>] : [];

/** This just types the yield input and output */
function* yielder<const I extends YieldInput[]>(...input: I)
  : Generator<any, MapInputToOutput<I>, any> { return yield input; }

// this section is an example usage of the above functions

function* compiledFilter(): FilterGenerator<{ titles: string[] }> {
  // yield* is essentially a spread operator for generators 
  // yielder yeilds one value then returns the result.
  // this just gives us a way to type the output of a yield according to the input
  // so if we give it a typed sql query input, it can return a typed result

  const [result1] = yield* yielder({
    sql: 'SELECT * FROM table1', params: []
  });

  const { list, test } = yield* innerFilter(); // this is a nested FilterGenerator

  console.log(result1, list); // should print { result: string }

  const [result2, result3] = yield* yielder({
    sql: 'SELECT * FROM table2', params: []
  }, {
    sql: 'SELECT * FROM table3', params: []
  });

  console.log(result2, result3); // should print { result: string } { result: string }

  return { titles: [] };

}

function* innerFilter(): FilterGenerator<{ list: string[], test: any }> {

  const [result1] = yield* yielder({
    sql: 'SELECT * FROM inner1', params: []
  });
  // do something with result1
  return { list: ["hello", "world"], test: result1 };
}

runGenSync(compiledFilter());
runGenAsync(compiledFilter());

// tsx ./plugins/filter-ast-to-sql/example-run-series.ts
