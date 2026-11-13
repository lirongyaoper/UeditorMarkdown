<?php
/**
 * Generic upload action (uploadimage / uploadscrawl / uploadvideo / uploadfile).
 * Included by controller.php; $CONFIG and $action are defined there.
 */
include_once __DIR__ . "/Uploader.class.php";

$base64 = "upload";
switch (htmlspecialchars($_GET['action'])) {
    case 'uploadimage':
        $config = array(
            "pathFormat" => $CONFIG['imagePathFormat'],
            "maxSize" => $CONFIG['imageMaxSize'],
            "allowFiles" => $CONFIG['imageAllowFiles']
        );
        $fieldName = $CONFIG['imageFieldName'];
        $prefix = isset($CONFIG['imageUrlPrefix']) ? $CONFIG['imageUrlPrefix'] : '';
        break;
    case 'uploadscrawl':
        $config = array(
            "pathFormat" => $CONFIG['scrawlPathFormat'],
            "maxSize" => $CONFIG['scrawlMaxSize'],
            "allowFiles" => $CONFIG['scrawlAllowFiles'],
            "oriName" => "scrawl.png"
        );
        $fieldName = $CONFIG['scrawlFieldName'];
        $base64 = "base64";
        $prefix = isset($CONFIG['scrawlUrlPrefix']) ? $CONFIG['scrawlUrlPrefix'] : '';
        break;
    case 'uploadvideo':
        $config = array(
            "pathFormat" => $CONFIG['videoPathFormat'],
            "maxSize" => $CONFIG['videoMaxSize'],
            "allowFiles" => $CONFIG['videoAllowFiles']
        );
        $fieldName = $CONFIG['videoFieldName'];
        $prefix = isset($CONFIG['videoUrlPrefix']) ? $CONFIG['videoUrlPrefix'] : '';
        break;
    case 'uploadfile':
    default:
        $config = array(
            "pathFormat" => $CONFIG['filePathFormat'],
            "maxSize" => $CONFIG['fileMaxSize'],
            "allowFiles" => $CONFIG['fileAllowFiles']
        );
        $fieldName = $CONFIG['fileFieldName'];
        $prefix = isset($CONFIG['fileUrlPrefix']) ? $CONFIG['fileUrlPrefix'] : '';
        break;
}

$uploader = new Uploader($fieldName, $config, $base64);
$info = $uploader->getFileInfo();
if (isset($info['url']) && $info['state'] === 'SUCCESS') {
    $info['url'] = $prefix . $info['url'];
}

return json_encode($info);