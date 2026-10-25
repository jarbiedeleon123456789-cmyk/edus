import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "./index";
import {
  codingAssignments, codingExercises, courses, finalAssessmentQuestions, finalAssessments, testCases,
} from "./schema";

const samples = [
  {
    slug: "js-foundations",
    assignmentTitle: "JavaScript Foundations Skill Check",
    exerciseTitle: "Sum an Array",
    prompt: "Implement solve(input) to return the sum of all numbers in the input array. Return 0 for an empty array.",
    starterCode: "function solve(input) {\n  // Return the sum of the numbers in input.\n}\n",
    cases: [
      { input: "[1,2,3,4]", expected: "10", hidden: false },
      { input: "[]", expected: "0", hidden: false },
      { input: "[-5,2,3]", expected: "0", hidden: true },
    ],
    instructions: "Complete the array-summing function and run all visible and hidden tests before submitting.",
    assessmentTitle: "JavaScript Foundations Final",
    questions: [
      { prompt: "Which keyword declares a binding that cannot be reassigned?", options: ["let", "const", "var", "static"], correctOption: 1 },
      { prompt: "What does Array.prototype.map() return?", options: ["A new transformed array", "The first matching value", "A boolean", "The original array only"], correctOption: 0 },
      { prompt: "Which comparison avoids type coercion?", options: ["==", "=", "===", "!="], correctOption: 2 },
      { prompt: "What does a function return when it reaches its end without a return statement?", options: ["null", "false", "0", "undefined"], correctOption: 3 },
    ],
  },
  {
    slug: "frontend-eng",
    assignmentTitle: "Frontend Engineering Skill Check",
    exerciseTitle: "Build Navigation Links",
    prompt: "Implement solve(input) to turn an array of route objects into accessible navigation link descriptors. Keep only routes with a non-empty label and href, preserving their input order. Return objects with label, href, and current (a boolean indicating whether href matches input.currentPath).",
    starterCode: "function solve(input) {\n  // input: { routes: [{label, href}], currentPath }\n  // Return valid navigation link descriptors.\n}\n",
    cases: [
      { input: "{\"routes\":[{\"label\":\"Home\",\"href\":\"/\"},{\"label\":\"Docs\",\"href\":\"/docs\"}],\"currentPath\":\"/docs\"}", expected: "[{\"label\":\"Home\",\"href\":\"/\",\"current\":false},{\"label\":\"Docs\",\"href\":\"/docs\",\"current\":true}]", hidden: false },
      { input: "{\"routes\":[{\"label\":\"\",\"href\":\"/empty\"},{\"label\":\"About\",\"href\":\"/about\"}],\"currentPath\":\"/\"}", expected: "[{\"label\":\"About\",\"href\":\"/about\",\"current\":false}]", hidden: false },
      { input: "{\"routes\":[{\"label\":\"Start\",\"href\":\"/start\"}],\"currentPath\":\"/start\"}", expected: "[{\"label\":\"Start\",\"href\":\"/start\",\"current\":true}]", hidden: true },
    ],
    instructions: "Build the navigation descriptors from the route data. Preserve ordering and omit invalid routes.",
    assessmentTitle: "Frontend Engineering Final",
    questions: [
      { prompt: "Which attribute provides an accessible name for an icon-only button?", options: ["data-name", "aria-label", "role-name", "title-id"], correctOption: 1 },
      { prompt: "What is the purpose of a React key when rendering a list?", options: ["To style each item", "To identify items across renders", "To make each item clickable", "To cache network requests"], correctOption: 1 },
      { prompt: "Which API attaches an event handler without inline HTML JavaScript?", options: ["addEventListener", "setAttribute", "querySelectorAll", "createElement"], correctOption: 0 },
      { prompt: "Why should user-provided text usually be rendered as text rather than injected HTML?", options: ["It improves image quality", "It prevents markup injection", "It makes CSS selectors faster", "It enables server rendering"], correctOption: 1 },
    ],
  },
  {
    slug: "algorithms",
    assignmentTitle: "Algorithms Practice Skill Check",
    exerciseTitle: "Find Two Sum Indices",
    prompt: "Implement solve(input) where input has nums and target. Return the indices of two distinct values whose sum equals target. Return an empty array if no pair exists. Aim for O(n) time.",
    starterCode: "function solve(input) {\n  // input: { nums: number[], target: number }\n  // Return a pair of indices, or [] when there is no pair.\n}\n",
    cases: [
      { input: "{\"nums\":[2,7,11,15],\"target\":9}", expected: "[0,1]", hidden: false },
      { input: "{\"nums\":[3,2,4],\"target\":6}", expected: "[1,2]", hidden: false },
      { input: "{\"nums\":[3,3],\"target\":6}", expected: "[0,1]", hidden: true },
    ],
    instructions: "Return two different indices whose values add to the target. Do not use the same array element twice.",
    assessmentTitle: "Algorithms Practice Final",
    questions: [
      { prompt: "What is the time complexity of binary search on a sorted array?", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], correctOption: 1 },
      { prompt: "Which structure is commonly used to track values already seen by a Two Sum scan?", options: ["Stack", "Hash map", "Queue", "Linked list"], correctOption: 1 },
      { prompt: "What does a base case do in a recursive algorithm?", options: ["Stops recursion for a solvable smallest case", "Sorts the input", "Doubles the stack size", "Runs the function asynchronously"], correctOption: 0 },
      { prompt: "If an algorithm performs one constant-time operation for every input item, its time complexity is:", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], correctOption: 2 },
    ],
  },
] as const;

const pythonExercise = {
  title: "Python: Sum an Array",
  prompt: "Implement solve(input) to return the sum of all numbers in the input array. Return 0 for an empty array. Python execution requires a configured private Judge0 runner.",
  starterCode: "def solve(input):\n    # Return the sum of the numbers in input.\n    pass\n",
  cases: [
    { input: "[1,2,3,4]", expected: "10", hidden: false },
    { input: "[]", expected: "0", hidden: false },
    { input: "[-5,2,3]", expected: "0", hidden: true },
  ],
} as const;

const compiledExercises = [
  {
    language: "c",
    title: "C: Sum an Array",
    starterCode: `#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    char input[4096];
    if (!fgets(input, sizeof(input), stdin)) input[0] = '\\0';
    char *cursor = input;
    long sum = 0;
    while (*cursor) {
        if (*cursor == '-' || isdigit((unsigned char)*cursor)) {
            char *end;
            sum += strtol(cursor, &end, 10);
            cursor = end;
        } else {
            cursor++;
        }
    }
    printf("%ld\\n", sum);
    return 0;
}
`,
  },
  {
    language: "cpp",
    title: "C++: Sum an Array",
    starterCode: `    #include <iostream>
    #include <sstream>
    #include <string>

    int main() {
        std::stringstream input;
        input << std::cin.rdbuf();
        long long sum = 0;
        long long value;
        while (input >> value) sum += value;
        std::cout << sum << '\\n';
    }
    `,
  },
  {
    language: "csharp",
    title: "C#: Sum an Array",
    starterCode: `using System;
using System.Linq;

class Program {
    static void Main() {
        var input = Console.In.ReadToEnd();
        var sum = input.Split((char[])null, StringSplitOptions.RemoveEmptyEntries)
            .Sum(value => long.Parse(value));
        Console.WriteLine(sum);
    }
}
`,
  },
] as const;

async function main() {
  const coursesFound = await db.select({
    id: courses.id, slug: courses.slug, instructorId: courses.instructorId,
  }).from(courses).where(inArray(courses.slug, samples.map((sample) => sample.slug)));
  const courseBySlug = new Map(coursesFound.map((course) => [course.slug, course]));
  const missing = samples.filter((sample) => !courseBySlug.has(sample.slug)).map((sample) => sample.slug);
  if (missing.length) throw new Error(`Expected published sample courses are missing: ${missing.join(", ")}`);

  for (const sample of samples) {
    const course = courseBySlug.get(sample.slug)!;
    const [existingAssignment] = await db.select({ id: codingAssignments.id })
      .from(codingAssignments)
      .where(and(eq(codingAssignments.courseId, course.id), eq(codingAssignments.title, sample.assignmentTitle)))
      .limit(1);
    if (!existingAssignment) {
      const exerciseId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(codingExercises).values({
          id: exerciseId, courseId: course.id, title: sample.exerciseTitle, prompt: sample.prompt,
          language: "javascript", starterCode: sample.starterCode,
        });
        await tx.insert(testCases).values(sample.cases.map((testCase, position) => ({
          id: randomUUID(), exerciseId, ...testCase, position,
        })));
        await tx.insert(codingAssignments).values({
          id: randomUUID(), courseId: course.id, exerciseId, instructorId: course.instructorId,
          title: sample.assignmentTitle, instructions: sample.instructions, published: true,
        });
      });
      console.log(`Added practice assignment to ${sample.slug}.`);
    } else {
      console.log(`Practice assignment already exists for ${sample.slug}.`);
    }

    const [assessment] = await db.select({ id: finalAssessments.id })
      .from(finalAssessments).where(eq(finalAssessments.courseId, course.id)).limit(1);
    if (!assessment) {
      const assessmentId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(finalAssessments).values({
          id: assessmentId, courseId: course.id, title: sample.assessmentTitle, passScore: 80,
        });
        await tx.insert(finalAssessmentQuestions).values(sample.questions.map((question, position) => ({
          id: randomUUID(), assessmentId, ...question, options: [...question.options], points: 1, position,
        })));
      });
      console.log(`Added final assessment to ${sample.slug}.`);
    } else {
      console.log(`Final assessment already exists for ${sample.slug}.`);
    }
  }

  const algorithms = courseBySlug.get("algorithms")!;
  const [existingPythonExercise] = await db.select({ id: codingExercises.id })
    .from(codingExercises)
    .where(and(eq(codingExercises.courseId, algorithms.id), eq(codingExercises.title, pythonExercise.title)))
    .limit(1);
  if (!existingPythonExercise) {
    const exerciseId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(codingExercises).values({
        id: exerciseId, courseId: algorithms.id, title: pythonExercise.title,
        prompt: pythonExercise.prompt, language: "python", starterCode: pythonExercise.starterCode,
      });
      await tx.insert(testCases).values(pythonExercise.cases.map((testCase, position) => ({
        id: randomUUID(), exerciseId, ...testCase, position,
      })));
    });
    console.log("Added the Python playground exercise.");
  } else {
    console.log("Python playground exercise already exists.");
  }

  for (const exercise of compiledExercises) {
    const [existing] = await db.select({ id: codingExercises.id })
      .from(codingExercises)
      .where(and(eq(codingExercises.courseId, algorithms.id), eq(codingExercises.title, exercise.title)))
      .limit(1);
    if (existing) {
      console.log(`${exercise.title} already exists.`);
      continue;
    }

    const exerciseId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(codingExercises).values({
        id: exerciseId,
        courseId: algorithms.id,
        title: exercise.title,
        prompt: "Write a complete program that reads space-separated integers from standard input and prints their sum as a single number. The starter code is a working example you can modify. Execution requires a configured private Judge0 runner.",
        language: exercise.language,
        starterCode: exercise.starterCode,
      });
      await tx.insert(testCases).values([
        { id: randomUUID(), exerciseId, input: "1 2 3 4", expected: "10", hidden: false, position: 0 },
        { id: randomUUID(), exerciseId, input: "", expected: "0", hidden: false, position: 1 },
        { id: randomUUID(), exerciseId, input: "-5 2 3", expected: "0", hidden: true, position: 2 },
      ]);
    });
    console.log(`Added ${exercise.title} playground exercise.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Sample course seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
