<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Analytics aggregates + credentials + sessions + notifications + commerce/files. */
class Meta_model extends Model
{
    protected $table = 'notifications';
    protected $primary_key = 'id';
    private $db;

    public function __construct()
    {
        parent::__construct();
        $this->db = load_class('database', 'database')::instance(NULL);
    }

    // ---- analytics ----

    public function studentAnalytics($user)
    {
        $mastery = $this->db->raw(
            'SELECT s.name skill, ROUND(sc.score) score FROM student_skill_scores sc
             JOIN skills s ON s.id = sc.skill_id
             JOIN (SELECT skill_id, MAX(measured_at) m FROM student_skill_scores WHERE user_id = ? GROUP BY skill_id) l
               ON l.skill_id = sc.skill_id AND l.m = sc.measured_at WHERE sc.user_id = ?',
            [$user['id'], $user['id']]
        )->fetchAll(PDO::FETCH_ASSOC);
        $lessons = $this->db->raw('SELECT COUNT(*) c, COALESCE(SUM(time_spent_sec),0)/60 m FROM progress_records WHERE user_id = ?', [$user['id']])->fetch(PDO::FETCH_ASSOC);
        $path = $this->db->raw(
            "SELECT COUNT(*) total, SUM(status = 'done') done FROM learning_path_items pi JOIN learning_paths p ON p.id = pi.path_id WHERE p.user_id = ? AND p.status = 'active'",
            [$user['id']]
        )->fetch(PDO::FETCH_ASSOC);

        $xp = (int)$user['xp'];
        $level = (int)floor(sqrt($xp / 100)) + 1;
        return [
            'mastery' => $mastery,
            'lessonsDone' => (int)$lessons['c'], 'minutesSpent' => (int)$lessons['m'],
            'path' => ['done' => (int)$path['done'], 'total' => (int)$path['total']],
            'runs' => (int)$this->db->table('execution_results')->where('user_id', $user['id'])->count(),
            'badgesCount' => (int)$this->db->table('user_badges')->where('user_id', $user['id'])->count(),
            'reviewsGiven' => (int)$this->db->table('peer_assignments')
                ->where(['reviewer_id' => $user['id'], 'status' => 'submitted'])
                ->count(),
            'xp' => $xp, 'level' => $level, 'nextLevelXp' => $level * $level * 100,
        ];
    }

    public function activitySeries($userId)
    {
        $lessons = $this->db->raw('SELECT DATE(completed_at) d, COUNT(*) c FROM progress_records WHERE user_id = ? AND completed_at > DATE_SUB(NOW(), INTERVAL 28 DAY) GROUP BY d', [$userId])->fetchAll(PDO::FETCH_KEY_PAIR);
        $runs = $this->db->raw('SELECT DATE(created_at) d, COUNT(*) c FROM execution_results WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 28 DAY) GROUP BY d', [$userId])->fetchAll(PDO::FETCH_KEY_PAIR);
        $days = [];
        for ($i = 27; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i day"));
            $days[] = ['date' => $d, 'lessons' => (int)($lessons[$d] ?? 0), 'runs' => (int)($runs[$d] ?? 0)];
        }
        return $days;
    }

    public function instructorAggregate()
    {
        return [
            'students' => $this->db->raw(
                "SELECT u.id, u.name, u.xp, u.level,
                        (SELECT COUNT(*) FROM progress_records pr WHERE pr.user_id = u.id) lessons,
                        (SELECT COUNT(*) FROM peer_assignments pa WHERE pa.reviewer_id = u.id AND pa.status = 'submitted') reviews_done,
                        (SELECT COUNT(*) FROM peer_assignments pa WHERE pa.reviewer_id = u.id AND pa.status = 'pending') reviews_pending,
                        COALESCE((SELECT s.current FROM streaks s WHERE s.user_id = u.id), 0) streak,
                        (SELECT ROUND(AVG(m.score)) FROM (
                            SELECT sc.skill_id, sc.score FROM student_skill_scores sc
                            JOIN (SELECT skill_id, MAX(measured_at) mx FROM student_skill_scores WHERE user_id = u.id GROUP BY skill_id) l
                              ON l.skill_id = sc.skill_id AND l.mx = sc.measured_at WHERE sc.user_id = u.id) m) avg_mastery
                 FROM users u WHERE u.role = 'student' ORDER BY u.xp DESC"
            )->fetchAll(PDO::FETCH_ASSOC),
            'classMastery' => $this->db->raw(
                "SELECT s.name skill, ROUND(AVG(sc.score)) avg_score FROM student_skill_scores sc
                 JOIN (SELECT user_id, skill_id, MAX(measured_at) m FROM student_skill_scores GROUP BY user_id, skill_id) l
                   ON l.user_id = sc.user_id AND l.skill_id = sc.skill_id AND l.m = sc.measured_at
                 JOIN skills s ON s.id = sc.skill_id GROUP BY s.name"
            )->fetchAll(PDO::FETCH_ASSOC),
            'reviewQueue' => $this->db->table('submissions')
                ->select('status')
                ->select_count('id', 'count')
                ->where('kind', 'assignment')
                ->group_by('status')
                ->get_all(),
        ];
    }

    // ---- credentials ----

    public function earnedBadges($userId)
    {
        return $this->db->raw('SELECT b.*, ub.awarded_at FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? ORDER BY ub.awarded_at DESC', [$userId])->fetchAll(PDO::FETCH_ASSOC);
    }

    public function allBadges()
    {
        return $this->db->table('badges')
            ->select('code, name, description, icon, accent')
            ->get_all();
    }

    public function certificatesOf($userId)
    {
        return $this->db->raw('SELECT c.code, c.issued_at, co.title course FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.user_id = ? ORDER BY c.issued_at DESC', [$userId])->fetchAll(PDO::FETCH_ASSOC);
    }

    public function credentialByCode($code)
    {
        return $this->db->raw(
            'SELECT c.code, c.issued_at, u.name holder, co.title course, co.level FROM certificates c
             JOIN users u ON u.id = c.user_id JOIN courses co ON co.id = c.course_id WHERE c.code = ? LIMIT 1',
            [$code]
        )->fetch(PDO::FETCH_ASSOC);
    }

    // ---- sessions ----

    public function upcomingSessions()
    {
        return $this->db->raw(
            'SELECT ls.id, ls.title, ls.starts_at, ls.duration_min, ls.join_url, c.title course, u.name host
             FROM live_sessions ls JOIN courses c ON c.id = ls.course_id JOIN users u ON u.id = ls.host_id
             WHERE ls.starts_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) ORDER BY ls.starts_at'
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function insertSession($id, $courseId, $hostId, $title, $startsAt, $durationMin, $room)
    {
        $this->db->raw(
            'INSERT INTO live_sessions (id, course_id, host_id, title, starts_at, duration_min, room_code, join_url, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [$id, $courseId, $hostId, $title, $startsAt, $durationMin, $room, "https://meet.jit.si/$room"]
        );
    }

    public function courseExists($id)
    {
        return (bool)$this->db->table('courses')->select('id')->where('id', $id)->limit(1)->get();
    }

    // ---- notifications ----

    public function notificationsOf($userId)
    {
        return $this->db->table('notifications')
            ->where('user_id', $userId)
            ->order_by('created_at', 'DESC')
            ->limit(30)
            ->get_all();
    }

    public function markAllRead($userId)
    {
        $this->db->raw('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [$userId]);
    }

    // ---- commerce / files ----

    public function insertPayment($userId, $cents, $status = 'demo', $stripeSessionId = null)
    {
        $this->db->raw(
            "INSERT INTO payments (id, user_id, amount_cents, currency, status, stripe_session_id, created_at) VALUES (?, ?, ?, 'usd', ?, ?, NOW())",
            [uuid4(), $userId, $cents, $status, $stripeSessionId]
        );
    }

    public function insertFile($userId, $key, $bytes, $type)
    {
        $this->db->raw('INSERT INTO files (id, user_id, `key`, bytes, content_type, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [uuid4(), $userId, $key, $bytes, $type]);
    }
}
