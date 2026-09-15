import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalJsonDriver } from "../src/lib/storage/local";

const dir = mkdtempSync(path.join(tmpdir(), "tracker-test-"));
let seq = 0;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Fresh file per test so mutations in one test can never leak into another. */
function freshDriver(): LocalJsonDriver {
  return new LocalJsonDriver(path.join(dir, `db-${seq++}.json`));
}

describe("LocalJsonDriver", () => {
  it("seeds default lookups on init", async () => {
    const driver = freshDriver();
    await driver.init();
    const priorities = await driver.readTable("Priorities");
    expect(priorities.length).toBe(4);
    const statuses = await driver.readTable("Statuses");
    expect(statuses.some((s) => s.name === "Completed")).toBe(true);
  });

  it("inserts and reads rows", async () => {
    const driver = freshDriver();
    await driver.init();
    await driver.insertRow("Tasks", { id: "t1", title: "Write report" });
    const tasks = await driver.readTable("Tasks");
    expect(tasks).toEqual([{ id: "t1", title: "Write report" }]);
  });

  it("updates a row by id without disturbing others", async () => {
    const driver = freshDriver();
    await driver.init();
    await driver.insertRows("Tasks", [
      { id: "t1", title: "A", status: "Yet to Start" },
      { id: "t2", title: "B", status: "Yet to Start" },
    ]);
    const updated = await driver.updateRow("Tasks", "t1", { status: "In Progress" });
    expect(updated?.status).toBe("In Progress");
    const tasks = await driver.readTable("Tasks");
    expect(tasks.find((t) => t.id === "t1")?.status).toBe("In Progress");
    expect(tasks.find((t) => t.id === "t2")?.status).toBe("Yet to Start");
  });

  it("returns null when updating a missing id", async () => {
    const driver = freshDriver();
    await driver.init();
    expect(await driver.updateRow("Tasks", "missing", { status: "x" })).toBeNull();
  });

  it("deletes a row by id", async () => {
    const driver = freshDriver();
    await driver.init();
    await driver.insertRow("Tasks", { id: "t1", title: "A" });
    expect(await driver.deleteRow("Tasks", "t1")).toBe(true);
    expect(await driver.readTable("Tasks")).toEqual([]);
    expect(await driver.deleteRow("Tasks", "t1")).toBe(false);
  });

  it("serializes concurrent mutations without losing writes", async () => {
    const driver = freshDriver();
    await driver.init();
    // Fire 20 concurrent inserts; the internal queue must apply every one.
    await Promise.all(Array.from({ length: 20 }, (_, i) => driver.insertRow("Tasks", { id: `t${i}`, title: `Task ${i}` })));
    const tasks = await driver.readTable("Tasks");
    expect(tasks.length).toBe(20);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(20);
  });

  it("persists across driver instances (same file)", async () => {
    const file = path.join(dir, `db-${seq++}.json`);
    const driver = new LocalJsonDriver(file);
    await driver.init();
    await driver.insertRow("Tasks", { id: "t1", title: "Persisted" });
    const second = new LocalJsonDriver(file);
    const tasks = await second.readTable("Tasks");
    expect(tasks.find((t) => t.id === "t1")?.title).toBe("Persisted");
  });
});
