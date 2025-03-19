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