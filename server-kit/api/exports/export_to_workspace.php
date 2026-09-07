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

	if (file_exists($exportDir)) {
		$counter = 1;
		while (file_exists($exportDir . "-{$counter}")) {
			$counter++;
		}
		$buzzName = $buzzName . "-{$counter}";
		$exportDir = getWorkspaceDir($ctx['workspace']) . "/exports/{$buzzName}";
	}

	$soundsDir = $exportDir . "/sounds";

	if (!is_dir(getWorkspaceDir($ctx['workspace']))) {
		jsonError("Workspace not found", 404);
	}

	if (!mkdir($exportDir, 0755, true)) {
		jsonError("Failed to create export directory", 500);
	}

	$abortExport = function($message) use ($exportDir) {
		deleteDirectoryTree($exportDir);
		jsonError($message, 500);
	};

	if (!mkdir($soundsDir, 0755, true)) {
		$abortExport("Failed to create sounds directory");
	}

	$htaccessContent = <<<'HTACCESS'
<FilesMatch "\.(php|php3|php4|php5|phtml|pl|py|jsp|asp|htm|shtml|sh|cgi)$">
	Require all denied
</FilesMatch>
Require all granted
HTACCESS;

	$exportFiles = [
		'.htaccess' => $htaccessContent,
		'buzz.json' => $buzzData,
		'index.html' => $htmlContent,
		'player-styles.css' => $cssContent,
		'README.txt' => $readmeContent
	];

	foreach ($exportFiles as $name => $contents) {
		if (!writeFileAtomically($exportDir . "/" . $name, $contents)) {
			$abortExport("Failed to write {$name}");
		}
	}

	$workspaceSoundsDir = getWorkspaceSoundsDir($ctx['workspace']);
	$missingSounds = [];
	$failedSounds = [];

	foreach ($soundFiles as $soundFile) {
		$soundFile = basename($soundFile);
		$sourcePath = $workspaceSoundsDir . $soundFile;

		if (!file_exists($sourcePath)) {
			$missingSounds[] = $soundFile;
		} elseif (!@copy($sourcePath, $soundsDir . "/" . $soundFile)) {
			$failedSounds[] = $soundFile;
		}
	}

	if ($missingSounds || $failedSounds) {
		$detail = [];
		if ($missingSounds) {
			$detail[] = "not found in this workspace: " . implode(', ', $missingSounds);
		}
		if ($failedSounds) {
			$detail[] = "could not be copied: " . implode(', ', $failedSounds);
		}
		$abortExport("Export cancelled and nothing was kept. Sounds " . implode('; ', $detail) . ".");
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

	jsonSuccess([
		'buzzUrl' => $buzzUrl,
		'buzzName' => $buzzName,
		'path' => $exportDir
	]);
}, ['workspace' => 'required', 'rateLimit' => ['export_to_workspace', 5, 60]]);
