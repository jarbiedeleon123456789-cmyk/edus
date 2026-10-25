import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  boolean, char, date, datetime, decimal, index, int, json, mediumtext,
  mysqlEnum, mysqlTable, primaryKey, text, uniqueIndex, varchar,
} from "drizzle-orm/mysql-core";

const id = () => char("id", { length: 36 }).primaryKey().$defaultFn(randomUUID);
const createdAt = () => datetime("created_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull();
const updatedAt = () => datetime("updated_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).$onUpdateFn(() => new Date()).notNull();

export const institutions = mysqlTable("institutions", {
  id: id(),
  name: varchar({ length: 120 }).notNull(),
  domain: varchar({ length: 120 }),
  createdAt: createdAt(),
});

export const users = mysqlTable("users", {
  id: id(),
  institutionId: char("institution_id", { length: 36 }).references(() => institutions.id),
  name: varchar({ length: 100 }).notNull(),
  email: varchar({ length: 190 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["student", "instructor", "admin"]).notNull().default("student"),
  xp: int().notNull().default(0),
  level: int().notNull().default(1),
  active: boolean().notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(true),
  avatar: mediumtext(),
  bio: varchar({ length: 180 }).notNull().default("Building momentum, one lesson at a time."),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const emailVerifications = mysqlTable("email_verifications", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: char("code_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("email_verifications_user_uq").on(t.userId)]);

export const refreshTokens = mysqlTable("refresh_tokens", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  revokedAt: datetime("revoked_at", { mode: "date" }),
  createdAt: createdAt(),
}, (t) => [index("idx_user").on(t.userId)]);

export const courses = mysqlTable("courses", {
  id: id(),
  instructorId: char("instructor_id", { length: 36 }).notNull().references(() => users.id),
  title: varchar({ length: 160 }).notNull(),
  slug: varchar({ length: 80 }).notNull(),
  description: text().notNull(),
  level: varchar({ length: 20 }).notNull().default("beginner"),
  accent: varchar({ length: 20 }).notNull().default("indigo"),
  published: boolean().notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("courses_slug_uq").on(t.slug)]);

export const modules = mysqlTable("modules", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: varchar({ length: 160 }).notNull(),
  position: int().notNull().default(0),
});

export const courseEnrollments = mysqlTable("course_enrollments", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  enrolledAt: datetime("enrolled_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  uniqueIndex("course_enrollments_uq").on(t.courseId, t.userId),
  index("idx_user").on(t.userId),
]);

export const lessons = mysqlTable("lessons", {
  id: id(),
  moduleId: char("module_id", { length: 36 }).notNull().references(() => modules.id, { onDelete: "cascade" }),
  title: varchar({ length: 160 }).notNull(),
  content: mediumtext().notNull(),
  estimatedMinutes: int("estimated_minutes").notNull().default(20),
  position: int().notNull().default(0),
  createdAt: createdAt(),
});

export const courseMaterials = mysqlTable("course_materials", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  moduleId: char("module_id", { length: 36 }).notNull().references(() => modules.id, { onDelete: "cascade" }),
  uploadedBy: char("uploaded_by", { length: 36 }).notNull().references(() => users.id),
  name: varchar({ length: 200 }).notNull(),
  storageKey: char("storage_key", { length: 36 }).notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  bytes: int().notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("course_materials_storage_uq").on(t.storageKey),
  index("idx_module").on(t.moduleId),
  index("idx_course").on(t.courseId),
]);

export const finalAssessments = mysqlTable("final_assessments", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: varchar({ length: 160 }).notNull(),
  passScore: int("pass_score").notNull().default(80),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("final_assessments_course_uq").on(t.courseId)]);

export const finalAssessmentQuestions = mysqlTable("final_assessment_questions", {
  id: id(),
  assessmentId: char("assessment_id", { length: 36 }).notNull().references(() => finalAssessments.id, { onDelete: "cascade" }),
  prompt: text().notNull(),
  options: json().$type<string[]>().notNull(),
  correctOption: int("correct_option").notNull(),
  points: int().notNull().default(1),
  position: int().notNull().default(0),
}, (t) => [index("idx_assessment").on(t.assessmentId)]);

export const finalAssessmentAttempts = mysqlTable("final_assessment_attempts", {
  id: id(),
  assessmentId: char("assessment_id", { length: 36 }).notNull().references(() => finalAssessments.id, { onDelete: "cascade" }),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  score: decimal({ precision: 5, scale: 2 }).notNull(),
  passed: boolean().notNull(),
  submittedAt: datetime("submitted_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  index("idx_assessment_user").on(t.assessmentId, t.userId),
  index("idx_user").on(t.userId),
]);

export const skills = mysqlTable("skills", {
  id: id(),
  name: varchar({ length: 80 }).notNull(),
  slug: varchar({ length: 60 }).notNull(),
  category: varchar({ length: 40 }).notNull().default("engineering"),
}, (t) => [uniqueIndex("skills_slug_uq").on(t.slug)]);

export const courseSkills = mysqlTable("course_skills", {
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  skillId: char("skill_id", { length: 36 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.courseId, t.skillId] })]);

export const lessonSkills = mysqlTable("lesson_skills", {
  lessonId: char("lesson_id", { length: 36 }).notNull().references(() => lessons.id, { onDelete: "cascade" }),
  skillId: char("skill_id", { length: 36 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.lessonId, t.skillId] })]);

export const assessments = mysqlTable("assessments", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: varchar({ length: 160 }).notNull(),
  kind: mysqlEnum("kind", ["placement", "quiz"]).notNull().default("placement"),
  createdAt: createdAt(),
});

export const assessmentQuestions = mysqlTable("assessment_questions", {
  id: id(),
  assessmentId: char("assessment_id", { length: 36 }).notNull().references(() => assessments.id, { onDelete: "cascade" }),
  skillId: char("skill_id", { length: 36 }).notNull().references(() => skills.id),
  type: mysqlEnum("type", ["mcq", "short"]).notNull().default("mcq"),
  prompt: text().notNull(),
  options: json("options").$type<string[]>(),
  answer: text().notNull(),
  points: int().notNull().default(10),
  position: int().notNull().default(0),
});

export const assessmentAttempts = mysqlTable("assessment_attempts", {
  id: id(),
  assessmentId: char("assessment_id", { length: 36 }).notNull().references(() => assessments.id),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["in_progress", "submitted"]).notNull().default("in_progress"),
  score: decimal({ precision: 5, scale: 2 }).notNull().default("0"),
  startedAt: datetime("started_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  submittedAt: datetime("submitted_at", { mode: "date" }),
}, (t) => [index("idx_user").on(t.userId)]);

export const attemptAnswers = mysqlTable("attempt_answers", {
  id: id(),
  attemptId: char("attempt_id", { length: 36 }).notNull().references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  questionId: char("question_id", { length: 36 }).notNull().references(() => assessmentQuestions.id),
  response: text().notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  pointsAwarded: int("points_awarded").notNull().default(0),
});

export const studentSkillScores = mysqlTable("student_skill_scores", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  skillId: char("skill_id", { length: 36 }).notNull().references(() => skills.id),
  source: mysqlEnum("source", ["assessment", "exercise", "review"]).notNull().default("assessment"),
  score: decimal({ precision: 5, scale: 2 }).notNull(),
  measuredAt: datetime("measured_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [index("idx_user").on(t.userId)]);

export const learningPaths = mysqlTable("learning_paths", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id),
  status: mysqlEnum("status", ["active", "completed"]).notNull().default("active"),
  velocity: decimal({ precision: 5, scale: 2 }).notNull().default("0.5"),
  rationale: text().notNull(),
  generatedAt: datetime("generated_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: datetime("completed_at", { mode: "date" }),
}, (t) => [index("idx_user").on(t.userId)]);

export const learningPathItems = mysqlTable("learning_path_items", {
  id: id(),
  pathId: char("path_id", { length: 36 }).notNull().references(() => learningPaths.id, { onDelete: "cascade" }),
  lessonId: char("lesson_id", { length: 36 }).notNull().references(() => lessons.id),
  position: int().notNull().default(0),
  status: mysqlEnum("status", ["locked", "current", "done", "skipped"]).notNull().default("locked"),
  completedAt: datetime("completed_at", { mode: "date" }),
}, (t) => [index("idx_path").on(t.pathId)]);

export const codingExercises = mysqlTable("coding_exercises", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  skillId: char("skill_id", { length: 36 }).references(() => skills.id),
  title: varchar({ length: 160 }).notNull(),
  prompt: text().notNull(),
  language: varchar({ length: 20 }).notNull().default("javascript"),
  starterCode: mediumtext("starter_code").notNull(),
  timeLimitSec: int("time_limit_sec").notNull().default(10),
  createdAt: createdAt(),
});

export const testCases = mysqlTable("test_cases", {
  id: id(),
  exerciseId: char("exercise_id", { length: 36 }).notNull().references(() => codingExercises.id, { onDelete: "cascade" }),
  input: mediumtext().notNull(),
  expected: text().notNull(),
  hidden: boolean().notNull().default(false),
  position: int().notNull().default(0),
});

export const submissions = mysqlTable("submissions", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  exerciseId: char("exercise_id", { length: 36 }).references(() => codingExercises.id),
  kind: mysqlEnum("kind", ["exercise", "assignment"]).notNull().default("exercise"),
  title: varchar({ length: 160 }),
  code: mediumtext().notNull(),
  language: varchar({ length: 20 }).notNull().default("javascript"),
  status: mysqlEnum("status", ["submitted", "reviewing", "reviewed"]).notNull().default("submitted"),
  createdAt: createdAt(),
}, (t) => [index("idx_user").on(t.userId)]);

export const executionResults = mysqlTable("execution_results", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  submissionId: char("submission_id", { length: 36 }).references(() => submissions.id, { onDelete: "set null" }),
  exerciseId: char("exercise_id", { length: 36 }).references(() => codingExercises.id),
  stdout: mediumtext().notNull(),
  stderr: mediumtext().notNull(),
  runtimeMs: int("runtime_ms").notNull().default(0),
  passedCount: int("passed_count").notNull().default(0),
  totalCount: int("total_count").notNull().default(0),
  results: json("results").$type<{ input: string; expected: string; actual: string; passed: boolean; log: string[]; hidden: boolean }[]>().notNull(),
  createdAt: createdAt(),
}, (t) => [index("idx_user").on(t.userId)]);

export const codingAssignments = mysqlTable("coding_assignments", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  exerciseId: char("exercise_id", { length: 36 }).notNull().references(() => codingExercises.id, { onDelete: "cascade" }),
  instructorId: char("instructor_id", { length: 36 }).notNull().references(() => users.id),
  title: varchar({ length: 160 }).notNull(),
  instructions: text().notNull(),
  dueAt: datetime("due_at", { mode: "date" }),
  published: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("idx_course").on(t.courseId),
  index("idx_instructor").on(t.instructorId),
]);

export const codingAssignmentAttempts = mysqlTable("coding_assignment_attempts", {
  id: id(),
  assignmentId: char("assignment_id", { length: 36 }).notNull().references(() => codingAssignments.id, { onDelete: "cascade" }),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  executionResultId: char("execution_result_id", { length: 36 }).references(() => executionResults.id, { onDelete: "set null" }),
  code: mediumtext().notNull(),
  passedCount: int("passed_count").notNull().default(0),
  totalCount: int("total_count").notNull().default(0),
  score: decimal({ precision: 5, scale: 2 }).notNull().default("0"),
  isLate: boolean("is_late").notNull().default(false),
  submittedAt: datetime("submitted_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  index("idx_assignment_user").on(t.assignmentId, t.userId),
  index("idx_user").on(t.userId),
]);

export const rubrics = mysqlTable("rubrics", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: varchar({ length: 160 }).notNull(),
});

export const rubricCriteria = mysqlTable("rubric_criteria", {
  id: id(),
  rubricId: char("rubric_id", { length: 36 }).notNull().references(() => rubrics.id, { onDelete: "cascade" }),
  label: varchar({ length: 120 }).notNull(),
  description: text().notNull(),
  maxPoints: int("max_points").notNull().default(10),
  position: int().notNull().default(0),
});

export const peerAssignments = mysqlTable("peer_assignments", {
  id: id(),
  submissionId: char("submission_id", { length: 36 }).notNull().references(() => submissions.id, { onDelete: "cascade" }),
  reviewerId: char("reviewer_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["pending", "submitted"]).notNull().default("pending"),
  assignedAt: datetime("assigned_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: datetime("completed_at", { mode: "date" }),
}, (t) => [
  uniqueIndex("peer_assignments_uq").on(t.submissionId, t.reviewerId),
  index("idx_reviewer").on(t.reviewerId),
]);

export const peerReviews = mysqlTable("peer_reviews", {
  id: id(),
  assignmentId: char("assignment_id", { length: 36 }).notNull().references(() => peerAssignments.id, { onDelete: "cascade" }),
  submissionId: char("submission_id", { length: 36 }).notNull().references(() => submissions.id, { onDelete: "cascade" }),
  reviewerId: char("reviewer_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  overallComment: text("overall_comment").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("peer_reviews_assignment_uq").on(t.assignmentId)]);

export const reviewScores = mysqlTable("review_scores", {
  id: id(),
  reviewId: char("review_id", { length: 36 }).notNull().references(() => peerReviews.id, { onDelete: "cascade" }),
  criterionId: char("criterion_id", { length: 36 }).notNull().references(() => rubricCriteria.id),
  score: int().notNull(),
});

export const progressRecords = mysqlTable("progress_records", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: char("lesson_id", { length: 36 }).notNull().references(() => lessons.id, { onDelete: "cascade" }),
  timeSpentSec: int("time_spent_sec").notNull().default(0),
  completedAt: datetime("completed_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [uniqueIndex("progress_uq").on(t.userId, t.lessonId)]);

export const streaks = mysqlTable("streaks", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  current: int().notNull().default(0),
  longest: int().notNull().default(0),
  lastActivityDate: date("last_activity_date", { mode: "string" }),
}, (t) => [uniqueIndex("streaks_user_uq").on(t.userId)]);

export const badges = mysqlTable("badges", {
  id: id(),
  code: varchar({ length: 40 }).notNull(),
  name: varchar({ length: 80 }).notNull(),
  description: text().notNull(),
  icon: varchar({ length: 30 }).notNull().default("award"),
  accent: varchar({ length: 20 }).notNull().default("amber"),
  xpReward: int("xp_reward").notNull().default(0),
}, (t) => [uniqueIndex("badges_code_uq").on(t.code)]);

export const userBadges = mysqlTable("user_badges", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: char("badge_id", { length: 36 }).notNull().references(() => badges.id, { onDelete: "cascade" }),
  awardedAt: datetime("awarded_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [uniqueIndex("user_badges_uq").on(t.userId, t.badgeId)]);

export const certificates = mysqlTable("certificates", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id),
  code: varchar({ length: 20 }).notNull(),
  issuedAt: datetime("issued_at", { mode: "date" }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [
  uniqueIndex("certificates_code_uq").on(t.code),
  uniqueIndex("certificates_user_course_uq").on(t.userId, t.courseId),
]);

export const subscriptions = mysqlTable("subscriptions", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar({ length: 20 }).notNull(),
  status: varchar({ length: 20 }).notNull().default("active"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 80 }),
  stripeSubId: varchar("stripe_sub_id", { length: 80 }),
  createdAt: createdAt(),
});

export const payments = mysqlTable("payments", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  amountCents: int("amount_cents").notNull(),
  currency: varchar({ length: 8 }).notNull().default("usd"),
  status: varchar({ length: 20 }).notNull().default("demo"),
  stripeSessionId: varchar("stripe_session_id", { length: 80 }),
  createdAt: createdAt(),
});

export const payouts = mysqlTable("payouts", {
  id: id(),
  instructorId: char("instructor_id", { length: 36 }).notNull().references(() => users.id),
  amountCents: int("amount_cents").notNull(),
  status: varchar({ length: 20 }).notNull().default("demo"),
  createdAt: createdAt(),
});

export const liveSessions = mysqlTable("live_sessions", {
  id: id(),
  courseId: char("course_id", { length: 36 }).notNull().references(() => courses.id, { onDelete: "cascade" }),
  hostId: char("host_id", { length: 36 }).notNull().references(() => users.id),
  title: varchar({ length: 160 }).notNull(),
  startsAt: datetime("starts_at", { mode: "date" }).notNull(),
  durationMin: int("duration_min").notNull().default(60),
  roomCode: varchar("room_code", { length: 60 }).notNull(),
  joinUrl: varchar("join_url", { length: 190 }).notNull(),
  createdAt: createdAt(),
});

export const files = mysqlTable("files", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id),
  key: varchar({ length: 255 }).notNull(),
  bytes: int().notNull().default(0),
  contentType: varchar("content_type", { length: 80 }),
  createdAt: createdAt(),
});

export const notifications = mysqlTable("notifications", {
  id: id(),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar({ length: 30 }).notNull(),
  title: varchar({ length: 190 }).notNull(),
  body: text().notNull(),
  readAt: datetime("read_at", { mode: "date" }),
  createdAt: createdAt(),
}, (t) => [index("idx_user").on(t.userId)]);

export const auditLogs = mysqlTable("audit_logs", {
  id: id(),
  userId: char("user_id", { length: 36 }).references(() => users.id),
  action: varchar({ length: 80 }).notNull(),
  meta: json("meta").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index("idx_action").on(t.action)]);
