<?php
require_once '../endpoint.php';

handleEndpoint(function($ctx) {
	if (isset($_GET['action']) && $_GET['action'] === 'maxsize') {
		$maxUpload = getMaxUploadSize();
		jsonSuccess([
			"maxFileSize" => $maxUpload,
			"maxFileSizeFormatted" => formatFileSize($maxUpload)
		]);
	}
	
	if (!ensureWorkspaceExists($ctx['workspace'])) {
		jsonError("Failed to create workspace directory", 500);
	}
	
	$targetDir = getWorkspaceSoundsDir($ctx['workspace']);
	
	if (!isset($_FILES['file'])) {
		jsonError("No file received");
	}
	
	$file = $_FILES['file'];
	
	if ($file['error'] !== UPLOAD_ERR_OK) {
		$errors = [
			UPLOAD_ERR_INI_SIZE   => "File exceeds upload_max_filesize",
			UPLOAD_ERR_FORM_SIZE  => "File exceeds MAX_FILE_SIZE",
			UPLOAD_ERR_PARTIAL    => "File was only partially uploaded",
			UPLOAD_ERR_NO_FILE    => "No file was uploaded",
			UPLOAD_ERR_NO_TMP_DIR => "Missing temporary folder",
			UPLOAD_ERR_CANT_WRITE => "Failed to write file to disk",
			UPLOAD_ERR_EXTENSION  => "Extension stopped file upload"
		];
		jsonError($errors[$file['error']] ?? "Unknown upload error", 400);
	}
	
	$maxUpload = getMaxUploadSize();
	if ($file['size'] > $maxUpload) {
		jsonError("File exceeds max size of " . formatFileSize($maxUpload), 413);
	}
	
	$finfo = finfo_open(FILEINFO_MIME_TYPE);
	$detectedMime = finfo_file($finfo, $file['tmp_name']);
	finfo_close($finfo);

	$baseMime = explode(';', $detectedMime)[0];

	if (!in_array($baseMime, $GLOBALS['ALLOWED_AUDIO_MIMES'])) {
		jsonError("Invalid file type. Only audio files allowed.", 415);
	}
	
	if (!isAllowedAudioFile($file['name'])) {
		jsonError("Invalid file extension", 415);
	}
	
	$filename = preg_replace('/[^A-Za-z0-9_\.-]/', '_', basename($file['name']));
	$targetPath = $targetDir . $filename;
	
	if (file_exists($targetPath)) {
		$pathInfo = pathinfo($filename);
		$counter = 1;
		while (file_exists($targetPath)) {
			$filename = $pathInfo['filename'] . '_' . $counter . '.' . $pathInfo['extension'];
			$targetPath = $targetDir . $filename;
			$counter++;
		}
	}
	
	move_uploaded_file($file['tmp_name'], $targetPath) 
		? jsonSuccess(["file" => $filename, "size" => $file['size'], "sizeFormatted" => formatFileSize($file['size'])])
		: jsonError("Failed to move uploaded file", 500);
}, ['workspace' => 'required']);