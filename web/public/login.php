<?php
// Cookie-session login for the booking app. Replaces HTTP Basic Auth, which
// iOS Safari's "Add to Home Screen" standalone mode does not persist reliably.
// The real password + cookie secret live in auth_secret.php, which the deploy
// Action writes on the server and is never part of the client bundle.

$AUTH_PASSWORD = '';
$COOKIE_SECRET = '';
$secretFile = __DIR__ . '/auth_secret.php';
if (file_exists($secretFile)) require $secretFile;

$COOKIE_NAME = 'booking_auth';
// The folder this page is served from, so a staging copy elsewhere on the same
// host keeps a login of its own.
$COOKIE_PATH = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
$ONE_YEAR = 60 * 60 * 24 * 365;

function setAuthCookie($name, $value, $expires, $path) {
    setcookie($name, $value, [
        'expires'  => $expires,
        'path'     => $path,
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

// Logout: clear the cookie and show the form again.
if (isset($_GET['logout'])) {
    setAuthCookie($COOKIE_NAME, '', time() - 3600, $COOKIE_PATH);
    header('Location: login.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = $_POST['password'] ?? '';
    if ($AUTH_PASSWORD !== '' && hash_equals($AUTH_PASSWORD, $password)) {
        setAuthCookie($COOKIE_NAME, $COOKIE_SECRET, time() + $ONE_YEAR, $COOKIE_PATH);
        header('Location: index.html');
        exit;
    }
    $error = 'Incorrect password.';
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Booking App — Sign in</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f3f4f6; color: #111827; padding: 24px;
    }
    .card {
      width: 100%; max-width: 320px; background: #fff; border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08); padding: 28px 24px;
    }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p.sub { font-size: 13px; color: #6b7280; margin: 0 0 20px; }
    label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
    input[type=password] {
      width: 100%; padding: 10px 12px; font-size: 16px; border: 1px solid #d1d5db;
      border-radius: 10px; background: #fff; color: #111827;
    }
    input[type=password]:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.25); }
    button {
      width: 100%; margin-top: 16px; padding: 11px 12px; font-size: 15px; font-weight: 600;
      color: #fff; background: #f59e0b; border: none; border-radius: 10px; cursor: pointer;
    }
    button:hover { background: #d97706; }
    .error { margin: 12px 0 0; font-size: 13px; color: #dc2626; }
    @media (prefers-color-scheme: dark) {
      body { background: #111827; color: #f3f4f6; }
      .card { background: #1f2937; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
      p.sub, label { color: #9ca3af; }
      input[type=password] { background: #374151; border-color: #4b5563; color: #f3f4f6; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Booking App</h1>
    <p class="sub">Enter the password to continue.</p>
    <form method="post" action="login.php">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
      <button type="submit">Sign in</button>
      <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    </form>
  </div>
</body>
</html>
