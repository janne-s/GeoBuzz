<?php
require_once 'common.php';

function handleEndpoint($handler, $options = []) {
	$defaults = [
		'csrf' => true,
		'methods' => ['GET', 'POST'],
		'rateLimit' => null,
		'workspace' => false
	];
	$opts = array_merge($defaults, $options);
	
	if (!in_array($_SERVER['REQUEST_METHOD'], $opts['methods'])) {
		jsonError("Method not allowed", 405);
	}
	
	if ($opts['csrf'] && $_SERVER['REQUEST_METHOD'] === 'POST') {
		validateCSRF();
	}
	
	setSecurityHeaders();
	
	if ($opts['rateLimit']) {
		rateLimit($opts['rateLimit'][0], $opts['rateLimit'][1] ?? 20, $opts['rateLimit'][2] ?? 60);
	}
	
	$context = [];
	if ($opts['workspace']) {
		$context['workspace'] = getWorkspaceIdFromRequest($opts['workspace'] === 'required');
	}
	
	$handler($context);
}