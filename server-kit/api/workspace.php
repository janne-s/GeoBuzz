<?php
require_once 'endpoint.php';

handleEndpoint(function($ctx) {
	$method = $_SERVER['REQUEST_METHOD'];
	$action = $_GET['action'] ?? null;
	
	if ($method === 'GET') {
		if ($action === 'create') {
			rateLimit('workspace_create', 5, 300);
			$id = bin2hex(random_bytes(6));
			ensureWorkspaceExists($id) ? jsonSuccess(["workspaceId" => $id]) : jsonError("Failed to create", 500);
		} elseif ($action === 'validate' && isset($_GET['id'])) {
			$id = basename($_GET['id']);
			$existed = is_dir(getWorkspaceDir($id));
			!$existed && ensureWorkspaceExists($id);
			jsonSuccess(["exists" => $existed, "created" => !$existed]);
		} elseif ($action === 'load' && isset($_GET['id'])) {
			$file = getWorkspaceDir(basename($_GET['id'])) . "/settings.json";
			if (file_exists($file)) {
				header('Content-Type: application/json');
				exit(file_get_contents($file));
			}
			jsonError("Settings not found", 404);
		}
	} elseif ($method === 'POST' && $action === 'save' && isset($_GET['id'])) {
		$data = json_decode(readRequestBodySafely(), true);
		json_last_error() === JSON_ERROR_NONE || jsonError("Invalid JSON");
		unset($data['csrf_token']);
		$file = getWorkspaceDir(basename($_GET['id'])) . "/settings.json";
		file_put_contents($file, json_encode($data)) !== false ? jsonSuccess() : jsonError("Failed to save", 500);
	}
	
	jsonError("Invalid request", 400);
});