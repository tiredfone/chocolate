<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__, 2);
require $_SERVER['DOCUMENT_ROOT'] . '/core/files.php';
$rows = $db->run('SELECT ID, Name FROM Assets WHERE Type = "Game" AND Approved = 1 AND Private = 0 ORDER BY ID')->fetchAll(PDO::FETCH_ASSOC);
$out = [];
foreach ($rows as $r) {
    $out[] = ['id' => (int)$r['ID'], 'name' => html_entity_decode((string)$r['Name'], ENT_QUOTES)];
}
echo json_encode($out);
