/**
 * Improves the way Cloudflare D1 operations are batched.
 */
export class Batch<K extends PropertyKey> {
  private d1: D1Database;
  private queryMap: Map<K, D1PreparedStatement>;
  private resultsMap: Map<K, D1Result>;
  private done: boolean;

  constructor(d1: D1Database) {
    this.d1 = d1;
    this.queryMap = new Map();
    this.resultsMap = new Map();
    this.done = false;
  }

  /**
   * Resets the state of the class.
   */
  reset(): void {
    this.queryMap = new Map();
    this.resultsMap = new Map();
    this.done = false;
  }

  /**
   * Saves a D1PreparedStatement to be sent to the database when `query()` is called. To keep
   * things simple, statements can only be enqueued prior to calling `query()`. `key` will be used
   * to retrieve the result.
   */
  enqueue(key: K, statement: D1PreparedStatement): void {
    if (this.done) {
      throw new Error("enqueue() called after query()");
    }
    if (this.queryMap.has(key)) {
      throw new Error("enqueue() called with duplicate key");
    }
    this.queryMap.set(key, statement);
  }

  /**
   * Saves a statement which returns `LAST_INSERT_ROWID()`.
   */
  selectLastInsertRowId(key: K): void {
    this.enqueue(key, this.d1.prepare("SELECT LAST_INSERT_ROWID() AS id"));
  }

  /**
   * Sends the saved statements to the database and saves the results.
   */
  async query(): Promise<void> {
    if (this.done) {
      throw new Error("query() called more than once");
    }
    const s: D1PreparedStatement[] = [];
    for (const [_, v] of this.queryMap) {
      s.push(v);
    }

    this.done = true;
    if (s.length == 0) {
      return;
    }

    const results = await this.d1.batch(s);
    for (const [k, _] of this.queryMap) {
      this.resultsMap.set(k, results.shift() as D1Result);
    }
  }

  /**
   * Returns the result for a given `key`.
   */
  getResults<T>(key: K): T[] {
    if (!this.done) {
      throw new Error("getResults() called before query()")
    }

    const result = this.resultsMap.get(key);
    if (result === undefined) {
      return [];
    }
    return (result as D1Result<T>).results;
  }

  /**
   * Returns the result for a given `key` converting the data into a key-value record. An empty
   * {} record is returned if the database statement did not return a any results.
   */
  getAsRecord<T>(key: K, mapper: (row: T) => PropertyKey): Record<PropertyKey, T> {
    if (!this.done) {
      throw new Error("map() called before query()")
    }

    const r = {} as any;
    const result = this.resultsMap.get(key);
    if (result === undefined) {
      return r;
    }
    const results = result.results as T[];
    for (let i = 0; i < results.length; i++) {
      const k = mapper(results[i]);
      r[k] = results[i];
    }
    return r;
  }

  /**
   * Returns the first result for a given `key` or undefined if the
   * database statement did not return any results.
   */
  first<T>(key: K): T | undefined {
    if (!this.done) {
      throw new Error("one() called before query()")
    }

    const result = this.resultsMap.get(key);
    if (result === undefined) {
      return undefined;
    }
    return (result as D1Result<T>).results[0];
  }
}
