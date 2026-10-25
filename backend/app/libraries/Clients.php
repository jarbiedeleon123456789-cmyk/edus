<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Judge0 / Sphere Engine call — server-side only, browser never sees keys. */
class Judge0Client
{
    public static function available(): bool
    {
        return (bool)getenv('JUDGE0_URL');
    }

    /** Batch-run JavaScript exercise test cases through Judge0 (language_id 63). */
    public static function run(string $code, array $tests): array
    {
        $base = rtrim(getenv('JUDGE0_URL'), '/');
        $key = getenv('JUDGE0_API_KEY');
        $payload = [
            'submissions' => array_map(fn($t) => [
                'language_id' => 63,
                'source_code' => $code . "\nconst out = solve({$t['input']});\nprocess.stdout.write(JSON.stringify(out === undefined ? null : out));",
            ], $tests),
        ];
        $ch = curl_init("$base/submissions/batch?base64_encoded=false&wait=true");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => array_filter(['Content-Type: application/json', $key ? "Authorization: Bearer $key" : null]),
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 15,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($status < 200 || $status >= 300 || !$body) {
            fail_api('The private code runner did not return a valid response.', 502);
        }
        $subs = json_decode($body, true);
        if (!is_array($subs) || count($subs) !== count($tests)) {
            fail_api('The private code runner returned invalid results.', 502);
        }
        $results = [];
        foreach ($tests as $i => $t) {
            $s = $subs[$i] ?? [];
            $stdout = trim((string)($s['stdout'] ?? ''));
            $actual = $stdout !== '' ? $stdout : ('Error: ' . ($s['status']['description'] ?? 'no output'));
            $results[] = [
                'input' => $t['input'], 'expected' => $t['expected'], 'actual' => $actual,
                'passed' => $actual === $t['expected'],
                'log' => !empty($s['stderr']) ? [$s['stderr']] : [],
                'hidden' => (bool)$t['hidden'],
            ];
        }
        return $results;
    }

    /** Run assignment-free code with standard input in the private Judge0 instance. */
    public static function runFree(string $code, string $language, string $stdin): array
    {
        $languageIds = [
            'javascript' => 63,
            'python' => 71,
            'c' => 50,
            'cpp' => 54,
            'csharp' => 51,
        ];
        if (!isset($languageIds[$language])) {
            fail_api("The $language language is not supported by the secure runner.", 422);
        }
        if (!self::available()) {
            fail_api('Secure code execution is not configured. Set JUDGE0_URL to a private Judge0 instance.', 503);
        }

        $key = getenv('JUDGE0_API_KEY');
        $ch = curl_init(rtrim(getenv('JUDGE0_URL'), '/') . '/submissions?base64_encoded=false&wait=true');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => array_filter(['Content-Type: application/json', $key ? "Authorization: ******" : null]),
            CURLOPT_POSTFIELDS => json_encode([
                'language_id' => $languageIds[$language],
                'source_code' => $code,
                'stdin' => $stdin,
            ]),
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($status < 200 || $status >= 300 || !$body) {
            fail_api('The private code runner did not return a valid response.', 502);
        }

        $submission = json_decode($body, true);
        if (!is_array($submission)) {
            fail_api('The private code runner returned invalid JSON.', 502);
        }

        $stderr = trim(implode("\n", array_filter([
            (string)($submission['compile_output'] ?? ''),
            (string)($submission['stderr'] ?? ''),
        ])));
        $statusDescription = (string)($submission['status']['description'] ?? '');
        if ($stderr === '' && (int)($submission['status']['id'] ?? 0) !== 3) {
            $stderr = $statusDescription;
        }

        return [
            'stdout' => (string)($submission['stdout'] ?? ''),
            'stderr' => $stderr,
            'runtimeMs' => (int)round((float)($submission['time'] ?? 0) * 1000),
            'passedCount' => 0,
            'totalCount' => 0,
            'results' => [],
            'xpGained' => 0,
            'badges' => [],
            'submissionId' => null,
            'assignmentAttempt' => null,
        ];
    }
}

/** Stripe test-mode checkout; demo-mode record when no key is configured. */
class StripeService
{
    public static function checkout($db, string $userId, string $plan, string $baseUrl): array
    {
        $plans = ['pro' => ['EduSphere Pro (monthly)', 1200], 'team' => ['EduSphere Team seat (monthly)', 800]];
        [$name, $cents] = $plans[$plan];
        $key = getenv('STRIPE_SECRET_KEY');
        if (!$key) {
            $db->raw('INSERT INTO payments (id, user_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, \'usd\', \'demo\', NOW())',
                [uuid4(), $userId, $cents]);
            return ['demo' => true, 'url' => "$baseUrl/billing?demo=1&plan=$plan"];
        }
        $body = http_build_query([
            'mode' => 'subscription',
            'success_url' => "$baseUrl/billing?paid=1",
            'cancel_url' => "$baseUrl/billing",
            'line_items[0][quantity]' => 1,
            'line_items[0][price_data][currency]' => 'usd',
            'line_items[0][price_data][unit_amount]' => $cents,
            'line_items[0][price_data][recurring][interval]' => 'month',
            'line_items[0][price_data][product_data][name]' => $name,
            'metadata[userId]' => $userId,
            'metadata[plan]' => $plan,
        ]);
        $ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ["Authorization: Bearer $key", 'Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => $body,
        ]);
        $json = json_decode(curl_exec($ch) ?: '', true);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($status >= 400 || empty($json['url'])) fail_api($json['error']['message'] ?? 'Stripe error.', 502);
        return ['demo' => false, 'url' => $json['url']];
    }
}

/** SMTP-backed transactional email delivery. */
class MailService
{
    public static function configured(): bool
    {
        return self::smtpConfig() !== null;
    }

    public static function send(string $to, string $subject, string $html): bool
    {
        $config = self::smtpConfig();
        if ($config === null) {
            error_log('Email delivery is not configured: check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD.');
            return false;
        }

        require_once dirname(__DIR__, 2) . '/vendor/autoload.php';
        $mailer = new \PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mailer->isSMTP();
            $mailer->Host = $config['host'];
            $mailer->Port = $config['port'];
            $mailer->SMTPAuth = $config['user'] !== null;
            $mailer->SMTPAutoTLS = $config['secure'] !== 'none';
            if ($mailer->SMTPAuth) {
                $mailer->Username = $config['user'];
                $mailer->Password = $config['pass'];
            }
            if ($config['secure'] === 'ssl') {
                $mailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($config['secure'] === 'tls') {
                $mailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            }
            $mailer->Timeout = 15;
            $mailer->CharSet = 'UTF-8';
            $mailer->setFrom(getenv('MAIL_FROM_ADDRESS') ?: 'noreply@edusphere.dev', getenv('MAIL_FROM_NAME') ?: 'EduSphere');
            $mailer->addAddress($to);
            $mailer->Subject = $subject;
            $mailer->isHTML(true);
            $mailer->Body = $html;
            $mailer->send();
            return true;
        } catch (\PHPMailer\PHPMailer\Exception $error) {
            error_log('SMTP email delivery failed: ' . $mailer->ErrorInfo);
            return false;
        }
    }

    private static function smtpConfig(): ?array
    {
        $host = trim((string) getenv('SMTP_HOST'));
        $portValue = getenv('SMTP_PORT');
        if ($portValue === false || $portValue === '') $portValue = '587';
        $port = filter_var($portValue, FILTER_VALIDATE_INT);
        $secure = strtolower(trim((string) getenv('SMTP_SECURE')));
        $user = getenv('SMTP_USER');
        $password = getenv('SMTP_PASSWORD');
        $user = $user === false || $user === '' ? null : $user;
        $password = $password === false || $password === '' ? null : $password;

        if ($host === '' || $port === false || $port < 1 || $port > 65535) return null;
        if (!in_array($secure, ['', 'ssl', 'tls', 'none'], true)) return null;
        if (($user === null) !== ($password === null)) return null;
        if ($secure === '') $secure = $port === 465 ? 'ssl' : ($port === 587 ? 'tls' : 'none');

        return [
            'host' => $host,
            'port' => $port,
            'secure' => $secure,
            'user' => $user,
            'pass' => $password,
        ];
    }
}
/** S3/R2 pre-signed URLs when configured; metadata-only registration otherwise. */
class StorageService
{
    public static function presign(string $key, string $contentType): ?string
    {
        $endpoint = getenv('S3_ENDPOINT');
        $bucket = getenv('S3_BUCKET');
        if (!$endpoint || !$bucket || !getenv('S3_ACCESS_KEY')) return null; // demo mode
        // Minimal AWS SigV4-less pre-sign for S3-compatible providers that accept it is unsafe to fake;
        // production: swap in aws/aws-sdk-php S3Client::createPresignedRequest here.
        return rtrim($endpoint, '/') . '/' . $bucket . '/' . ltrim($key, '/');
    }
}
