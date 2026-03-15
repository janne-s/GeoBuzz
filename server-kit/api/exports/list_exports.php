<?php
require_once '../endpoint.php';

handleEndpoint(function($ctx) {
	$exportsDir = getWorkspaceDir($ctx['workspace']) . "/exports";

	if (!is_dir($exportsDir)) {
		jsonSuccess(['exports' => []]);
	}

	$exports = [];
	$items = scandir($exportsDir);

	foreach ($items as $item) {
		if ($item === '.' || $item === '..') continue;

		$itemPath = $exportsDir . '/' . $item;
		if (!is_dir($itemPath)) continue;

		$buzzJsonPath = $itemPath . '/buzz.json';
		if (!file_exists($buzzJsonPath)) continue;

		$meta = null;
		$title = $item;
		$author = '';
		$created = '';

		$buzzJson = @file_get_contents($buzzJsonPath);
		if ($buzzJson) {
			$buzzData = json_decode($buzzJson, true);
			if ($buzzData && isset($buzzData['meta'])) {
				$meta = $buzzData['meta'];
				$title = $meta['title'] ?? $item;
				$author = $meta['author'] ?? '';
				$created = $meta['created'] ?? '';
			}
		}

		$size = 0;
		$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($itemPath));
		foreach ($iterator as $file) {
			if ($file->isFile()) {
				$size += $file->getSize();
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
		$url = $protocol . '://' . $host . $appRoot . '/workspaces/' . $ctx['workspace'] . '/exports/' . $item . '/';

		$exports[] = [
			'name' => $item,
			'title' => $title,
			'author' => $author,
			'created' => $created,
			'size' => $size,
			'sizeFormatted' => formatFileSize($size),
			'url' => $url
		];
	}

	usort($exports, function($a, $b) {
		return strcmp($b['created'], $a['created']);
	});

	jsonSuccess(['exports' => $exports]);
}, ['workspace' => 'required', 'rateLimit' => ['list_exports', 30, 60]]);
