<?php
require_once '../endpoint.php';

handleEndpoint(function($ctx) {
	$requestBody = readRequestBodySafely(2097152);
	$data = json_decode($requestBody, true);

	if (!$data) {
		jsonError("Invalid JSON payload");
	}

	$buzzName = $data['buzzName'] ?? null;
	$buzzData = $data['buzzData'] ?? null;
	$htmlContent = $data['htmlContent'] ?? null;
	$cssContent = $data['cssContent'] ?? null;
	$readmeContent = $data['readmeContent'] ?? null;
	$soundFiles = $data['soundFiles'] ?? [];

	if (!$buzzName || !$buzzData || !$htmlContent || !$cssContent || !$readmeContent) {
		jsonError("Missing required fields");
	}

	$buzzName = preg_replace('/[^a-z0-9\-]/', '-', strtolower($buzzName));

	$exportDir = getWorkspaceDir($ctx['workspace']) . "/exports/{$buzzName}";
	$soundsDir = $exportDir . "/sounds";

	if (file_exists($exportDir)) {
		$counter = 1;
		while (file_exists($exportDir . "-{$counter}")) {
			$counter++;
		}
		$buzzName = $buzzName . "-{$counter}";
		$exportDir = getWorkspaceDir($ctx['workspace']) . "/exports/{$buzzName}";
		$soundsDir = $exportDir . "/sounds";
	}

	if (!mkdir($exportDir, 0755, true)) {
		jsonError("Failed to create export directory", 500);
	}

	if (!mkdir($soundsDir, 0755, true)) {
		jsonError("Failed to create sounds directory", 500);
	}

	if (file_put_contents($exportDir . "/buzz.json", $buzzData) === false) {
		jsonError("Failed to write buzz.json", 500);
	}

	if (file_put_contents($exportDir . "/index.html", $htmlContent) === false) {
		jsonError("Failed to write index.html", 500);
	}

	if (file_put_contents($exportDir . "/player-styles.css", $cssContent) === false) {
		jsonError("Failed to write player-styles.css", 500);
	}

	if (file_put_contents($exportDir . "/README.txt", $readmeContent) === false) {
		jsonError("Failed to write README.txt", 500);
	}

	$workspaceSoundsDir = getWorkspaceSoundsDir($ctx['workspace']);
	foreach ($soundFiles as $soundFile) {
		$soundFile = basename($soundFile);
		$sourcePath = $workspaceSoundsDir . $soundFile;
		$destPath = $soundsDir . "/" . $soundFile;

		if (file_exists($sourcePath)) {
			if (!copy($sourcePath, $destPath)) {
				error_log("Failed to copy sound file: {$soundFile}");
			}
		}
	}

	$protocol = 'https';
	if (isset($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
		$protocol = $_SERVER['HTTP_X_FORWARDED_PROTO'];
	} elseif (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
		$protocol = 'https';
	} elseif (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) {
		$protocol = 'https';
	}

	$host = $_SERVER['HTTP_HOST'];
	$appRoot = rtrim(dirname(dirname(dirname($_SERVER['SCRIPT_NAME']))), '/');
	$buzzUrl = $protocol . '://' . $host . $appRoot . '/workspaces/' . $ctx['workspace'] . '/exports/' . $buzzName . '/';

	$htaccessContent = <<<'HTACCESS'
<FilesMatch "\.(php|php3|php4|php5|phtml|pl|py|jsp|asp|htm|shtml|sh|cgi)$">
	Require all denied
</FilesMatch>
Require all granted
HTACCESS;
	file_put_contents($exportDir . "/.htaccess", $htaccessContent);

	jsonSuccess([
		'buzzUrl' => $buzzUrl,
		'buzzName' => $buzzName,
		'path' => $exportDir
	]);
}, ['workspace' => 'required', 'rateLimit' => ['export_to_workspace', 5, 60]]);
