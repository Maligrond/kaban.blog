import test from "node:test";
import assert from "node:assert/strict";
import { blogArchive } from "../src/lib/blog-archive.js";

const post = (id, date, draft = false) => ({ id, data: { date: new Date(date), draft } });

test("archive includes only published periods, newest first", () => {
  const archive = blogArchive([
    post("old", "2024-03-11"), post("march", "2025-03-11"),
    post("hidden", "2026-06-01", true), post("april", "2025-04-10"),
  ]);
  assert.deepEqual(archive.map(group => group.year), ["2025", "2024"]);
  assert.deepEqual(archive[0].months.map(group => [group.month, group.label]), [["04", "Апрель"], ["03", "Март"]]);
  assert.deepEqual(archive[0].posts.map(post => post.id), ["april", "march"]);
  assert.deepEqual(blogArchive([post("draft", "2026-01-01", true)]), []);
});

test("archive uses the displayed UTC calendar at year boundaries", () => {
  const archive = blogArchive([post("boundary", "2025-01-01T00:30:00+02:00")]);
  assert.equal(archive[0].year, "2024");
  assert.equal(archive[0].months[0].month, "12");
});
