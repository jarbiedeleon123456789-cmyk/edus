<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** courses, modules, lessons, skills, lesson/progress reads, coding exercises + test cases, rubrics. */
class Content_model extends Model
{
    protected $table = 'courses';
    protected $primary_key = 'id';
    private $db;

    public function __construct()
    {
        parent::__construct();
        $this->db = load_class('database', 'database')::instance(NULL);
    }

    public function publishedCourses()
    {
        return $this->db->raw(
            "SELECT c.id, c.title, c.slug, c.description, c.level, c.accent, u.name instructor,
                    (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) lesson_count
             FROM courses c JOIN users u ON u.id = c.instructor_id WHERE c.published = 1 ORDER BY c.created_at"
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function lessonBundle($lessonId, $userId)
    {
        $row = $this->db->raw(
            'SELECT l.id, l.title, l.content, l.estimated_minutes, m.title module_title, c.title course_title, c.id course_id
             FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ? LIMIT 1',
            [$lessonId]
        )->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;
        $row['skills'] = $this->db->raw('SELECT s.name FROM lesson_skills ls JOIN skills s ON s.id = ls.skill_id WHERE ls.lesson_id = ?', [$lessonId])->fetchAll(PDO::FETCH_COLUMN);
        $row['completed'] = (bool)$this->db->table('progress_records')
            ->select('id')
            ->where(['user_id' => $userId, 'lesson_id' => $lessonId])
            ->limit(1)
            ->get();
        return $row;
    }

    public function courseById($id)
    {
        return $this->db->table('courses')->where('id', $id)->limit(1)->get();
    }

    public function courseBySlug($slug)
    {
        return $this->db->table('courses')->where('slug', $slug)->limit(1)->get();
    }

    public function exercisesWithBest($userId)
    {
        return $this->db->raw(
            "SELECT e.id, e.title, e.prompt, e.language, e.starter_code, c.title course, s.name skill,
                    SUM(CASE WHEN t.hidden = 0 THEN 1 ELSE 0 END) visible_tests, COUNT(t.id) total_tests,
                    (SELECT MAX(er.passed_count) FROM execution_results er WHERE er.exercise_id = e.id AND er.user_id = ?) best_passed
             FROM coding_exercises e
             JOIN courses c ON c.id = e.course_id
             LEFT JOIN skills s ON s.id = e.skill_id
             LEFT JOIN test_cases t ON t.exercise_id = e.id
             GROUP BY e.id ORDER BY e.created_at",
            [$userId]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function exercise($id)
    {
        return $this->db->table('coding_exercises')->where('id', $id)->limit(1)->get();
    }

    public function testCases($exerciseId)
    {
        return $this->db->table('test_cases')
            ->select('input, expected, hidden')
            ->where('exercise_id', $exerciseId)
            ->order_by('position')
            ->get_all();
    }

    /** Rubric criteria keyed by course, with the first rubric as fallback. */
    public function rubricByCourse()
    {
        $rows = $this->db->raw(
            'SELECT r.course_id, r.title rubric_title, rc.id criterion_id, rc.label, rc.description, rc.max_points
             FROM rubrics r JOIN rubric_criteria rc ON rc.rubric_id = r.id ORDER BY rc.position'
        )->fetchAll(PDO::FETCH_ASSOC);
        $byCourse = [];
        $fallback = null;
        foreach ($rows as $r) {
            $byCourse[$r['course_id']] = $byCourse[$r['course_id']] ?? ['title' => $r['rubric_title'], 'criteria' => []];
            $byCourse[$r['course_id']]['criteria'][] = ['id' => $r['criterion_id'], 'label' => $r['label'], 'description' => $r['description'], 'maxPoints' => (int)$r['max_points']];
            if (!$fallback) $fallback = $byCourse[$r['course_id']];
        }
        return [$byCourse, $fallback];
    }
}
