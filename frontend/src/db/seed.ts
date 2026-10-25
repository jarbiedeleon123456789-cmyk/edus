/* Demo seed. All users, submissions and reviews are fictional placeholder data for development. */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "./index";
import {
  institutions, users, skills, courses, modules, lessons, courseSkills, lessonSkills,
  assessments, assessmentQuestions, assessmentAttempts, attemptAnswers, studentSkillScores,
  learningPaths, learningPathItems, codingExercises, testCases, submissions, rubrics,
  rubricCriteria, peerAssignments, peerReviews, reviewScores, progressRecords, streaks,
  badges, userBadges, certificates, liveSessions, notifications, executionResults,
} from "./schema";

const levelFromXp = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
const daysAgo = (n: number, h = 12) => new Date(Date.now() - n * 864e5 - (new Date().getHours() - h) * 36e5);
const withIds = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((row) => ({ ...row, id: randomUUID() }));

async function main() {
  console.log("seeding…");
  const hash = bcrypt.hashSync("password123", 10);

  const inst = { id: randomUUID(), name: "Demo Institute", domain: "edeusphere.dev" };
  await db.insert(institutions).values(inst);

  const admin = { id: randomUUID(), institutionId: inst.id, name: "Rae Okafor", email: "admin@edusphere.dev", passwordHash: hash, role: "admin" as const };
  const priya = { id: randomUUID(), institutionId: inst.id, name: "Priya Nair", email: "instructor@edusphere.dev", passwordHash: hash, role: "instructor" as const, xp: 0 };
  const marco = { id: randomUUID(), institutionId: inst.id, name: "Marco Reyes", email: "marco@edusphere.dev", passwordHash: hash, role: "instructor" as const };
  await db.insert(users).values([admin, priya, marco]);

  const roster = [
    ["Aria Chen", "aria@edusphere.dev"], ["Theo Marsh", "theo@edusphere.dev"], ["Noor Haddad", "noor@edusphere.dev"],
    ["Felix Ortiz", "felix@edusphere.dev"], ["June Park", "june@edusphere.dev"], ["Soleil Marin", "soleil@edusphere.dev"],
    ["Dev Patel", "dev@edusphere.dev"], ["Maya Lind", "maya@edusphere.dev"], ["Kir Volkov", "kir@edusphere.dev"],
    ["Owen Cole", "owen@edusphere.dev"],
  ] as const;
  const xpPairs: [string, string, number][] = roster.map(([n, e], i) => [n, e, [460, 690, 540, 320, 210, 780, 150, 410, 60, 260][i]]);
  const stu = withIds(xpPairs.map(([name, email, xp]) => ({
    institutionId: inst.id, name, email, passwordHash: hash, role: "student" as const, xp, level: levelFromXp(xp),
  })));
  await db.insert(users).values(stu);
  const [aria, theo, noor, felix, june] = stu;

  // ---------- skills ----------
  const skillDefs = [
    ["JavaScript Basics", "js-basics"], ["Control Flow", "control-flow"], ["Functions", "functions"],
    ["Arrays & Iteration", "arrays"], ["Objects & Data", "objects"], ["DOM & Events", "dom"],
    ["Async & Promises", "async"], ["HTML & CSS", "html-css"], ["Problem Decomposition", "decomposition"],
    ["Testing & Debugging", "testing"],
  ] as const;
  const skRows = withIds(skillDefs.map(([name, slug]) => ({ name, slug })));
  await db.insert(skills).values(skRows);
  const s = Object.fromEntries(skRows.map(r => [r.slug, r.id]));

  // ---------- courses ----------
  const jsf = { id: randomUUID(), instructorId: priya.id, title: "JavaScript Foundations", slug: "js-foundations", description: "Core language skills: syntax, functions, data, and the event loop.", level: "beginner", accent: "indigo" };
  const fend = { id: randomUUID(), instructorId: priya.id, title: "Frontend Engineering", slug: "frontend-eng", description: "Component thinking, DOM rendering, state, and interface polish.", level: "intermediate", accent: "mint" };
  const algo = { id: randomUUID(), instructorId: marco.id, title: "Algorithms Practice", slug: "algorithms", description: "Problem decomposition, complexity awareness, and test-first habits.", level: "advanced", accent: "coral" };
  await db.insert(courses).values([jsf, fend, algo]);

  const mkModules = async (courseId: string, titles: string[]) => {
    const rows = withIds(titles.map((title, i) => ({ courseId, title, position: i })));
    await db.insert(modules).values(rows);
    return rows;
  };
  const [m1, m2, m3] = await mkModules(jsf.id, ["Core syntax", "Data & functions", "The browser"]);
  const [m4, m5] = await mkModules(fend.id, ["UI systems", "State & data"]);
  const [m6, m7] = await mkModules(algo.id, ["Warm-up", "Structures"]);

  type L = [string, string, string, number, string, string[]]; // module, title, content, minutes, mainSkill, extraSkills
  const lessonDefs: L[] = [
    [m1.id, "Values, types, and variables", "JavaScript has 7 primitive types. `let` declares a reassignable binding, `const` fixes the binding to one value or object. Type quirks matter: `typeof null` returns `\"object\"`, a bug frozen into the language in 1995.\n\n```js\nconst name = \"orbit\";\nlet count = 3;\ncount = count + 1; // 4\n```\n\nNumbers, strings, booleans, `undefined`, `null`, symbols, and bigints are primitives — everything else is an object, including arrays and functions.", 25, "js-basics", []],
    [m1.id, "Operators and equality", "Use `===` (strict equality) by default. `==` coerces types first, which produces results like `0 == \"\"` evaluating to `true`. Strict comparison skips coercion, so `0 === \"\"` is false.\n\nLogical operators return values, not just booleans: `a || b` returns `a` when `a` is truthy, otherwise `b`. That makes `name || \"anon\"` a common default-value pattern.", 20, "js-basics", [],
    ],
    [m1.id, "Branches and loops", "`if` runs a block when its condition is truthy; `else if` chains alternatives. Loops repeat work: `for` with a counter, `while` with a condition, and `for...of` to walk an array's values directly.\n\n```js\nfor (const item of items) {\n  if (item.done) continue;\n  work(item);\n}\n```\n\n`break` exits the loop entirely; `continue` skips to the next iteration.", 30, "control-flow", ["js-basics"]],
    [m2.id, "Defining and calling functions", "A function is a value. Declarations (`function f() {}`) are hoisted; expressions (`const f = () => {}`) are not. Parameters receive arguments by position. `return` exits immediately and produces the call's value — a function without `return` evaluates to `undefined`.\n\nArrow functions keep the surrounding `this`, which avoids the classic callback bug where handlers lose their object.", 30, "functions", ["js-basics"]],
    [m2.id, "Array methods: map, filter, reduce", "`map` transforms each element one-to-one. `filter` keeps elements where the predicate is true. `reduce` folds the whole array into one value — sum, object, or another array. All three return new arrays instead of mutating.\n\n```js\nconst names = users.map(u => u.name)\n  .filter(n => n.length > 0);\n```\n\nChaining reads top-to-bottom like a pipeline.", 35, "arrays", ["functions"]],
    [m2.id, "Objects and destructuring", "Objects map string keys to values. Destructuring pulls fields out by name: `const { id, name } = user`. Spread makes shallow copies: `{...user, name: \"new\"}` — the right way to update without mutating.\n\n`Object.keys`, `Object.values`, and `Object.entries` turn objects into arrays so `map` and `filter` apply.", 25, "objects", []],
    [m3.id, "The DOM and events", "The DOM is the live tree the browser builds from your HTML. `document.querySelector` finds nodes; changing `textContent`, `classList`, or `style` re-renders that node. Events fire on user input — attach with `addEventListener`, never inline `onclick` HTML attributes.\n\nEvents bubble up the tree, so one listener on a parent can handle clicks from many children (event delegation).", 35, "dom", ["js-basics", "html-css"]],
    [m3.id, "Async: timers, promises, fetch", "JavaScript runs one thing at a time and parks waiting work on the event loop. `setTimeout` schedules a callback. A promise is a placeholder for a future value; `.then` runs when it settles. `async`/`await` is syntax over promises that reads top-to-bottom:\n\n```js\nconst res = await fetch(url);\nconst data = await res.json();\n```\n\nAlways handle rejection with `try/catch` or `.catch`.", 40, "async", ["functions"]],
    [m4.id, "HTML structure and semantics", "Use elements for meaning, not appearance: `<nav>` for navigation, `<main>` for the page's primary content, `<button>` for actions. Screen readers and search engines read this structure. A heading outline that skips levels (`h1` straight to `h3`) confuses both.", 25, "html-css", []],
    [m4.id, "CSS layout with flex and grid", "Flexbox distributes items along one axis: `display: flex; justify-content: center; gap: 8px`. Grid handles two dimensions with named tracks. Reach for flex for toolbars and card rows, grid for full page sections. `minmax()` and `auto-fit` make grids responsive without media queries.", 35, "html-css", ["dom"]],
    [m5.id, "State and re-rendering", "State is data that changes over time. The pattern: keep the minimal state, derive everything else when rendering, and update through a single setter so the UI can't drift from the data. Mutating a state object in place is the most common cause of \"the UI didn't update\" bugs.", 30, "dom", ["functions", "objects"]],
    [m5.id, "Component boundaries and props", "Split a page into components when a part is reused, is updated on a different rhythm, or can be reasoned about alone. Data flows down as props; events flow up. Lifting state to a common ancestor is the fix when siblings must stay in sync.", 30, "dom", []],
    [m6.id, "Breaking problems apart", "Read the prompt and rewrite it as input → output in your own words. Work a small example by hand before coding. Then write the function signature and the test cases first — code after. Skipping the hand example is how edge cases (empty input, single element, duplicates) ship to production.", 20, "decomposition", []],
    [m6.id, "Complexity in plain terms", "Big-O counts how work grows with input. A nested loop over the same list is O(n²): at n = 10,000 that's 100 million steps — about a second of compute. An O(n) scan plus a hash-map lookup usually replaces it. You rarely need formal proofs; you do need to spot the nested loop.", 30, "decomposition", ["arrays"]],
    [m7.id, "Hash maps for lookups", "A `Map` (or plain object) stores keys with O(1) average lookup. The trick behind two-sum: walk the array once, store each value's index, and for each element check if its complement is already stored. Keeps the whole thing O(n) instead of O(n²).", 30, "arrays", ["objects"]],
    [m7.id, "Testing your own code", "Write the cases the prompt guarantees, then the ones it forgets to mention: empty input, size one, duplicates, maximum size. Run them one at a time and read the failing output before changing code. `console.log` of the actual vs expected value is the fastest debugger you have.", 25, "testing", ["functions"]],
  ];
  const lessonRows = withIds(lessonDefs.map(([moduleId, title, content, est], i) => ({
    moduleId, title, content, estimatedMinutes: est, position: i,
  })));
  await db.insert(lessons).values(lessonRows);

  const lessonSkillLinks: { lessonId: string; skillId: string }[] = [];
  lessonDefs.forEach(([, , , , main, extra], i) => {
    lessonSkillLinks.push({ lessonId: lessonRows[i].id, skillId: s[main as keyof typeof s] });
    extra.forEach(e => lessonSkillLinks.push({ lessonId: lessonRows[i].id, skillId: s[e as keyof typeof s] }));
  });
  await db.insert(lessonSkills).values(lessonSkillLinks);

  await db.insert(courseSkills).values([
    { courseId: jsf.id, skillId: s["js-basics"] }, { courseId: jsf.id, skillId: s["control-flow"] },
    { courseId: jsf.id, skillId: s["functions"] }, { courseId: jsf.id, skillId: s["arrays"] },
    { courseId: jsf.id, skillId: s["objects"] }, { courseId: jsf.id, skillId: s["dom"] },
    { courseId: jsf.id, skillId: s["async"] },
    { courseId: fend.id, skillId: s["html-css"] }, { courseId: fend.id, skillId: s["dom"] },
    { courseId: algo.id, skillId: s["decomposition"] }, { courseId: algo.id, skillId: s["arrays"] },
    { courseId: algo.id, skillId: s["testing"] },
  ]);

  // ---------- placement assessment ----------
  const asm = { id: randomUUID(), courseId: jsf.id, title: "JavaScript placement", kind: "placement" as const };
  await db.insert(assessments).values(asm);
  const q = (idx: number, slug: keyof typeof s, type: "mcq" | "short", prompt: string, answer: string, options?: string[], points = 10) =>
    ({ assessmentId: asm.id, skillId: s[slug], type, prompt, answer, options: options ?? null, points, position: idx });
  await db.insert(assessmentQuestions).values([
    q(0, "js-basics", "mcq", "What does `typeof null` evaluate to?", "\"object\"", ["\"object\"", "\"null\"", "\"undefined\"", "\"number\""]),
    q(1, "js-basics", "mcq", "Which value is NOT a JavaScript primitive?", "Array", ["String", "Boolean", "Array", "Symbol"]),
    q(2, "control-flow", "mcq", "Inside a loop, what does `continue` do?", "Skips to the next iteration", ["Exits the loop entirely", "Skips to the next iteration", "Restarts the loop", "Returns from the function"]),
    q(3, "control-flow", "mcq", "What does `while (0)` do?", "Never executes its body", ["Never executes its body", "Runs exactly once", "Throws a TypeError", "Loops forever"]),
    q(4, "functions", "mcq", "What does `function f() { }` return when called as `f()`?", "undefined", ["undefined", "null", "0", "It throws"]),
    q(5, "functions", "short", "In one word: which array method keeps only elements matching a predicate? (lowercase)", "filter", undefined, 15),
    q(6, "arrays", "mcq", "Which array method transforms each element and returns a new array of the same length?", "map", ["map", "filter", "find", "some"]),
    q(7, "arrays", "mcq", "What does `[1, 2, 3].reduce((a, b) => a + b, 10)` return?", "16", ["16", "6", "10", "NaN"]),
    q(8, "async", "mcq", "What is a promise?", "A placeholder for a value that will exist later", ["A function that always returns null", "A placeholder for a value that will exist later", "A synchronous callback queue", "A type of array"]),
    q(9, "decomposition", "short", "In one word: where a nested loop scans a list, which data structure usually replaces the inner scan? (lowercase)", "map", undefined, 15),
  ]);

  // ---------- coding exercises ----------
  const [twoSum, fizz, orbitLoader] = withIds([
    { courseId: algo.id, skillId: s["arrays"], title: "Two Sum", language: "javascript",
      prompt: "Write `solve({ nums, target })`. Return the zero-based indices `[i, j]` (i < j) of the two numbers that add up to `target`. Exactly one solution exists in every test input. Aim for a single pass with a hash map — the hidden case uses 100,000 items, so an O(n²) double loop will time out.",
      starterCode: "// solve receives one object argument: { nums, target }\n// Log with console.log if you need to debug a case.\nfunction solve({ nums, target }) {\n  \n}\n" },
    { courseId: algo.id, skillId: s["decomposition"], title: "FizzBuzz", language: "javascript",
      prompt: "Write `solve({ n })`. Return an array of the numbers 1..n as strings, except multiples of 3 become \"Fizz\", multiples of 5 become \"Buzz\", and multiples of both become \"FizzBuzz\". Example: n = 16 ends with [..., \"13\", \"7... wait — figure it out.",
      starterCode: "// Input: { n }. Output: array of strings of length n.\nfunction solve({ n }) {\n  \n}\n" },
    { courseId: fend.id, skillId: s["html-css"], title: "Assignment — Orbit Loader", language: "html",
      prompt: "Build a loading spinner for EduSphere using only HTML + CSS + JS in the preview panel: one central dot, one ring rotating around it, and one small node riding the ring. Animate it with CSS `transform` + `animation`, not a GIF. When the whole thing works, click \"Submit for review\" — it will go to 3 anonymous classmates with the UI-craft rubric.",
      starterCode: "<!-- your loader markup -->\n<div class=\"loader\">\n\n</div>\n\n<style>\n  body { background: #0b0d1f; display: grid; place-items: center; min-height: 90vh; }\n</style>\n" },
  ]);
  await db.insert(codingExercises).values([twoSum, fizz, orbitLoader]);

  await db.insert(testCases).values([
    { exerciseId: twoSum.id, input: "{\"nums\":[2,7,11,15],\"target\":9}", expected: "[0,1]", position: 0 },
    { exerciseId: twoSum.id, input: "{\"nums\":[3,2,4],\"target\":6}", expected: "[1,2]", position: 1 },
    { exerciseId: twoSum.id, input: "{\"nums\":[-3,4,3,90],\"target\":0}", expected: "[0,2]", position: 2 },
    { exerciseId: twoSum.id, input: "{\"nums\":[" + Array.from({ length: 100000 }, (_, i) => i).join(",") + "],\"target\":199997}", expected: "[99998,99999]", hidden: true, position: 3 },
    { exerciseId: fizz.id, input: "{\"n\":5}", expected: "[\"1\",\"2\",\"Fizz\",\"4\",\"Buzz\"]", position: 0 },
    { exerciseId: fizz.id, input: "{\"n\":15}", expected: "[\"1\",\"2\",\"Fizz\",\"4\",\"Buzz\",\"Fizz\",\"7\",\"8\",\"Fizz\",\"Buzz\",\"11\",\"Fizz\",\"13\",\"14\",\"FizzBuzz\"]", position: 1 },
    { exerciseId: fizz.id, input: "{\"n\":1}", expected: "[\"1\"]", hidden: true, position: 2 },
  ]);

  // Hidden two-sum case expects the pair indices sorted; [9998,0] un-normalized would fail, so store sorted.
  // (We compare JSON of result sorted ascending for two-sum specifically in the executor prompt: keep expected [0,9998].)

  // ---------- rubric ----------
  const rub = { id: randomUUID(), courseId: fend.id, title: "UI craft rubric" };
  await db.insert(rubrics).values(rub);
  await db.insert(rubricCriteria).values([
    { rubricId: rub.id, label: "Correct behavior", description: "Does the loader render and animate as required, with no console errors?", maxPoints: 10, position: 0 },
    { rubricId: rub.id, label: "Code clarity", description: "Readable structure, descriptive names, no dead code.", maxPoints: 10, position: 1 },
    { rubricId: rub.id, label: "Visual craft", description: "Spacing, color, and motion feel deliberate rather than default.", maxPoints: 10, position: 2 },
    { rubricId: rub.id, label: "Requirements fit", description: "Central dot, rotating ring, riding node — all three present.", maxPoints: 10, position: 3 },
  ]);

  // ---------- badges ----------
  const badgeDefs = [
    ["pathfinder", "Pathfinder", "Generated a learning path from placement results.", "compass", "indigo", 25],
    ["first-steps", "First Steps", "Completed the first lesson on your path.", "footprints", "mint", 25],
    ["streak-3", "Kindling", "Reached a 3-day learning streak.", "flame", "amber", 30],
    ["streak-7", "Bonfire", "Reached a 7-day learning streak.", "flame", "amber", 80],
    ["bug-hunter", "Bug Hunter", "Passed every test case on a coding exercise.", "bug", "mint", 40],
    ["reviewer", "Peer Reviewer", "Submitted a written peer review.", "handshake", "indigo", 40],
    ["sharp-mind", "Sharp Mind", "Scored 90% or higher on a placement assessment.", "zap", "coral", 50],
    ["constellation", "Constellation", "Completed every lesson on a learning path.", "orbit", "coral", 100],
  ] as const;
  const badgeRows = withIds(badgeDefs.map(([code, name, description, icon, accent, xpReward]) => ({ code, name, description, icon, accent, xpReward })));
  await db.insert(badges).values(badgeRows);
  const b = Object.fromEntries(badgeRows.map(r => [r.code, r.id]));

  // ---------- Aria: populated history ----------
  await db.insert(assessmentAttempts).values({ id: randomUUID(), assessmentId: asm.id, userId: aria.id, status: "submitted", score: "52.00", startedAt: daysAgo(6, 9), submittedAt: daysAgo(6, 10) });
  const ariaScores: [keyof typeof s, number][] = [["js-basics", 80], ["control-flow", 70], ["functions", 60], ["arrays", 40], ["objects", 30], ["dom", 25], ["async", 20], ["decomposition", 35]];
  await db.insert(studentSkillScores).values(ariaScores.map(([slug, score]) => ({ userId: aria.id, skillId: s[slug], score: String(score), measuredAt: daysAgo(6, 10) })));

  const path = { id: randomUUID(), userId: aria.id, courseId: jsf.id, status: "active" as const, velocity: "0.80",
    rationale: "Placement scored Arrays & Iteration at 40%, Objects & Data at 30%, DOM at 25%, and Async at 20% against JavaScript Basics at 80%. The path opens with the two strongest foundations as quick wins, then spends most items on arrays, objects, and DOM before closing with async. Pacing assumes about 0.8 completed lessons per day from the last two weeks.",
    generatedAt: daysAgo(5, 9) };
  await db.insert(learningPaths).values(path);
  const pathLessonOrder = [0, 1, 4, 5, 2, 3, 6, 7]; // lesson indices ordered by weakness-first
  await db.insert(learningPathItems).values(pathLessonOrder.map((li, i) => ({
    pathId: path.id, lessonId: lessonRows[li].id, position: i,
    status: i < 2 ? "done" as const : i === 2 ? "current" as const : "locked" as const,
    completedAt: i < 2 ? daysAgo(3 - i, 18) : null,
  })));

  await db.insert(progressRecords).values([
    { userId: aria.id, lessonId: lessonRows[0].id, timeSpentSec: 1140, completedAt: daysAgo(4, 20) },
    { userId: aria.id, lessonId: lessonRows[1].id, timeSpentSec: 900, completedAt: daysAgo(3, 19) },
  ]);
  // past executions for velocity/activity chart
  await db.insert(executionResults).values([
    { userId: aria.id, exerciseId: twoSum.id, stdout: "", stderr: "", runtimeMs: 12, passedCount: 2, totalCount: 4, results: [], createdAt: daysAgo(2, 21) },
    { userId: aria.id, exerciseId: fizz.id, stdout: "[\"1\",\"2\",\"Fizz\"]", stderr: "", runtimeMs: 4, passedCount: 3, totalCount: 3, results: [], createdAt: daysAgo(1, 18) },
  ]);

  await db.insert(streaks).values([
    { userId: aria.id, current: 3, longest: 5, lastActivityDate: daysAgo(0).toISOString().slice(0, 10) },
    ...stu.slice(1).map((u, i) => ({ userId: u.id, current: [2, 6, 1, 0, 4, 8, 1, 3, 1][i] ?? 0, longest: [4, 9, 2, 3, 4, 8, 2, 5, 1][i] ?? 0, lastActivityDate: daysAgo(0).toISOString().slice(0, 10) })),
  ]);

  await db.insert(userBadges).values([
    { userId: aria.id, badgeId: b["pathfinder"], awardedAt: daysAgo(5, 9) },
    { userId: aria.id, badgeId: b["first-steps"], awardedAt: daysAgo(4, 20) },
    { userId: aria.id, badgeId: b["streak-3"], awardedAt: daysAgo(0) },
    { userId: stu[5].id, badgeId: b["streak-7"], awardedAt: daysAgo(1) },
    { userId: theo.id, badgeId: b["bug-hunter"], awardedAt: daysAgo(2) },
  ]);

  await db.insert(certificates).values({ id: randomUUID(), userId: aria.id, courseId: fend.id, code: "EDU-7Q4M-92XT", issuedAt: daysAgo(14, 10) });

  // other students: skill scores for the class dashboard
  const otherScores = stu.slice(1).flatMap((u, i) =>
    (["js-basics", "control-flow", "functions", "arrays", "objects", "dom", "async"] as (keyof typeof s)[])
      .map((slug, k) => ({ userId: u.id, skillId: s[slug], score: String(Math.max(15, Math.min(98, 45 + ((i * 13 + k * 29) % 60) - 15))), measuredAt: daysAgo(4 - (i % 3), 11) })));
  await db.insert(studentSkillScores).values(otherScores);

  // ---------- peer review demo graph ----------
  const orbitCode = (variant: string) => `<div class="loader"><span class="core"></span><span class="ring"><span class="node"></span></span></div>\n<style>\n  body{background:#0b0d1f;display:grid;place-items:center;min-height:90vh}\n  .loader{position:relative;width:96px;height:96px}\n  .core{position:absolute;inset:38px;border-radius:50%;background:#7c6cff}\n  .ring{position:absolute;inset:0;border:1px solid #3ef0c066;border-radius:50%;animation:spin 2.4s linear infinite}\n  .node{position:absolute;top:-5px;left:50%;width:10px;height:10px;border-radius:50%;background:#3ef0c0}\n  @keyframes spin{to{transform:rotate(360deg)}}\n</style>\n<!-- ${variant} -->`;
  const noorSub = { id: randomUUID(), userId: noor.id, exerciseId: orbitLoader.id, kind: "assignment" as const, title: "Orbit Loader", code: orbitCode("noor draft 2"), status: "reviewing" as const, createdAt: daysAgo(2, 15) };
  const ariaSub = { id: randomUUID(), userId: aria.id, exerciseId: orbitLoader.id, kind: "assignment" as const, title: "Orbit Loader", code: orbitCode("aria draft 1"), status: "reviewing" as const, createdAt: daysAgo(3, 16) };
  await db.insert(submissions).values([noorSub, ariaSub]);

  const pa1 = { id: randomUUID(), submissionId: noorSub.id, reviewerId: aria.id, status: "pending" as const, assignedAt: daysAgo(1, 9) };
  const pa2 = { id: randomUUID(), submissionId: ariaSub.id, reviewerId: theo.id, status: "pending" as const, assignedAt: daysAgo(2, 16) };
  const pa3 = { id: randomUUID(), submissionId: ariaSub.id, reviewerId: june.id, status: "submitted" as const, assignedAt: daysAgo(2, 16), completedAt: daysAgo(1, 20) };
  const pa4 = { id: randomUUID(), submissionId: noorSub.id, reviewerId: felix.id, status: "pending" as const, assignedAt: daysAgo(1, 9) };
  await db.insert(peerAssignments).values([pa1, pa2, pa3, pa4]);

  const critRows = await db.select().from(rubricCriteria);
  const rev = { id: randomUUID(), assignmentId: pa3.id, submissionId: ariaSub.id, reviewerId: june.id,
    overallComment: "The ring motion is smooth and the mint node reads clearly against the dark background. Tabular naming (`spin`, `core`, `node`) made the CSS quick to follow. The core dot sits 1px off-center at 96px because inset doesn't account for its own size — `translate(-50%,-50%)` from the parent center would fix it. No console errors.", createdAt: daysAgo(1, 20) };
  await db.insert(peerReviews).values(rev);
  await db.insert(reviewScores).values(critRows.map((c, i) => ({ reviewId: rev.id, criterionId: c.id, score: [9, 8, 9, 10][i] })));

  // ---------- live sessions ----------
  const startsAt = (d: number, h: number) => new Date(Date.now() + d * 864e5).setHours(h, 0, 0, 0);
  await db.insert(liveSessions).values([
    { courseId: jsf.id, hostId: priya.id, title: "Async debugging clinic", startsAt: new Date(startsAt(2, 17)), durationMin: 60, roomCode: "edusphere-async-clinic", joinUrl: "https://meet.jit.si/edusphere-async-clinic" },
    { courseId: algo.id, hostId: marco.id, title: "Two-sum walkthrough and variants", startsAt: new Date(startsAt(5, 16)), durationMin: 45, roomCode: "edusphere-twosum-lab", joinUrl: "https://meet.jit.si/edusphere-twosum-lab" },
  ]);

  await db.insert(notifications).values([
    { userId: aria.id, type: "review_assigned", title: "A peer submission is waiting for your review", body: "One Orbit Loader submission was added to your review queue.", createdAt: daysAgo(1, 9) },
    { userId: aria.id, type: "review_received", title: "New feedback on your Orbit Loader", body: "A reviewer finished scoring your submission. Average so far: 9.0/10.", createdAt: daysAgo(1, 20) },
    { userId: aria.id, type: "badge", title: "Badge earned: Kindling", body: "3-day streak. Keep it alive tomorrow.", createdAt: daysAgo(0) },
  ]);

  console.log("seed done.");
  console.log("demo logins (password123): aria@edusphere.dev · instructor@edusphere.dev · admin@edusphere.dev");
  console.log("verify demo certificate: /verify/EDU-7Q4M-92XT");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
