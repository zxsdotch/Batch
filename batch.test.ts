import { D1DatabaseAPI, D1Database as MiniflareD1Database } from "@miniflare/d1";
import { createSQLiteDB } from "@miniflare/shared";
import { expect, test } from "vitest";
import { Batch } from "./batch";

/**
 * The database contains two tables: Users and Messages.
 */
interface UsersRow {
  id: number;
  name: string;
  email: string;
}

interface MessagesRow {
  id: number;
  sender: number;
  receiver: number;
  content: string;
}

const setupDatabase = async (): Promise<D1Database> => {
  const sqliteDb = await createSQLiteDB(":memory:");
  const d1 = new MiniflareD1Database(new D1DatabaseAPI(sqliteDb));
  d1.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)`);
  d1.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender INTEGER NOT NULL, receiver INTEGER NOT NULL, content TEXT NOT NULL, FOREIGN KEY(sender) REFERENCES users(id), FOREIGN KEY(receiver) REFERENCES users(id))`);
  return d1 as unknown as D1Database;
}

test("using built-in batch", async () => {
  const d1 = await setupDatabase();

  const user1 = await builtInBatch(d1, null, "Max", "max@example.com", null);
  await builtInBatch(d1, user1, "Lucy", "lucy@example.com", "Hi Lucy!");

  const users = (await d1.prepare("SELECT * FROM users").all<UsersRow>()).results;
  const messages = (await d1.prepare("SELECT * FROM messages").all<MessagesRow>()).results;

  expect(users.length).toBe(2);
  expect(users[0].name).toBe("Max");
  expect(users[0].email).toBe("max@example.com");
  expect(users[1].name).toBe("Lucy");
  expect(users[1].email).toBe("lucy@example.com");

  expect(messages.length).toBe(1);
  expect(messages[0].sender).toBe(users[0].id);
  expect(messages[0].receiver).toBe(users[1].id);
  expect(messages[0].content).toBe("Hi Lucy!");
})

const builtInBatch = async (d1: D1Database, from: UsersRow | null, name: string, email: string, message: string | null): Promise<UsersRow> => {
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
  return newUser;
}

test("using Batch", async () => {
  const d1 = await setupDatabase();

  const user1 = await newBatch(d1, null, "Max", "max@example.com", null);
  await newBatch(d1, user1, "Lucy", "lucy@example.com", "Hi Lucy!");

  const users = (await d1.prepare("SELECT * FROM users").all<UsersRow>()).results;
  const messages = (await d1.prepare("SELECT * FROM messages").all<MessagesRow>()).results;

  expect(users.length).toBe(2);
  expect(users[0].name).toBe("Max");
  expect(users[0].email).toBe("max@example.com");
  expect(users[1].name).toBe("Lucy");
  expect(users[1].email).toBe("lucy@example.com");

  expect(messages.length).toBe(1);
  expect(messages[0].sender).toBe(users[0].id);
  expect(messages[0].receiver).toBe(users[1].id);
  expect(messages[0].content).toBe("Hi Lucy!");
})

const newBatch = async (d1: D1Database, from: UsersRow | null, name: string, email: string, message: string | null): Promise<UsersRow> => {
  const b = new Batch(d1);
  b.enqueue("_insertUser", d1.prepare("INSERT INTO users (name, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING").bind(name, email));
  b.enqueue("newUser", d1.prepare("SELECT * FROM users WHERE email=?").bind(email));
  if (message) {
    b.enqueue("_insertMessage", d1.prepare("INSERT INTO messages (sender, receiver, content) VALUES (?, LAST_INSERT_ROWID(), ?)").bind(from!.id, message));
  }
  await b.query();
  return b.first<UsersRow>("newUser")!;
}
