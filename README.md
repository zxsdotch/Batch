# d1-batch

Improve the way you batch operations with [Cloudflare D1](https://developers.cloudflare.com/d1/).

The `Batch` class provides a way to assign keys to a batch of queries,
run the queries, and subsequently fetch the results by referring to the
keys. Queries are run in the same order as they are added to the `Batch`
class.

For example, the following piece of code is a simplified invitiation flow. A user row
is created if needed and a message is recorded when provided. Using Cloudflare D1's
built-in `batch()` function:

```javascript
var _insertUserResult, newUserResult, _insertMessageResult;
if (message) {
  [_insertUserResult, newUserResult, _insertMessageResult] = await d1.batch([
    d1.prepare("INSERT INTO users (name, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(name, email),
    d1.prepare("SELECT * FROM users WHERE email=?").bind(email),
    d1.prepare("INSERT INTO messages (sender, receiver, content) VALUES (?, LAST_INSERT_ROWID(), ?)").bind(from!.id, message),
  ]);
} else {
  [_insertUserResult, newUserResult, _insertMessageResult] = await d1.batch([
    d1.prepare("INSERT INTO users (name, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(name, email),
    d1.prepare("SELECT * FROM users WHERE email=?").bind(email),
  ]);
}
const newUser = (newUserResult as D1Result<UsersRow>).results[0];
```

The code is however cleaner if you use the `Batch` class. The code is more readable,
and easier to change over time:

```javascript
import { Batch } from "d1-batch";

const b = new Batch(d1);
b.enqueue("_insertUser", d1.prepare("INSERT INTO users (name, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(name, email));
b.enqueue("newUser", d1.prepare("SELECT * FROM users WHERE email=?").bind(email));
if (message) {
  b.enqueue("_insertMessage", d1.prepare("INSERT INTO messages (sender, receiver, content) VALUES (?, LAST_INSERT_ROWID(), ?)").bind(from!.id, message));
}
await b.query();
const newUser = b.first<UsersRow>("newUser")!;
```

## Installation

```bash
npm install d1-batch
```

## Some additional context

In general, it is preferrable to use a lightweight query builder or ORM to perform
CRUD operations: it's quicker to implement and less brittle. However, while working on
a latency sensitive Cloudflare Workers based project, we needed to carefuly control
the batching of queries. Our endpoints where making anywhere from a coulpe to a dozen
queries to D1, but with never more than 3 round-trips -- resulting in backend
endpoints that would run in about 300ms. We initially used the default `batch()`
function, but eventually implemented the `Batch` class for better ergonomics.

The concept of a `Batch` class makes it easier to hook up automatic error handling,
query logging, or performance monitoring when needed.
