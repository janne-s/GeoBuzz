<?php
if (session_status() === PHP_SESSION_NONE) {
	session_start();
}

function validateCSRF() {
	if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
		return;
	}
	
	$token = null;
	
	if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
		$token = $_SERVER['HTTP_X_CSRF_TOKEN'];
	} elseif (isset($_POST['csrf_token'])) {
		$token = $_POST['csrf_token'];
	} else {
		$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
		if (stripos($contentType, 'application/json') !== false) {
			$requestBody = readRequestBodySafely(102400); 
			$json = json_decode($requestBody, true);
			if ($json && isset($json['csrf_token'])) {
				$token = $json['csrf_token'];
			}
		}
	}
	
	if (!$token || !isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
		http_response_code(403);
		echo json_encode(["success" => false, "error" => "Invalid CSRF token"]);
		exit;
	}
}

function readRequestBodySafely($maxBytes = 102400) {
	$contentLength = $_SERVER['CONTENT_LENGTH'] ?? 0;
	
	if ($contentLength > $maxBytes) {
		http_response_code(413);
		echo json_encode(["success" => false, "error" => "Request too large"]);
		exit;
	}
	
	return file_get_contents('php://input', false, null, 0, $maxBytes);
}

function generateCSRFToken() {
	if (empty($_SESSION['csrf_token'])) {
		$_SESSION['csrf_token'] = bin2hex(random_bytes(32));
	}
	return $_SESSION['csrf_token'];
}

function rateLimit($key, $maxRequests = 20, $windowSeconds = 60) {
	$now = time();
	$rateLimitKey = "rate_limit_{$key}";
	
	if (!isset($_SESSION[$rateLimitKey])) {
		$_SESSION[$rateLimitKey] = ['count' => 0, 'reset' => $now + $windowSeconds];
	}
	
	$rl = &$_SESSION[$rateLimitKey];
	
	if ($now > $rl['reset']) {
		$rl['count'] = 0;
		$rl['reset'] = $now + $windowSeconds;
	}
	
	$rl['count']++;
	
	if ($rl['count'] > $maxRequests) {
		http_response_code(429);
		echo json_encode(["success" => false, "error" => "Rate limit exceeded. Try again later."]);
		exit;
	}
}

function setSecurityHeaders() {
	header('Content-Type: application/json');
	header('X-Content-Type-Options: nosniff');
	header('X-Frame-Options: DENY');
	header('X-XSS-Protection: 1; mode=block');
	header('Referrer-Policy: strict-origin-when-cross-origin');
}

function formatFileSize($bytes) {
	if ($bytes === 0) return "0 B";
	$units = ['B', 'KB', 'MB', 'GB', 'TB'];
	$i = floor(log($bytes, 1024));
	return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
}

function parseSize($val) {
	$val = trim($val);
	$last = strtolower(substr($val, -1));
	$val = (int)$val;
	switch ($last) {
		case 'g': $val *= 1024;
		case 'm': $val *= 1024;
		case 'k': $val *= 1024;
	}
	return $val;
}

function getWorkspaceDir($workspaceId) {
	return __DIR__ . "/../workspaces/" . basename($workspaceId);
}

function getWorkspaceSoundsDir($workspaceId) {
	return getWorkspaceDir($workspaceId) . "/sounds/";
}

function getWorkspaceIdFromRequest($required = false, $default = 'default') {
	if (!isset($_GET['workspace']) || empty($_GET['workspace'])) {
		if ($required) {
			http_response_code(400);
			echo json_encode(["success" => false, "error" => "Missing workspace parameter"]);
			exit;
		}
		return basename($default);
	}
	return basename($_GET['workspace']);
}

function getMaxUploadSize() {
	return min(parseSize(ini_get('upload_max_filesize')), parseSize(ini_get('post_max_size')));
}

function isAllowedAudioFile($filename) {
	global $ALLOWED_AUDIO_EXTENSIONS;
	$ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
	return in_array($ext, $ALLOWED_AUDIO_EXTENSIONS);
}

function ensureWorkspaceExists($workspaceId) {
	$workspaceDir = getWorkspaceDir($workspaceId);
	$soundsDir = getWorkspaceSoundsDir($workspaceId);
	
	if (!is_dir($workspaceDir)) {
		if (!mkdir($workspaceDir, 0755, true)) {
			return false;
		}
		if (!mkdir($soundsDir, 0755, true)) {
			return false;
		}
	}
	return true;
}

function jsonResponse($data, $statusCode = 200) {
	http_response_code($statusCode);
	echo json_encode($data);
	exit;
}

function jsonError($message, $statusCode = 400) {
	jsonResponse(["success" => false, "error" => $message], $statusCode);
}

function jsonSuccess($data = []) {
	jsonResponse(array_merge(["success" => true], $data));
}

$ALLOWED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'webm', 'mp4'];
$ALLOWED_AUDIO_MIMES = [
	'audio/mpeg',
	'audio/wav',
	'audio/x-wav',
	'audio/wave',
	'audio/x-pn-wav',
	'audio/ogg',
	'audio/mp4',
	'audio/x-m4a',
	'audio/webm',
	'video/webm'
];