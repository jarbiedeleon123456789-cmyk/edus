<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
class LearningController extends MY_Controller
{
    private $db;
    private $content;
    private $assessments;
    private $paths_model;
    private $gamify;
    private $paths;

    public function __construct()
    {
        parent::__construct();
        $this->call->library('Engines');
        $this->db = $this->call->database();
        $this->content = $this->call->model('Content_model');
        $this->assessments = $this->call->model('Assessment_model');
        $this->paths_model = $this->call->model('Path_model');
        $this->gamify = new Gamify($this->db);
        $this->paths = new PathEngine($this->db, $this->gamify);
    }

    public function courses()
    {
        auth_user($this->db);
        respond($this->content->publishedCourses());
    }

    public function lesson($id)
    {
        $user = auth_user($this->db);
        $lesson = $this->content->lessonBundle($id, $user['id']);
        if (!$lesson) fail_api('Lesson not found.', 404);
        respond($lesson);
    }

    // ---------- placement ----------

    public function placement()
    {
        $user = auth_user($this->db);
        $asm = $this->assessments->placementHeader();
        if (!$asm) respond(['assessment' => null, 'questions' => [], 'bestScore' => null], 'No placement assessment.');
        respond([
            'assessment' => $asm,
            'questions' => $this->assessments->publicQuestions($asm['id']),
            'bestScore' => $this->assessments->bestScore($user['id']),
        ]);
    }

    // Grades, writes per-skill mastery, then re-sequences the learning path around the gaps.
    public function placement_submit()
    {
        $user = require_role($this->db, ['student']);
        $b = json_body();
        $answers = $b['answers'] ?? [];
        if (!is_array($answers) || count($answers) === 0) fail_api('Answer at least one question.', 422);

        $byId = [];
        foreach ($this->assessments->allQuestionsWithKeys() as $q) $byId[$q['id']] = $q;

        $graded = [];
        $earned = $possible = 0;
        foreach ($answers as $a) {
            $q = $byId[$a['questionId'] ?? ''] ?? null;
            if (!$q) continue;
            $response = trim((string)($a['response'] ?? ''));
            $correct = $q['type'] === 'mcq'
                ? $response === $q['answer']
                : mb_stripos($response, $q['answer']) !== false;
            $awarded = $correct ? (int)$q['points'] : 0;
            $earned += $awarded;
            $possible += (int)$q['points'];
            $graded[] = ['q' => $q, 'response' => $response, 'correct' => $correct, 'awarded' => $awarded];
        }
        if (count($graded) === 0) fail_api('Unknown questions.', 422);
        $scorePct = $possible > 0 ? $earned / $possible * 100 : 0;

        $attemptId = uuid4();
        $this->assessments->recordAttempt($attemptId, $graded[0]['q']['assessment_id'], $user['id'], $scorePct);
        $perSkill = [];
        foreach ($graded as $g) {
            $this->assessments->recordAnswer($attemptId, $g['q']['id'], $g['response'], $g['correct'], $g['awarded']);
            $k = $g['q']['skill_id'];
            $perSkill[$k] = $perSkill[$k] ?? ['name' => $g['q']['skill_name'] ?? 'Skill', 'earned' => 0, 'possible' => 0];
            $perSkill[$k]['earned'] += $g['awarded'];
            $perSkill[$k]['possible'] += (int)$g['q']['points'];
        }
        $gaps = $this->recordSkillGaps($user['id'], $perSkill);

        $badges = array_filter([$this->gamify->award($user['id'], 'pathfinder'), $scorePct >= 90 ? $this->gamify->award($user['id'], 'sharp-mind') : null]);
        $xp = $this->gamify->addXp($user['id'], 30);
        $streak = $this->gamify->touchStreak($user['id']);
        $path = $this->paths->generate($user['id'], true);

        respond([
            'scorePct' => (int)round($scorePct), 'earned' => $earned, 'possible' => $possible,
            'perQuestion' => array_map(fn($g) => [
                'questionId' => $g['q']['id'], 'prompt' => $g['q']['prompt'], 'response' => $g['response'],
                'correct' => $g['correct'], 'expected' => $g['q']['answer'], 'pointsAwarded' => $g['awarded'], 'skill' => $g['q']['skill_name'],
            ], $graded),
            'skillGaps' => $gaps, 'xp' => $xp['xp'], 'level' => $xp['level'], 'streak' => $streak,
            'badges' => array_values($badges), 'pathId' => $path['path_id'],
        ], 'Scored ' . round($scorePct) . '%. Your path has been re-sequenced around the gaps.');
    }

    private function recordSkillGaps($userId, array $perSkill): array
    {
        $gaps = [];
        foreach ($perSkill as $skillId => $v) {
            $score = (int)round($v['earned'] / $v['possible'] * 100);
            $gaps[] = ['skillId' => $skillId, 'skill' => $v['name'], 'score' => $score];
            $this->assessments->recordSkillScore($userId, $skillId, 'assessment', $score);
        }
        usort($gaps, fn($a, $b) => $a['score'] <=> $b['score']);
        return $gaps;
    }

    // ---------- learning path ----------

    public function path()
    {
        $user = auth_user($this->db);
        $path = $this->paths_model->activeFor($user['id']);
        if (!$path) {
            respond(['path' => null, 'hasPlacement' => $this->assessments->hasAttempt($user['id'])], 'No active learning path.');
        }
        respond($this->pathPayload($path));
    }

    public function path_generate()
    {
        $user = require_role($this->db, ['student']);
        $existing = $this->paths_model->activeFor($user['id']);
        $result = $this->paths->generate($user['id'], (bool)$existing);
        $badge = $result['created'] ? $this->gamify->award($user['id'], 'pathfinder') : null;
        $path = $this->paths_model->byId($result['path_id']);
        respond($this->pathPayload($path) + ['badge' => $badge], $existing ? 'Path regenerated around your latest scores.' : 'Your path is ready.');
    }

    public function path_progress()
    {
        $user = require_role($this->db, ['student']);
        $b = json_body();
        $result = $this->paths->completeItem((string)($b['itemId'] ?? ''), $user['id']);
        if (isset($result['error'])) fail_api($result['error'], $result['status']);

        $item = $this->paths_model->itemById((string)$b['itemId']);
        if ($item) {
            $this->paths_model->recordProgress($user['id'], $item['lesson_id'], max(0, min(86400, (int)($b['timeSpentSec'] ?? 0))));
        }
        $xp = $this->gamify->addXp($user['id'], 40);
        $streak = $this->gamify->touchStreak($user['id']);
        $badges = array_filter([
            $this->gamify->award($user['id'], 'first-steps'),
            !empty($result['completed']) ? $this->gamify->award($user['id'], 'constellation') : null,
        ]);
        respond([
            'completed' => $result['completed'],
            'certificateCode' => $result['certificate_code'] ?? null,
            'xp' => $xp['xp'], 'level' => $xp['level'], 'streak' => $streak, 'badges' => array_values($badges),
        ], $result['completed'] ? 'Path complete — certificate issued.' : 'Lesson complete. Next item unlocked.');
    }

    private function pathPayload(array $path): array
    {
        return [
            'path' => $path,
            'items' => $this->paths_model->itemsOf($path['id']),
            'course' => $this->content->courseById($path['course_id']),
        ];
    }
}
