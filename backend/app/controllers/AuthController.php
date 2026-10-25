<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
class AuthController extends MY_Controller
{
    private $db;
    private $users;
    private $jwt;
    private $gamify;

    public function __construct()
    {
        parent::__construct();
        $this->call->library('Jwt_service');
        $this->call->library('Clients'); // MailService
        $this->call->library('Engines'); // Gamify
        $this->db = $this->call->database();
        $this->users = $this->call->model('User_model');
        $this->jwt = new Jwt_service($this->db);
        $this->gamify = new Gamify($this->db);
    }

    public function index()
    {
        respond(['service' => 'edusphere-api', 'docs' => '/api/v1/health'], 'EduSphere API. JSON only.');
    }

    public function health()
    {
        try {
            $this->db->raw('SELECT 1');
            respond(['service' => 'edusphere', 'version' => 'v1', 'db' => 'up'], 'Healthy.');
        } catch (Exception $e) {
            fail_api('Database unreachable.', 503);
        }
    }

    public function register()
    {
        $ip = $this->request->ip_address() ?: 'local';
        if (rate_limited($this->db, "register:$ip", 10, 600)) fail_api('Too many sign-up attempts. Try again in a few minutes.', 429);

        $b = json_body();
        $name = trim((string)($b['name'] ?? ''));
        $email = strtolower(trim((string)($b['email'] ?? '')));
        $password = (string)($b['password'] ?? '');
        if (strlen($name) < 2) fail_api('Name needs at least 2 characters.', 422, ['name' => 'Too short.']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail_api("That email doesn't look valid.", 422, ['email' => 'Invalid.']);
        if (strlen($password) < 8) fail_api('Use at least 8 characters.', 422, ['password' => 'Too short.']);
        if (!MailService::configured()) fail_api('Email verification is unavailable until the email service is configured.', 503);

        if ($this->users->byEmail($email)) {
            fail_api('An account with this email already exists.', 409, ['email' => 'Already registered — try signing in.']);
        }

        $id = uuid4();
        $this->users->createStudent($id, $name, $email, password_hash($password, PASSWORD_BCRYPT));
        if (!$this->send_verification_code($id, $email)) {
            $this->db->raw('DELETE FROM users WHERE id = ?', [$id]);
            fail_api("We couldn't send a verification email. Check the email service configuration and try again.", 503);
        }
        respond(['email' => $email], 'Check your email for a verification code.', 201);
    }

    public function login()
    {
        $ip = $this->request->ip_address() ?: 'local';
        if (rate_limited($this->db, "login:$ip", 10, 300)) fail_api('Too many sign-in attempts. Try again in 5 minutes.', 429);

        $b = json_body();
        $email = strtolower(trim((string)($b['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail_api('Enter a valid email.', 422, ['email' => 'Enter a valid email.']);
        $user = $this->users->byEmail($email);
        if (!$user || !password_verify((string)($b['password'] ?? ''), $user['password_hash']) || !$user['active']) {
            fail_api('Wrong email or password.', 401);
        }
        if (empty($user['email_verified'])) fail_api('Verify your email before signing in. Request a new verification code to continue.', 403);
        respond(['user' => public_user($user)] + $this->jwt->issue($user), 'Signed in.');
    }

    public function verify_email()
    {
        if (rate_limited($this->db, 'verify-email:' . ($this->request->ip_address() ?: 'local'), 10, 600)) {
            fail_api('Too many verification attempts. Try again later.', 429);
        }

        $b = json_body();
        $email = strtolower(trim((string)($b['email'] ?? '')));
        $code = (string)($b['code'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail_api('Enter a valid email.', 422, ['email' => 'Enter a valid email.']);
        if (!preg_match('/^\d{8}$/', $code)) fail_api('Enter the 8-digit code from your email.', 422, ['code' => 'Enter the 8-digit code.']);

        $user = $this->users->byEmail($email);
        if (!$user || !empty($user['email_verified']) || !$user['active']) {
            fail_api('The verification code is invalid or expired.', 422, ['code' => 'Request a new code and try again.']);
        }
        $record = $this->db->raw(
            'SELECT id FROM email_verifications WHERE user_id = ? AND code_hash = ? AND expires_at > NOW() LIMIT 1',
            [$user['id'], hash('sha256', $code)]
        )->fetch(PDO::FETCH_ASSOC);
        if (!$record) fail_api('The verification code is invalid or expired.', 422, ['code' => 'Request a new code and try again.']);

        $this->db->raw('UPDATE users SET email_verified = 1 WHERE id = ?', [$user['id']]);
        $this->db->raw('DELETE FROM email_verifications WHERE id = ?', [$record['id']]);
        $user = $this->users->byId($user['id']);
        $this->gamify->notify(
            $user['id'], 'welcome',
            "You're in, " . explode(' ', $user['name'])[0] . '.',
            'Start with the placement assessment — 10 questions, about 5 minutes. Your learning path is built from the result.'
        );
        respond(['user' => public_user($user)] + $this->jwt->issue($user), 'Email verified. Your account is ready.');
    }

    public function resend_verification()
    {
        if (rate_limited($this->db, 'resend-verification:' . ($this->request->ip_address() ?: 'local'), 5, 600)) {
            fail_api('Too many requests. Try again later.', 429);
        }
        $b = json_body();
        $email = strtolower(trim((string)($b['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail_api('Enter a valid email.', 422, ['email' => 'Enter a valid email.']);
        $user = $this->users->byEmail($email);
        if (!$user || !empty($user['email_verified']) || !$user['active']) {
            respond(null, 'If that account needs verification, a new code has been sent.');
        }
        if (!$this->send_verification_code($user['id'], $email)) {
            fail_api("We couldn't send the verification email. Check the email service configuration and try again.", 503);
        }
        respond(null, 'If that account needs verification, a new code has been sent.');
    }

    public function profile_update()
    {
        $user = auth_user($this->db);
        $b = json_body();
        $bio = trim((string)($b['bio'] ?? ''));
        $avatar = (string)($b['avatar'] ?? '');
        if (mb_strlen($bio) > 180) fail_api('Bio must be 180 characters or fewer.', 422, ['bio' => 'Bio must be 180 characters or fewer.']);
        $valid_avatar = str_starts_with($avatar, 'data:image/svg+xml;charset=utf-8,')
            || preg_match('/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+\/]+={0,2}$/', $avatar);
        if (strlen($avatar) > 1500000 || !$valid_avatar) {
            fail_api('Upload a PNG, JPEG, WEBP, or GIF image smaller than 1 MB.', 422, ['avatar' => 'Invalid image.']);
        }
        $updated = $this->users->updateProfile($user['id'], $bio, $avatar);
        respond(['user' => public_user($updated)], 'Profile saved.');
    }

    public function refresh()
    {
        $b = json_body();
        $rotated = $this->jwt->rotate((string)($b['refresh'] ?? ''));
        if (!$rotated) fail_api('Session expired. Sign in again.', 401);
        respond(['user' => public_user($rotated['user']), 'access' => $rotated['access'], 'refresh' => $rotated['refresh']], 'Session renewed.');
    }

    public function logout()
    {
        $b = json_body();
        if (!empty($b['refresh'])) $this->jwt->revoke((string)$b['refresh']);
        respond(null, 'Signed out.');
    }

    public function me()
    {
        $user = auth_user($this->db);
        $streak = $this->users->streakOf($user['id']);
        respond([
            'user' => public_user($user),
            'streak' => ['current' => (int)($streak['current'] ?? 0), 'longest' => (int)($streak['longest'] ?? 0)],
            'unreadNotifications' => $this->users->unreadCount($user['id']),
        ]);
    }

    private function send_verification_code(string $user_id, string $email): bool
    {
        $code = (string)random_int(10000000, 99999999);
        $this->db->raw(
            'INSERT INTO email_verifications (id, user_id, code_hash, expires_at, created_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW())
             ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), created_at = NOW()',
            [uuid4(), $user_id, hash('sha256', $code)]
        );
        $html = '<div style="font-family:system-ui;color:#12142b"><h2>Verify your EduSphere email</h2>' .
            '<p>Enter this verification code to finish creating your account:</p>' .
            '<p style="font-size:28px;font-weight:700;letter-spacing:0.2em">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</p>' .
            '<p>This code expires in 15 minutes. If you did not request it, ignore this email.</p></div>';
        if (MailService::send($email, 'Your EduSphere verification code', $html)) return true;

        $this->db->raw('DELETE FROM email_verifications WHERE user_id = ?', [$user_id]);
        return false;
    }
}
