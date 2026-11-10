import { memoryDb } from "./nodeDb";

describe("memoryDb", () => {
  it("round-trips rows", () => {
    const db = memoryDb();
    db.exec("CREATE TABLE t (a TEXT, b INTEGER)");
    const r = db.run("INSERT INTO t VALUES (?, ?)", ["x", 1]);
    expect(r.lastInsertRowId).toBe(1);
    expect(r.changes).toBe(1);
    expect(db.all("SELECT * FROM t")).toEqual([{ a: "x", b: 1 }]);
    expect(db.get("SELECT * FROM t WHERE a = ?", ["y"])).toBeNull();
    db.close();
  });
});
