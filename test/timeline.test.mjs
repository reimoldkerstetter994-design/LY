import assert from "node:assert/strict";
import test from "node:test";
import { textEnvelope } from "../js/render.js";
import { beatAt, beats, chapters, DURATION, formatTime, MOTIFS } from "../js/timeline.js";

test("the film is exactly 30 minutes", () => {
  assert.equal(DURATION, 1800);
  assert.equal(beats[0].start, 0);
  const ending = beats.at(-1);
  assert.equal(ending.start + ending.dur, 1800);
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(1800), "30:00");
  assert.equal(formatTime(754), "12:34");
});

test("beats cover the timeline without gaps or overlaps", () => {
  for (let i = 1; i < beats.length; i += 1) {
    assert.equal(beats[i].start, beats[i - 1].start + beats[i - 1].dur);
  }
  for (let t = 0; t < DURATION; t += 0.5) {
    const beat = beatAt(t);
    assert.ok(beat, `missing beat at ${t}`);
    assert.ok(t >= beat.start && t < beat.start + beat.dur);
  }
  assert.equal(beatAt(DURATION), beats.at(-1));
});

test("six chapters open on their marks", () => {
  assert.deepEqual(
    chapters.map((chapter) => [chapter.id, chapter.start]),
    [
      ["序", 0],
      ["静", 240],
      ["材", 600],
      ["时", 960],
      ["城", 1260],
      ["名", 1560],
    ],
  );
});

test("titles fade in and the last line fades out", () => {
  assert.equal(textEnvelope(0, "title"), 0);
  assert.equal(textEnvelope(0.5, "verse"), 1);
  assert.equal(textEnvelope(1, "end"), 0);
  assert.equal(textEnvelope(0.2, "void"), 0);
});

test("every spoken line is unique and every motif exists", () => {
  const lines = beats.map((beat) => beat.line).filter(Boolean);
  assert.equal(new Set(lines).size, lines.length);
  assert.ok(lines.length >= 24);
  for (const beat of beats) {
    if (beat.kind === "verse" || beat.kind === "study" || beat.kind === "end") {
      assert.ok(beat.line);
    }
    if (beat.motif) assert.ok(MOTIFS.includes(beat.motif));
    assert.ok(beat.palette);
  }
});
