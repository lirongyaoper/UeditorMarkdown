<?php
/**
 * Generic remote-image catching action (catchimage).
 * Included by controller.php; $CONFIG is defined there.
 * Downloads remote images listed in $_POST/$_GET[$CONFIG['catcherFieldName']] to local storage.
 */
set_time_limit(0);
include_once __DIR__ . "/Uploader.class.php";

$config = array(
    "pathFormat" => $CONFIG['catcherPathFormat'],
    "maxSize" => $CONFIG['catcherMaxSize'],
    "allowFiles" => $CONFIG['catcherAllowFiles'],
    "oriName" => "remote.png"
);
$fieldName = $CONFIG['catcherFieldName'];
$prefix = isset($CONFIG['catcherUrlPrefix']) ? $CONFIG['catcherUrlPrefix'] : '';
$localDomain = isset($CONFIG['catcherLocalDomain']) ? $CONFIG['catcherLocalDomain'] : array();

$list = array();
if (isset($_POST[$fieldName])) {
    $source = $_POST[$fieldName];
} else if (isset($_GET[$fieldName])) {
    $source = $_GET[$fieldName];
} else {
    $source = array();
}
if (!is_array($source) || !count($source)) {
    return json_encode(array('state' => 'ERROR', 'list' => array()));
}

foreach ($source as $imgUrl) {
    $skip = false;
    foreach ($localDomain as $domain) {
        if (stristr($imgUrl, $domain)) { $skip = true; break; }
    }
    if ($skip) continue;

    $item = new Uploader($imgUrl, $config, "remote");
    $info = $item->getFileInfo();
    if ($info['state'] == 'SUCCESS') {
        $info['url'] = $prefix . $info['url'];
    }
    array_push($list, array(
        "state" => $info["state"],
        "url" => $info["url"],
        "size" => $info["size"],
        "title" => htmlspecialchars($info["title"]),
        "original" => htmlspecialchars($info["original"]),
        "source" => htmlspecialchars($imgUrl)
    ));
}

return json_encode(array(
    'state' => count($list) ? 'SUCCESS' : 'ERROR',
    'list' => $list
));