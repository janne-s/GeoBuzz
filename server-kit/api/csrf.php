<?php
require_once 'endpoint.php';
handleEndpoint(fn() => jsonSuccess(['token' => generateCSRFToken()]), ['csrf' => false]);