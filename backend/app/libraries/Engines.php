<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** XP/levels, streaks, badges, in-app notifications. All writes go through prepared statements. */
class Gamify
{
    public function __construct(private $db) {}

    public function addXp($userId, $amount)
    {
        $this->db->table('users')->where('id', $userId)->increment('xp', $amount);
        $xp = (int)$this->db->table('users')->select('xp')->where('id', $userId)->get()['xp'];
        $level = (int)floor(sqrt($xp / 100)) + 1;
        $this->db->table('users')->where('id', $userId)->update(['level' => $level]);
        return ['xp' => $xp, 'level' => $level];
    }

    public function notify($userId, $type, $title, $body)
    {
        $this->db->raw('INSERT INTO notifications (id, user_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [uuid4(), $userId, $type, $title, $body]);
        $user = $this->db->raw('SELECT email, email_verified FROM users WHERE id = ? LIMIT 1', [$userId])->fetch(PDO::FETCH_ASSOC);
        if (!$user) throw new RuntimeException("Cannot deliver notification: user $userId was not found.");
        if ($user['email_verified'] && !MailService::send(
            $user['email'],
            $title,
            '<div style="font-family:system-ui;color:#12142b"><h2>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') .
            '</h2><p>' . nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8')) . '</p><p>— EduSphere</p></div>'
        )) {
            error_log("Notification email delivery failed for user $userId.");
        }
    }

    public function award($userId, $code): ?array
    {
        $badge = $this->db->table('badges')->where('code', $code)->limit(1)->get();
        if (!$badge) return null;
        $own = $this->db->table('user_badges')
            ->select('id')
            ->where(['user_id' => $userId, 'badge_id' => $badge['id']])
            ->limit(1)
            ->get();
        if ($own) return null;
        $this->db->raw('INSERT INTO user_badges (id, user_id, badge_id, awarded_at) VALUES (?, ?, ?, NOW())', [uuid4(), $userId, $badge['id']]);
        if ((int)$badge['xp_reward'] > 0) $this->addXp($userId, (int)$badge['xp_reward']);
        $this->notify($userId, 'badge', "Badge earned: {$badge['name']}", $badge['description']);
        return $badge;
    }

    public function touchStreak($userId)
    {
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $row = $this->db->table('streaks')->where('user_id', $userId)->limit(1)->get();
        if (!$row) {
            $this->db->raw('INSERT INTO streaks (id, user_id, current, longest, last_activity_date) VALUES (?, ?, 1, 1, ?)', [uuid4(), $userId, $today]);
            return ['current' => 1, 'longest' => 1];
        }
        if ($row['last_activity_date'] === $today) return ['current' => (int)$row['current'], 'longest' => (int)$row['longest']];
        $current = $row['last_activity_date'] === $yesterday ? (int)$row['current'] + 1 : 1;
        $longest = max($current, (int)$row['longest']);
        $this->db->table('streaks')
            ->where('user_id', $userId)
            ->update(['current' => $current, 'longest' => $longest, 'last_activity_date' => $today]);
        if ($current >= 3) $this->award($userId, 'streak-3');
        if ($current >= 7) $this->award($userId, 'streak-7');
        return ['current' => $current, 'longest' => $longest];
    }
}

/**
 * Rule-based path engine. Same contract as the reference implementation:
 * gap score per lesson = average mastery deficit across tagged skills, weakest-first;
 * unlock aperture from trailing-14-day lesson velocity.
 */
class PathEngine
{
    public function __construct(private $db, private Gamify $gamify) {}

    private function mastery($userId): array
    {
        $rows = $this->db->raw(
            'SELECT s.skill_id, s.score FROM student_skill_scores s
             JOIN (SELECT skill_id, MAX(measured_at) m FROM student_skill_scores WHERE user_id = ? GROUP BY skill_id) latest
               ON latest.skill_id = s.skill_id AND latest.m = s.measured_at WHERE s.user_id = ?',
            [$userId, $userId]
        )->fetchAll(PDO::FETCH_ASSOC);
        $map = [];
        foreach ($rows as $r) $map[$r['skill_id']] = (float)$r['score'];
        return $map;
    }

    private function velocity($userId): float
    {
        $n = (int)$this->db->raw(
            'SELECT COUNT(*) c FROM progress_records WHERE user_id = ? AND completed_at > DATE_SUB(NOW(), INTERVAL 14 DAY)',
            [$userId]
        )->fetch(PDO::FETCH_ASSOC)['c'];
        return max(0.1, $n / 14);
    }

    public function generate($userId, $regenerate): array
    {
        $mastery = $this->mastery($userId);
        $existing = $this->db->table('learning_paths')
            ->where(['user_id' => $userId, 'status' => 'active'])
            ->limit(1)
            ->get();
        if ($existing && !$regenerate) return ['path_id' => $existing['id'], 'created' => false];

        $course = $existing
            ? $this->db->table('courses')->where('id', $existing['course_id'])->limit(1)->get()
            : $this->db->table('courses')->where('slug', 'js-foundations')->limit(1)->get();
        if (!$course) fail_api('No course available to build a path from.', 500);
        $courseId = $course['id'];

        $doneIds = [];
        $pathId = null;
        if ($existing) {
            $pathId = $existing['id'];
            $done = $this->db->table('learning_path_items')
                ->select('lesson_id')
                ->where(['path_id' => $pathId, 'status' => 'done'])
                ->get_all(PDO::FETCH_COLUMN);
            $doneIds = array_flip($done);
            $this->db->table('learning_path_items')
                ->where('path_id', $pathId)
                ->where('status', '!=', 'done')
                ->delete();
        } else {
            $pathId = uuid4();
            $this->db->raw('INSERT INTO learning_paths (id, user_id, course_id, status, generated_at) VALUES (?, ?, ?, \'active\', NOW())', [$pathId, $userId, $courseId]);
        }

        $rows = $this->db->raw(
            'SELECT l.id lid, l.title, l.position, m.position mod_pos, ls.skill_id, s.name skill_name
             FROM lessons l JOIN modules m ON m.id = l.module_id
             LEFT JOIN lesson_skills ls ON ls.lesson_id = l.id
             LEFT JOIN skills s ON s.id = ls.skill_id
             WHERE m.course_id = ? ORDER BY m.position, l.position',
            [$courseId]
        )->fetchAll(PDO::FETCH_ASSOC);

        $byLesson = [];
        foreach ($rows as $r) {
            $byLesson[$r['lid']] = $byLesson[$r['lid']] ?? ['title' => $r['title'], 'pos' => (int)$r['position'], 'modPos' => (int)$r['mod_pos'], 'skills' => []];
            if ($r['skill_id']) $byLesson[$r['lid']]['skills'][] = ['id' => $r['skill_id'], 'name' => $r['skill_name']];
        }
        $open = [];
        foreach ($byLesson as $lid => $l) {
            if (isset($doneIds[$lid])) continue;
            $gap = count($l['skills']) === 0 ? 50.0
                : array_sum(array_map(fn($sk) => 100 - ($mastery[$sk['id']] ?? 0), $l['skills'])) / count($l['skills']);
            $open[] = array_merge(['id' => $lid], $l, ['gap' => $gap]);
        }
        usort($open, fn($a, $b) => $b['gap'] <=> $a['gap'] ?: $a['modPos'] <=> $b['modPos'] ?: $a['pos'] <=> $b['pos']);

        if (count($open) === 0) {
            $this->db->raw("UPDATE learning_paths SET status = 'completed', completed_at = NOW() WHERE id = ?", [$pathId]);
            return ['path_id' => $pathId, 'created' => false];
        }

        $velocity = $this->velocity($userId);
        $unlock = max(1, min(4, (int)round($velocity * 4)));
        $doneCount = count($doneIds);
        foreach ($open as $i => $o) {
            $this->db->raw(
                'INSERT INTO learning_path_items (id, path_id, lesson_id, position, status) VALUES (?, ?, ?, ?, ?)',
                [uuid4(), $pathId, $o['id'], $doneCount + $i, $i < $unlock ? 'current' : 'locked']
            );
        }

        $skillNames = [];
        foreach ($byLesson as $l) foreach ($l['skills'] as $sk) $skillNames[$sk['id']] = $sk['name'];
        $weak = $mastery;
        asort($weak);
        $weakNames = [];
        foreach (array_slice($weak, 0, 4, true) as $id => $v) if ($v < 60) $weakNames[] = ($skillNames[$id] ?? 'Unrated skill') . ' at ' . round($v) . '%';
        $firstTitles = array_map(fn($o) => '"' . $o['title'] . '"', array_slice($open, 0, 3));
        $rationale = count($mastery) === 0
            ? "No placement scores yet, so the path follows the course order. At your recent pace of " . number_format($velocity, 1) . " lessons/day, $unlock item" . ($unlock > 1 ? 's are' : ' is') . ' open at a time. Finish the placement and it re-sequences around your gaps.'
            : 'Your weakest measured skills: ' . (count($weakNames) ? implode(', ', $weakNames) : 'none below 60%') . '. The path re-sequences the course so ' . implode(', ', $firstTitles) . ' come first and keeps anything you already finished. At your recent pace of ' . number_format($velocity, 1) . " lessons/day, $unlock item" . ($unlock > 1 ? 's are' : ' is') . ' open at a time.';

        $this->db->table('learning_paths')
            ->where('id', $pathId)
            ->update(['velocity' => number_format($velocity, 2, '.', ''), 'rationale' => $rationale]);
        if (!$existing) $this->gamify->notify($userId, 'path', 'Your learning path is ready', count($open) . ' lessons sequenced around your placement gaps.');
        return ['path_id' => $pathId, 'created' => !$existing];
    }

    /** Complete an item, promote the next locked one, close + certify when empty. */
    public function completeItem($itemId, $userId): array
    {
        $item = $this->db->table('learning_path_items')->where('id', $itemId)->limit(1)->get();
        if (!$item) return ['error' => 'Path item not found.', 'status' => 404];
        $path = $this->db->table('learning_paths')->where('id', $item['path_id'])->limit(1)->get();
        if (!$path || $path['user_id'] !== $userId) return ['error' => 'Path item not found.', 'status' => 404];
        if ($item['status'] === 'done') return ['error' => 'Already completed.', 'status' => 409];
        if ($item['status'] === 'locked') return ['error' => 'This lesson unlocks after you finish the open ones.', 'status' => 409];

        $this->db->raw("UPDATE learning_path_items SET status = 'done', completed_at = NOW() WHERE id = ?", [$item['id']]);
        $remaining = $this->db->table('learning_path_items')
            ->where('path_id', $path['id'])
            ->in('status', ['current', 'locked'])
            ->order_by('position')
            ->get_all();

        if (count($remaining) === 0) {
            $this->db->raw("UPDATE learning_paths SET status = 'completed', completed_at = NOW() WHERE id = ?", [$path['id']]);
            $code = 'EDU-' . strtoupper(bin2hex(random_bytes(2))) . '-' . strtoupper(bin2hex(random_bytes(2)));
            $this->db->raw('INSERT INTO certificates (id, user_id, course_id, code, issued_at) VALUES (?, ?, ?, ?, NOW())', [uuid4(), $userId, $path['course_id'], $code]);
            $this->gamify->notify($userId, 'certificate', 'Certificate issued', "Course complete. Certificate $code is live at /verify/$code.");
            return ['ok' => true, 'completed' => true, 'certificate_code' => $code];
        }
        $slots = max(1, min(4, (int)round((float)$path['velocity'] * 4)));
        $openNow = count(array_filter($remaining, fn($r) => $r['status'] === 'current'));
        if ($openNow < $slots) {
            $next = current(array_filter($remaining, fn($r) => $r['status'] === 'locked'));
            if ($next) $this->db->table('learning_path_items')->where('id', $next['id'])->update(['status' => 'current']);
        }
        return ['ok' => true, 'completed' => false];
    }
}

/** Anonymous, balanced peer assignment: never self, never duplicate, least-loaded first. */
class PeerAssigner
{
    public function __construct(private $db, private Gamify $gamify) {}

    public function assign($submissionId, $authorId, $n = 3): int
    {
        $candidates = $this->db->raw(
            "SELECT u.id, (SELECT COUNT(*) FROM peer_assignments pa WHERE pa.reviewer_id = u.id) load
             FROM users u WHERE u.role = 'student' AND u.active = 1 AND u.id != ?
             ORDER BY load ASC, RAND() LIMIT " . intval($n + 2),
            [$authorId]
        )->fetchAll(PDO::FETCH_ASSOC);
        $assigned = 0;
        foreach ($candidates as $c) {
            if ($assigned >= $n) break;
            try {
                $this->db->raw(
                    'INSERT INTO peer_assignments (id, submission_id, reviewer_id, status, assigned_at) VALUES (?, ?, ?, \'pending\', NOW())',
                    [uuid4(), $submissionId, $c['id']]
                );
                $assigned++;
                $this->gamify->notify($c['id'], 'review_assigned', 'A peer submission is waiting for your review', 'It was added to your review queue. The author stays anonymous.');
            } catch (Exception $e) { /* duplicate pair — skip candidate */ }
        }
        if ($assigned > 0) $this->db->table('submissions')->where('id', $submissionId)->update(['status' => 'reviewing']);
        return $assigned;
    }
}
