<?php
// The GitHub token, for a Mac syncing its settings with this web app (Settings
// ▸ General ▸ Sync with your web app, "Also use the web app's CSV"). Behind the
// same cookie gate as the app (.htaccess), so it reaches exactly the browsers
// and Macs that could already read it from the bundle. The deploy writes
// github_token.php beside it; that file sets $GITHUB_TOKEN and prints nothing.
header('Content-Type: application/json');
header('Cache-Control: no-store');

$GITHUB_TOKEN = '';
$tokenFile = __DIR__ . '/github_token.php';
if (file_exists($tokenFile)) require $tokenFile;

echo json_encode(['token' => $GITHUB_TOKEN]);
