<?php
// A small JSON store for the web build, behind the same cookie gate as the app
// (.htaccess). One file per key:
//   settings   the app's settings (rules, bands, venue types, …), shared by
//              every browser that opens the app
//   geocache   cities geocoded since the last deploy
//   dismissed  duplicate pairs dismissed in the old web app; read once when its
//              settings are migrated. Also what a request without a key gets,
//              which is the old web app's API.
header('Content-Type: application/json');
header('Cache-Control: no-store');

$files = [
    'settings'  => 'app_settings.json',
    'geocache'  => 'geo_cache_live.json',
    'dismissed' => 'dismissed_dupes.json',
];
$key = $_GET['key'] ?? 'dismissed';
if (!isset($files[$key])) { http_response_code(400); echo '{"error":"unknown key"}'; exit; }
$file = __DIR__ . '/' . $files[$key];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($file)) { readfile($file); }
    else { echo $key === 'dismissed' ? '[]' : 'null'; }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    if (strlen($body) > 2 * 1024 * 1024 || !is_array(json_decode($body, true))) {
        http_response_code(400);
        echo '{"error":"expected a JSON object or array"}';
        exit;
    }
    // Written beside the target and renamed over it, so a reader never sees half a file.
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, $body, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        http_response_code(500);
        echo '{"error":"could not write"}';
        exit;
    }
    echo '{"ok":true}';
    exit;
}

http_response_code(405);
