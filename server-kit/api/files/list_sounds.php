<?php
require_once '../endpoint.php';

handleEndpoint(function($ctx) {
	$dir = getWorkspaceSoundsDir($ctx['workspace']);
	$files = [];
	
	if (is_dir($dir)) {
		foreach (scandir($dir) as $f) {
			if (isAllowedAudioFile($f)) {
				$filePath = $dir . $f;
				$size = filesize($filePath);
				$files[] = [
					'name' => $f,
					'size' => $size,
					'sizeFormatted' => formatFileSize($size)
				];
			}
		}
	}
	
	header('Content-Type: application/json');
	echo json_encode($files);
}, ['csrf' => false, 'methods' => ['GET'], 'workspace' => true]);