<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
class LabController extends MY_Controller
{
    private $db;
    private $content;
    private $assessments;
    private $reviews;
    private $gamify;
    private $assigner;

    public function __construct()
    {
        parent::__construct();
        $this->call->library('Engines');
        $this->call->library('Clients');
        $this->db = $this->call->database();
        $this->content = $this->call->model('Content_model');
        $this->assessments = $this->call->model('Assessment_model');
        $this->reviews = $this->call->model('Review_model');
        $this->gamify = new Gamify($this->db);
        $this->assigner = new PeerAssigner($this->db, $this->gamify);
    }

    public function exercises()
    {
        $user = auth_user($this->db);
        respond($this->content->exercisesWithBest($user['id']));
    }

    /** Execution endpoint: user code runs only in the private Judge0 sandbox. */
    public function run()
    {
        $user = auth_user($this->db);
        if (rate_limited($this->db, "run:{$user['id']}", 30, 60)) fail_api('Slow down — you can run code 30 times per minute.', 429);

        $b = json_body();
        $code = (string)($b['code'] ?? '');
        if (trim($code) === '' || strlen($code) > 50000) fail_api('Nothing to run yet (max 50,000 chars).', 422);
        $language = $b['language'] ?? 'javascript';
        $submit = (bool)($b['submit'] ?? false);

        $exercise = null;
        $tests = [];
        if (!empty($b['exerciseId'])) {
            $exercise = $this->content->exercise($b['exerciseId']);
            if (!$exercise) fail_api('Exercise not found.', 404);
            $tests = $this->content->testCases($exercise['id']);
            $language = $exercise['language'];
        }

        if (!$exercise) {
            if ($submit) fail_api('Choose an exercise before submitting code.', 422);
            $result = Judge0Client::runFree($code, (string)$language, (string)($b['input'] ?? ''));
            $this->reviews->insertExecution([
                'id' => uuid4(), 'userId' => $user['id'], 'exerciseId' => null,
                'stdout' => $result['stdout'], 'stderr' => $result['stderr'], 'runtimeMs' => $result['runtimeMs'],
                'passed' => 0, 'total' => 0, 'results' => [],
            ]);
            respond($result, 'Ran.');
        }

        $result = $this->execute($code, $language, $tests);

        $execId = uuid4();
        $this->reviews->insertExecution([
            'id' => $execId, 'userId' => $user['id'], 'exerciseId' => $exercise['id'] ?? null,
            'stdout' => $result['stdout'], 'stderr' => $result['stderr'], 'runtimeMs' => $result['runtime_ms'],
            'passed' => $result['passed_count'], 'total' => $result['total_count'], 'results' => $result['results'],
        ]);
        [$xpGained, $badges] = $this->rewardProgress($user['id'], $exercise, $execId, $result);

        $submissionId = null;
        if ($submit) {
            $submissionId = uuid4();
            $this->reviews->insertSubmission($submissionId, $user['id'], $exercise['id'] ?? null, 'exercise', null, $code, $language);
        }
        $clientResults = array_map(static function ($case) {
            if (empty($case['hidden'])) return $case;
            return array_merge($case, [
                'input' => '',
                'expected' => '',
                'actual' => $case['passed'] ? 'Passed' : 'Hidden test failed',
                'log' => [],
            ]);
        }, $result['results']);
        respond([
            'submissionId' => $submissionId,
            'stdout' => $result['stdout'],
            'stderr' => $result['stderr'],
            'runtimeMs' => $result['runtime_ms'],
            'passedCount' => $result['passed_count'],
            'totalCount' => $result['total_count'],
            'results' => $clientResults,
            'xpGained' => $xpGained,
            'badges' => $badges,
            'assignmentAttempt' => null,
        ], 'Ran.');
    }

    private function execute(string $code, string $language, array $tests): array
    {
        if ($language !== 'javascript') {
            fail_api("Automated exercise tests for $language are not supported by this API yet.", 501);
        }
        if (!Judge0Client::available()) {
            fail_api('Secure code execution is not configured. Set JUDGE0_URL to a private Judge0 instance.', 503);
        }
        $t0 = microtime(true);
        $cases = Judge0Client::run($code, $tests);
        $passed = count(array_filter($cases, fn($c) => $c['passed']));
        return ['stdout' => '', 'stderr' => '', 'runtime_ms' => max(1, (int)round((microtime(true) - $t0) * 1000)),
            'passed_count' => $passed, 'total_count' => count($cases), 'results' => $cases];
    }

    /** XP for beating your previous best; skill score snapshot; bug-hunter badge on first full pass. */
    private function rewardProgress($userId, $exercise, $execId, array $result): array
    {
        if (!$exercise || $result['total_count'] === 0) return [0, []];
        $priorBest = $this->reviews->priorBest($userId, $exercise['id'], $execId);
        $xpGained = max(0, $result['passed_count'] - $priorBest) * 15;
        $badges = [];
        if ($result['passed_count'] === $result['total_count'] && $priorBest < $result['total_count']) {
            $xpGained += 20;
            $b = $this->gamify->award($userId, 'bug-hunter');
            if ($b) $badges[] = $b;
        }
        if ($xpGained > 0) $this->gamify->addXp($userId, $xpGained);
        $this->gamify->touchStreak($userId);
        if (!empty($exercise['skill_id'])) {
            $this->assessments->recordSkillScore($userId, $exercise['skill_id'], 'exercise',
                (int)round($result['passed_count'] / $result['total_count'] * 100));
        }
        return [$xpGained, $badges];
    }

    // ---------- submissions ----------

    public function submissions()
    {
        $user = auth_user($this->db);
        $rows = $user['role'] === 'student'
            ? $this->reviews->listSubmissions($user['id'])
            : $this->reviews->listSubmissions(null);
        if ($user['role'] === 'student') respond($rows);
        respond(array_map(fn($r) => $r + ['authorAlias' => alias_for($r['author_id'])], $rows));
    }

    /** Assignment submission → automatic anonymous reviewer assignment (3 least-loaded classmates). */
    public function submit_assignment()
    {
        $user = require_role($this->db, ['student']);
        $b = json_body();
        if (empty($b['exerciseId']) || trim((string)($b['code'] ?? '')) === '') fail_api('Add some code before submitting.', 422);
        $exercise = $this->content->exercise($b['exerciseId']);
        if (!$exercise) fail_api('Exercise not found.', 404);

        $id = uuid4();
        $this->reviews->insertSubmission($id, $user['id'], $exercise['id'], 'assignment',
            preg_replace('/^Assignment — /', '', $exercise['title']), (string)$b['code'], $b['language'] ?? 'html');
        $assigned = $this->assigner->assign($id, $user['id'], 3);
        respond(['id' => $id, 'assigned' => $assigned], $assigned > 0
            ? "Submitted. $assigned anonymous classmates will review it."
            : 'Submitted, but no classmates are available to review it yet.', 201);
    }

    // ---------- peer review ----------

    public function review_queue()
    {
        $user = require_role($this->db, ['student']);
        [$byCourse, $fallback] = $this->content->rubricByCourse();
        respond(array_map(fn($r) => [
            'assignmentId' => $r['assignment_id'], 'status' => $r['status'],
            'assignedAt' => $r['assigned_at'], 'submittedAt' => $r['submitted_at'],
            'authorAlias' => 'Author ' . alias_for($r['author']),
            'title' => $r['title'] ?? $r['exercise_title'] ?? 'Assignment',
            'prompt' => $r['prompt'], 'code' => $r['code'], 'language' => $r['language'],
            'rubric' => !empty($r['course_id']) ? ($byCourse[$r['course_id']] ?? $fallback) : $fallback,
        ], $this->reviews->queueFor($user['id'])));
    }

    public function review_submit()
    {
        $user = require_role($this->db, ['student']);
        $b = json_body();
        $assignmentId = (string)($b['assignmentId'] ?? '');
        $comment = trim((string)($b['comment'] ?? ''));
        if (strlen($comment) < 20) fail_api('Write at least a sentence of feedback — 20 characters minimum.', 422, ['comment' => 'Too short.']);

        $a = $this->reviews->assignment($assignmentId);
        if (!$a || $a['reviewer_id'] !== $user['id']) fail_api('Assignment not found.', 404);
        if ($a['status'] !== 'pending') fail_api("You've already reviewed this submission.", 409);

        $scores = $b['scores'] ?? [];
        [$criteria, $total, $maxTotal] = $this->validateScores($scores);

        $reviewId = uuid4();
        $this->reviews->insertReview($reviewId, $assignmentId, $a['submission_id'], $user['id'], $comment);
        foreach ($scores as $s) $this->reviews->insertReviewScore($reviewId, $s['criterionId'], (int)$s['score']);
        $this->reviews->markAssignmentSubmitted($assignmentId);

        if ($this->reviews->openAssignmentCount($a['submission_id']) === 0) {
            $this->reviews->setSubmissionStatus($a['submission_id'], 'reviewed');
        }
        $sub = $this->reviews->submission($a['submission_id']);
        if ($sub) {
            $this->gamify->notify($sub['user_id'], 'review_received', "New feedback on \"{$sub['title']}\"",
                "A peer finished their review: $total/$maxTotal. Read it on the Feedback page.");
        }
        $xp = $this->gamify->addXp($user['id'], 50);
        $streak = $this->gamify->touchStreak($user['id']);
        $badge = $this->gamify->award($user['id'], 'reviewer');
        respond(['xp' => $xp['xp'], 'level' => $xp['level'], 'streak' => $streak, 'badges' => $badge ? [$badge] : []], 'Review submitted. Thanks for the careful read.');
    }

    private function validateScores(array $scores): array
    {
        $criteria = $this->reviews->criteriaByIds(array_map(fn($s) => $s['criterionId'] ?? '', $scores));
        if (count($scores) === 0 || count($criteria) !== count($scores)) fail_api('Unknown rubric criterion.', 422);
        $byId = [];
        foreach ($criteria as $c) $byId[$c['id']] = $c;
        $total = $maxTotal = 0;
        foreach ($scores as $s) {
            $c = $byId[$s['criterionId']];
            $v = (int)$s['score'];
            if ($v < 0 || $v > (int)$c['max_points']) fail_api("\"{$c['label']}\" is out of {$c['max_points']} — score $v is out of range.", 422);
            $total += $v;
            $maxTotal += (int)$c['max_points'];
        }
        return [$criteria, $total, $maxTotal];
    }

    public function review_feedback()
    {
        $user = require_role($this->db, ['student']);
        respond(array_map(fn($r) => [
            'reviewId' => $r['review_id'],
            'reviewerAlias' => 'Reviewer ' . alias_for($r['reviewer_id']),
            'title' => $r['title'] ?? 'Submission', 'comment' => $r['comment'], 'createdAt' => $r['created_at'],
            'total' => array_sum(array_column($r['scores'], 'score')),
            'max' => array_sum(array_column($r['scores'], 'max_points')),
            'criteria' => $r['scores'],
        ], $this->reviews->feedbackFor($user['id'])));
    }
}
