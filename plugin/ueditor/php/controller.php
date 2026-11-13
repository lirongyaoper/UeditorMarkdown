<?php
/**
 * UEditor generic server-side controller (framework-free).
 * Reads config.json, routes the standard UEditor actions.
 * Point the editor's `serverUrl` at this file (default: UEDITOR_HOME_URL + "php/controller.php").
 */
date_default_timezone_set('Asia/Shanghai');
error_reporting(E_ERROR);
header("Content-Type: text/html; charset=utf-8");

$CONFIG = json_decode(preg_replace("/\/\*[\s\S]+?\*\//", "", file_get_contents(__DIR__ . "/config.json")), true);
$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'config':
        $result = json_encode($CONFIG);
        break;

    case 'uploadimage':
    case 'uploadscrawl':
    case 'uploadvideo':
    case 'uploadfile':
        $result = include(__DIR__ . "/action_upload.php");
        break;

    case 'listimage':
    case 'listfile':
        $result = include(__DIR__ . "/action_list.php");
        break;

    case 'catchimage':
        $result = include(__DIR__ . "/action_crawler.php");
        break;

    default:
        $result = json_encode(array('state' => '请求地址出错'));
        break;
}

if (isset($_GET["callback"])) {
    if (preg_match("/^[\w_]+$/", $_GET["callback"])) {
        echo htmlspecialchars($_GET["callback"]) . '(' . $result . ')';
    } else {
        echo json_encode(array('state' => 'callback参数不合法'));
    }
} else {
    echo $result;
}