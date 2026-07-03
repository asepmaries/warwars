#!/usr/bin/env php
<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/ApiClient.php';

date_default_timezone_set('Asia/Jakarta');

// === KONFIGURASI VPS — ganti IP/port di sini saat pindah server ===
const VPS_IP = '213.163.195.93';
const VPS_PORT = 8080;

const DEFAULT_FILE_USERWDP = 'data/userwdp.txt';
const DEFAULT_FILE_HASIL = 'data/hasil.txt';
const DEFAULT_FILE_LIMIT = 'data/userlimit.txt';

function defaultApiUrl(): string
{
    return 'http://' . VPS_IP . ':' . VPS_PORT;
}

function resolveDataPath(string $path): string
{
    if ($path === '') {
        return $path;
    }
    if ($path[0] === '/' || $path[0] === '\\' || preg_match('/^[A-Za-z]:[\\\\\\/]/', $path)) {
        return $path;
    }
    return __DIR__ . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
}

function parseCliArgv(array $argv): array
{
    $api = null;
    $open = false;
    $positional = [];

    for ($i = 0, $n = count($argv); $i < $n; $i++) {
        $arg = $argv[$i];
        if ($arg === '--api' && isset($argv[$i + 1])) {
            $api = $argv[++$i];
            continue;
        }
        if ($arg === '--open') {
            $open = true;
            continue;
        }
        $positional[] = $arg;
    }

    array_shift($positional);
    return [
        'api' => $api,
        'open' => $open,
        'command' => $positional[0] ?? null,
        'file' => $positional[1] ?? null,
    ];
}

function loadConfig(?string $apiOverride = null): array
{
    $config = [
        'api_url' => getenv('WDP_API_URL') ?: defaultApiUrl(),
        'default_files' => [
            'userwdp' => getenv('WDP_FILE_USERWDP') ?: DEFAULT_FILE_USERWDP,
            'hasil' => getenv('WDP_FILE_HASIL') ?: DEFAULT_FILE_HASIL,
            'limit' => getenv('WDP_FILE_LIMIT') ?: DEFAULT_FILE_LIMIT,
        ],
    ];

    $local = __DIR__ . '/config.local.php';
    if (is_file($local)) {
        $override = require $local;
        if (is_array($override)) {
            $config = array_replace_recursive($config, $override);
        }
    }

    foreach ($config['default_files'] as $key => $path) {
        $config['default_files'][$key] = resolveDataPath((string) $path);
    }

    if ($apiOverride) {
        $config['api_url'] = $apiOverride;
    }

    return $config;
}

function hr(): void
{
    echo str_repeat('-', 55) . PHP_EOL;
}

function ask(string $prompt, ?string $default = null): string
{
    $suffix = $default !== null && $default !== '' ? " [$default]" : '';
    echo $prompt . $suffix . ': ';
    $input = trim((string) fgets(STDIN));
    return ($input === '' && $default !== null) ? $default : $input;
}

function printResult(array $result): void
{
    if (!($result['ok'] ?? false)) {
        echo 'GAGAL: ' . ($result['error'] ?? 'Unknown error') . PHP_EOL;
        return;
    }
    echo 'OK' . PHP_EOL;
    foreach (['row_count', 'matched', 'limit_count', 'hasil_count', 'deleted_count'] as $key) {
        if (isset($result[$key])) {
            echo strtoupper($key) . ': ' . $result[$key] . PHP_EOL;
        }
    }
    if (!empty($result['deleted'])) {
        echo 'DELETED: ' . implode(', ', $result['deleted']) . PHP_EOL;
    }
    if (!empty($result['message'])) {
        echo $result['message'] . PHP_EOL;
    }
    if (!empty($result['missing'])) {
        echo 'TIDAK ADA DI USERWDP: ' . implode(', ', array_slice($result['missing'], 0, 10)) . PHP_EOL;
    }
    if (!empty($result['errors'])) {
        foreach ($result['errors'] as $err) {
            echo '  - ' . $err . PHP_EOL;
        }
    }
}

function openBrowser(string $url): void
{
    echo PHP_EOL . 'Sheet URL: ' . $url . PHP_EOL;
    if (PHP_OS_FAMILY === 'Windows') {
        pclose(popen('start "" ' . escapeshellarg($url), 'r'));
    } elseif (PHP_OS_FAMILY === 'Darwin') {
        exec('open ' . escapeshellarg($url) . ' >/dev/null 2>&1 &');
    } else {
        exec('xdg-open ' . escapeshellarg($url) . ' >/dev/null 2>&1 &');
    }
    echo 'Browser dibuka.' . PHP_EOL;
}

function ensureApiOnline(ApiClient $api): bool
{
    if ($api->health()['ok'] ?? false) {
        return true;
    }
    echo 'API offline: ' . $api->getBaseUrl() . PHP_EOL;
    echo 'Jalankan: ./deploy-vps.sh atau npm start' . PHP_EOL;
    return false;
}

function runCli(array $cli, ApiClient $api, array $files): void
{
    switch ($cli['command']) {
        case 'upload':
            printResult($api->upload('/api/upload', $cli['file'] ?: $files['userwdp']));
            break;
        case 'upload-hasil':
            printResult($api->upload('/api/upload-hasil', $cli['file'] ?: $files['hasil']));
            break;
        case 'upload-limit':
            printResult($api->upload('/api/upload-limit', $cli['file'] ?: $files['limit']));
            break;
        case 'meta':
            echo json_encode($api->meta(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            break;
        case 'sheet':
            $url = $api->sheetUrl();
            echo $url . PHP_EOL;
            if ($cli['open']) {
                openBrowser($url);
            }
            break;
        case 'reset':
            printResult($api->reset());
            break;
        default:
            fwrite(STDERR, "Usage: php controller.php [--api URL] [upload|upload-hasil|upload-limit|meta|sheet|reset] [file] [--open]\n");
            exit(1);
    }
}

$rawArgv = $_SERVER['argv'] ?? [];
$cli = parseCliArgv($rawArgv);
$config = loadConfig($cli['api']);
$api = new ApiClient($config['api_url']);
$files = $config['default_files'];

if ($cli['command'] !== null && $cli['command'] !== '') {
    if (!ensureApiOnline($api)) {
        exit(1);
    }
    runCli($cli, $api, $files);
    exit(0);
}

echo PHP_EOL . '=== WDP Controller ===' . PHP_EOL;
echo 'VPS  : ' . VPS_IP . ':' . VPS_PORT . PHP_EOL;
echo 'API  : ' . $api->getBaseUrl() . PHP_EOL;
if (!ensureApiOnline($api)) {
    exit(1);
}

while (true) {
    hr();
    echo '1. Upload Data (userwdp.txt)' . PHP_EOL;
    echo '2. Upload Hasil (hasil.txt)' . PHP_EOL;
    echo '3. Upload Limit (userlimit.txt)' . PHP_EOL;
    echo '4. Lihat Sheet (buka browser)' . PHP_EOL;
    echo '5. Status Data' . PHP_EOL;
    echo '6. Reset Data (hapus semua user/hasil/limit)' . PHP_EOL;
    echo '0. Keluar' . PHP_EOL;
    hr();

    switch (ask('Pilih menu', '1')) {
        case '1':
            printResult($api->upload('/api/upload', ask('Path file', $files['userwdp'])));
            break;
        case '2':
            printResult($api->upload('/api/upload-hasil', ask('Path file', $files['hasil'])));
            break;
        case '3':
            printResult($api->upload('/api/upload-limit', ask('Path file', $files['limit'])));
            break;
        case '4':
            openBrowser($api->sheetUrl());
            break;
        case '5':
            echo json_encode($api->meta(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
            break;
        case '6':
            echo 'PERINGATAN: Semua data user, hasil, dan limit di VPS akan dihapus.' . PHP_EOL;
            if (strtoupper(ask('Ketik YES untuk reset')) !== 'YES') {
                echo 'Reset dibatalkan.' . PHP_EOL;
                break;
            }
            printResult($api->reset());
            break;
        case '0':
        case 'q':
            echo 'Selesai.' . PHP_EOL;
            exit(0);
        default:
            echo 'Menu tidak valid.' . PHP_EOL;
    }
}