<?php
$config = [
    'host' => '127.0.0.1',
    'port' => 4201,
    'publicPath' => '/chocolate',
    'websocketPath' => '/chocolate/ws',
    'siteUrl' => 'http://127.0.0.1',
    'key' => '',
    'assetDir' => '',
    'userAgent' => 'Chocolate/26.11.3-hotfix',
    'endpoints' => [
        'ticket' => '/api/chocolate/ticket',
        'redeem' => '/api/chocolate/redeem',
        'asset' => '/asset/?id={id}',
        'place' => '',
        'coreScript' => '/asset/?id={id}',
        'appearance' => '/api/charapp/{id}',
        'bodyColors' => '/Asset/BodyColors.ashx?userId={id}',
        'gears' => '',
        'gamePage' => '/games/{id}',
        'play' => '/play/{id}',
        'studio' => '/studio/{id}',
        'studioPlace' => '/api/chocolate/studio/place/{id}',
        'studioSave' => '/api/chocolate/studio/save/{id}',
        'studioTicket' => '/api/chocolate/studio/ticket/{id}',
        'studioCollaborators' => '/api/chocolate/studio/collaborators/{id}',
        'studioToolbox' => '/api/chocolate/studio/toolbox',
        'presence' => '/api/chocolate/presence',
        'social' => '/api/chocolate/social',
        'login' => '/login',
        'thumbnail' => '/image/headshot?userId={id}',
        'avatarThumbnail' => '/thumbnail/user/{id}',
        'placeThumbnail' => '/Image/Item.ashx?ID={id}',
    ],
];
if (is_file(__DIR__ . '/config.local.php')) {
    $local = require __DIR__ . '/config.local.php';
    $endpoints = array_merge($config['endpoints'], $local['endpoints'] ?? []);
    $config = array_merge($config, $local);
    $config['endpoints'] = $endpoints;
}
return $config;
