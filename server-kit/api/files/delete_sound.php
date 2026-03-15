<?php
require_once '../endpoint.php';

handleEndpoint(function($ctx) {
	if (!isset($_POST['filename'])) {
		jsonError("No filename provided");
	}
	
	$filename = basename($_POST['filename']);
	$targetDir = getWorkspaceSoundsDir($ctx['workspace']);
	$targetFile = $targetDir . $filename;
	
	if (!file_exists($targetFile)) {
		jsonError("File not found", 404);
	}
	
	if (strpos(realpath($targetFile), realpath($targetDir)) !== 0) {
		jsonError("Invalid file path", 403);
	}
	
	if (!isAllowedAudioFile($filename)) {
		jsonError("Invalid file type");
	}
	
	unlink($targetFile) ? jsonSuccess(["message" => "File deleted"]) : jsonError("Failed to delete", 500);
}, ['methods' => ['POST'], 'rateLimit' => ['delete', 20, 60], 'workspace' => true]);