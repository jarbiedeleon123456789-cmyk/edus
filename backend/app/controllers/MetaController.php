<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
class MetaController extends MY_Controller
{
    private $db;
    private $users;
    private $meta;

    public function __construct()
    {
        parent::__construct();
        $this->call->library('Clients');
        $this->db = $this->call->database();
        $this->users = $this->call->model('User_model');
        $this->meta = $this->call->model('Meta_model');
    }

    // ---------- analytics ----------

    public function analytics_student()
    {
        $user = require_role($this->db, ['student']);
        $data = $this->meta->studentAnalytics($user);
        $streak = $this->users->streakOf($user['id']);
        $vel = $this->db->table('learning_paths')
            ->select('velocity')
            ->where(['user_id' => $user['id'], 'status' => 'active'])
            ->limit(1)
            ->get();
        respond($data + [
            'streak' => ['current' => (int)($streak['current'] ?? 0), 'longest' => (int)($streak['longest'] ?? 0)],
            'velocity' => (float)($vel['velocity'] ?? 0),
            'activity' => $this->meta->activitySeries($user['id']),
        ]);
    }

    public function analytics_instructor()
    {
        require_role($this->db, ['instructor', 'admin']);
        respond($this->meta->instructorAggregate());
    }

    public function leaderboard()
    {
        auth_user($this->db);
        respond(['rows' => $this->users->leaderboard()]);
    }

    // ---------- credentials ----------

    public function badges()
    {
        $user = auth_user($this->db);
        $earned = $this->meta->earnedBadges($user['id']);
        $owned = array_column($earned, 'code');
        respond([
            'earned' => $earned,
            'upcoming' => array_values(array_filter($this->meta->allBadges(), fn($b) => !in_array($b['code'], $owned, true))),
        ]);
    }

    public function certificates()
    {
        $user = auth_user($this->db);
        respond($this->meta->certificatesOf($user['id']));
    }

    /** Public — no auth. This is what the link on a certificate points to. */
    public function verify($code)
    {
        $row = $this->meta->credentialByCode(strtoupper(trim((string)$code)));
        if (!$row) fail_api('No credential matches this code. Check the letters and try again.', 404);
        respond($row + ['valid' => true], 'Credential verified.');
    }

    // ---------- sessions / notifications ----------

    public function sessions()
    {
        auth_user($this->db);
        respond($this->meta->upcomingSessions());
    }

    /** Join links use Jitsi open rooms — no account or key needed. */
    public function session_create()
    {
        $user = require_role($this->db, ['instructor', 'admin']);
        $b = json_body();
        $title = trim((string)($b['title'] ?? ''));
        $startsAt = (string)($b['startsAt'] ?? '');
        if (strlen($title) < 4 || empty($b['courseId']) || !$startsAt) fail_api('Missing course, title, or start time.', 422);
        if (!$this->meta->courseExists($b['courseId'])) fail_api('Course not found.', 404);

        $room = 'edusphere-' . bin2hex(random_bytes(4));
        $id = uuid4();
        $this->meta->insertSession($id, $b['courseId'], $user['id'], $title,
            date('Y-m-d H:i:s', strtotime($startsAt)), max(15, min(240, (int)($b['durationMin'] ?? 60))), $room);
        respond(['id' => $id, 'roomCode' => $room], 'Session scheduled.', 201);
    }

    public function notifications()
    {
        $user = auth_user($this->db);
        $rows = $this->meta->notificationsOf($user['id']);
        respond(['rows' => $rows, 'unread' => count(array_filter($rows, fn($r) => !$r['read_at']))]);
    }

    public function notifications_read()
    {
        $user = auth_user($this->db);
        $this->meta->markAllRead($user['id']);
        respond(null, 'Marked as read.');
    }

    // ---------- commerce / storage / admin ----------

    public function checkout()
    {
        $user = auth_user($this->db);
        $plan = json_body()['plan'] ?? '';
        if (!in_array($plan, ['pro', 'team'], true)) fail_api('Unknown plan.', 422);
        $requestUrl = parse_url($this->request->url());
        $scheme = $requestUrl['scheme'] ?? 'http';
        $host = $requestUrl['host'] ?? 'localhost';
        $port = isset($requestUrl['port']) ? ':' . $requestUrl['port'] : '';
        $baseUrl = "$scheme://$host$port";
        respond(StripeService::checkout($this->db, $user['id'], $plan, $baseUrl),
            getenv('STRIPE_SECRET_KEY') ? 'Redirecting to Stripe.' : 'Demo checkout — payment recorded as test.');
    }

    public function webhook()
    {
        $secret = getenv('STRIPE_WEBHOOK_SECRET');
        if (!$secret) respond(['mode' => 'demo'], 'Webhook received (demo mode).');

        $raw = $this->request->raw_body();
        [$t, $v1] = ['', ''];
        foreach (explode(',', $this->request->header('Stripe-Signature') ?? '') as $part) {
            if (str_starts_with($part, 't=')) $t = substr($part, 2);
            if (str_starts_with($part, 'v1=')) $v1 = substr($part, 3);
        }
        if (!$v1 || !hash_equals(hash_hmac('sha256', "$t.$raw", $secret), $v1)) fail_api('Bad signature.', 400);
        $event = json_decode($raw, true);
        $meta = $event['data']['object']['metadata'] ?? [];
        if (($event['type'] ?? '') === 'checkout.session.completed' && !empty($meta['userId'])) {
            $this->meta->insertPayment($meta['userId'], (int)($event['data']['object']['amount_total'] ?? 0), 'paid', $event['data']['object']['id'] ?? null);
        }
        respond(['mode' => 'live'], 'Processed.');
    }

    public function presign()
    {
        $user = auth_user($this->db);
        $b = json_body();
        $type = (string)($b['contentType'] ?? '');
        $allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];
        if (!in_array($type, $allowed, true)) respond(['accepted' => false, 'reason' => "$type isn't accepted. Use PNG, JPEG, WebP, PDF, or text."], 'Type rejected.');
        if ((int)($b['bytes'] ?? 0) > 25 * 1024 * 1024) fail_api('Files are capped at 25 MB.', 422);

        $key = 'u/' . substr($user['id'], 0, 8) . '/' . time() . '-' . preg_replace('/[^a-z0-9.\-_]/i', '_', (string)($b['name'] ?? 'file'));
        $this->meta->insertFile($user['id'], $key, (int)($b['bytes'] ?? 0), $type);
        $url = StorageService::presign($key, $type);
        respond(['accepted' => true, 'key' => $key, 'url' => $url, 'demo' => $url === null],
            $url === null ? "File registered. Object storage isn't configured in this demo, so nothing was uploaded." : 'Upload URL ready.');
    }

    public function admin_users()
    {
        require_role($this->db, ['admin']);
        respond($this->users->adminLists());
    }

    public function admin_user_update()
    {
        $admin = require_role($this->db, ['admin']);
        $b = json_body();
        if (empty($b['id'])) fail_api('Missing user id.', 422);
        if ($b['id'] === $admin['id'] && empty($b['active'])) fail_api("You can't deactivate your own account.", 409);
        $this->users->setActive($b['id'], !empty($b['active']));
        respond(null, !empty($b['active']) ? 'Account reactivated.' : 'Account deactivated.');
    }
}
