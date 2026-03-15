<?php
require_once '../endpoint.php';

function listFiles($dir, $baseDir) {
    $files = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $path = $dir . '/' . $item;
        $relativePath = str_replace($baseDir . '/', '', $path);

        if (is_dir($path)) {
            $files = array_merge($files, listFiles($path, $baseDir));
        } else if (is_file($path)) {
            $ext = pathinfo($path, PATHINFO_EXTENSION);
            if (in_array($ext, ['js', 'json', 'md', 'txt'])) {
                $files[] = $relativePath;
            }
        }
    }

    return $files;
}

handleEndpoint(function() {
    $srcDir = __DIR__ . '/../../src';
    $baseDir = __DIR__ . '/../..';

    if (!is_dir($srcDir)) {
        jsonError('src directory not found', 404);
    }

    $files = listFiles($srcDir, $baseDir);
    jsonSuccess(['files' => $files]);
}, [
    'csrf' => true,
    'methods' => ['POST'],
    'rateLimit' => ['export', 5, 60]
]);
