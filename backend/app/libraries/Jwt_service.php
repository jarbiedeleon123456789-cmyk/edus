<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Access (15 min) + refresh (30 d) token pairs. Refresh tokens are single-use:
 * the server stores only sha256(jti), and revokes it on rotation.
 * Uses jwt_sign/jwt_verify from helpers/api_helper.php.
 */
class Jwt_service
{
    // LavaLust Database instance (raw() with bound params), not a raw PDO handle.
    private $db;

    public function __construct($db)
    {
        $this->db = $db;
    }

    public function issue(array $user): array
    {
        $access = jwt_sign(['sub' => $user['id'], 'role' => $user['role'], 'typ' => 'access', 'jti' => bin2hex(random_bytes(8))], 900);
        $jti = uuid4();
        $refresh = jwt_sign(['sub' => $user['id'], 'typ' => 'refresh', 'jti' => $jti], 30 * 86400);
        $this->db->raw(
            'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())',
            [uuid4(), $user['id'], hash('sha256', $jti)]
        );
        return ['access' => $access, 'refresh' => $refresh];
    }

    /** Rotate: verify + hash-match + revoke old, then issue a fresh pair. Null = reuse/expired. */
    public function rotate(string $token): ?array
    {
        $payload = jwt_verify($token);
        if (!$payload || ($payload['typ'] ?? '') !== 'refresh') return null;
        $stmt = $this->db->raw(
            'SELECT id FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1',
            [$payload['sub'], hash('sha256', $payload['jti'])]
        );
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;
        $this->db->raw('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [$row['id']]);
        $user = $this->db->table('users')
            ->where(['id' => $payload['sub'], 'active' => 1, 'email_verified' => 1])
            ->limit(1)
            ->get();
        if (!$user) return null;
        return ['user' => $user] + $this->issue($user);
    }

    public function revoke(string $token): void
    {
        $payload = jwt_verify($token);
        if (!$payload || empty($payload['jti'])) return;
        $this->db->raw(
            'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = ?',
            [$payload['sub'], hash('sha256', $payload['jti'])]
        );
    }
}
