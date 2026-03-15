<?php
require_once '../endpoint.php';

function deleteDirectory($dir) {
	if (!is_dir($dir)) {
		return false;
	}

	$items = scandir($dir);
	foreach ($items as $item) {
		if ($item === '.' || $item === '..') continue;

		$path = $dir . '/' . $item;
		if (is_dir($path)) {
			deleteDirectory($path);
		} else {
			unlink($path);
		}
	}

	return rmdir($dir);
}

handleEndpoint(function($ctx) {
	if (!isset($_GET['name']) || empty($_GET['name'])) {
		jsonError("Missing export name parameter");
	}

	$exportName = basename($_GET['name']);
	$exportsBaseDir = getWorkspaceDir($ctx['workspace']) . "/exports";
	$exportPath = $exportsBaseDir . "/" . $exportName;

	if (!is_dir($exportPath)) {
		jsonError("Export not found", 404);
	}

	if (strpos(realpath($exportPath), realpath($exportsBaseDir)) !== 0) {
		jsonError("Invalid export path", 403);
	}

	if (deleteDirectory($exportPath)) {
		jsonSuccess(['message' => 'Export deleted successfully']);
	} else {
		jsonError("Failed to delete export", 500);
	}
}, ['workspace' => 'required', 'methods' => ['POST'], 'rateLimit' => ['delete_export', 10, 60]]);
