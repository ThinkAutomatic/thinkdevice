'use strict';

var http = require('http');
var os = require('os');
var ifaces = os.networkInterfaces();
var request = require('request');
var EventSource = require('eventsource');
var fs = require('fs');
var util = require('util');
var url = require('url');
var querystring = require('querystring');

var log_file = fs.createWriteStream('error.log', {flags : 'w'});

var urlToThinkAutomatic = 'https://api.thinkautomatic.io/v1/';
var deviceConf;
var serverPort;
var sceneTriggerData = {};
var sceneSelectHistory = [];
var rooms = [];
var devices = [];
var httpLinkRequest;
var httpRequest;

function logError(err) {
  console.log(util.format(err) + '\n');
  log_file.write(util.format(err) + '\n');  
}

function getLocalIpAddress () {
  var localIpAddress;

  Object.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }

      if (iface.address)
        localIpAddress = iface.address;
    });
  });
  return localIpAddress;
}

function directUrl() {
  if (serverPort) {
    return "http://" + getLocalIpAddress() + ":" + serverPort.toString() + "/";
  }
  else
  {
    return null;
  }
}

function safeParse(data) {
  try 
  { 
    return JSON.parse(data); 
  }
  catch (err) {
    logError(err);
    return {error: {message:"unexpected error"}};
  }  
}

function updateThinkDeviceConf(newData, cb) {
  var parsedData;

  try 
  { 
    parsedData = JSON.parse(newData); 

    if (parsedData['deviceId']) {
      deviceConf = parsedData;
      fs.writeFile('device.conf', JSON.stringify(deviceConf), function (err) {
      if (err) 
        logError(err);
      cb(err);
      });
    }
    else {
      if (parsedData['error'] && parsedData['error']['code'] && parsedData['error']['code'] == 3010)
      {
        console.log('Not authenticated. Deleting device info and exiting');
        fs.unlink('device.conf');
        process.exit(1);
      }
      throw newData;
    }
  }
  catch (err) {
    logError(err);
    cb(err);
    return;
  }
}

function scheduleKeepAlive(err) {
  setTimeout(function() { sendKeepAlive(); }, 15 * 60 * 1000);
}

function sendKeepAlive() {
  console.log('Sending keepAlive');
  request.post({url: urlToThinkAutomatic + 'devices/' + deviceConf['deviceId'] + '/keepAlive', 
                qs: { access_token: deviceConf['deviceToken'] }, 
                form: { directUrl: directUrl() }}, function(err,httpResponse,body) { 
    updateThinkDeviceConf(body, scheduleKeepAlive);
  });
}

function updateSceneTriggerData(newData) {
  sceneTriggerData = newData;
  fs.writeFile('sceneData.conf', JSON.stringify(sceneTriggerData), function (err) {
    if (err) 
      logError(err);
  });
}

function handleErr(err, res) {
  res.writeHead(200, {"Content-Type": "text/html"});
  res.end(util.format(err) + '\n');
}

function handleReq(req, res) {
  var parsedUrl = url.parse(req.url);
  var params = querystring.parse(parsedUrl.query);

  if (parsedUrl.pathname == '/link') {
    if (!params['linkToken']) {
      handleErr("No linkToken provided", res);
    }
    else {
      request.post({url: urlToThinkAutomatic + 'devices/' + deviceConf['deviceId'] + '/link', 
                    qs: { access_token: deviceConf['deviceToken'] }, 
                    form: { linkToken: params['linkToken'] }}, function(err,httpResponse,body) { 
        if (err) {
          handleErr(err, res);
        }
        else {
          updateThinkDeviceConf(body, function (err) {
              if (err) {
                handleErr(err, res);
              }
              else {
                if (httpLinkRequest) {
                  httpLinkRequest(params, res);
                }
                else if (params['successRedirect']) {
                  res.writeHead(301, {'Location': params['successRedirect']});
                  res.end();
                }
                else {
                  handleErr("Link succeeded but no successRedirect supplied", res);
                }
              }
            });
        }
      });
    }
  }
  else if (parsedUrl.pathname == '/')
  {
    console.log('Selecting scene ' + params['sceneId']);
    if (sceneTriggerData['sceneTriggerData']) {
      selectScene(findElem(sceneTriggerData['sceneTriggerData']['scenes'], params));
    }
    if (httpRequest) {
      httpRequest(params, res);
    }
    else {
      res.writeHead(200, {"Content-Type": "text/html"});
      res.end();
    }
  }
  else {
    handleErr("Invalid route", res);
  }
}

var onopen = function () {
  console.log('Connection to platform is opened');  
}

var onmessage = function(data) {
  console.log('Received from platform:');
  console.log(data);
}

var onerror = function() {
  console.log('Error receiving data from platform');
}

function on(eventName, cb) {
  switch(eventName){
    case 'open':
      onopen = cb; 
      break;
    case 'message':
      onmessage = cb; 
      break;
    case 'error':
      onerror = cb; 
      break;
    case 'httpLinkRequest':
      httpLinkRequest = cb;
      break;
    case 'httpRequest':
      httpRequest = cb;
      break;
  }
}


function purgeDeviceFromDeviceCache(deviceId) {
  for(var i = devices.length; i--;) {
    if (devices[i]['deviceId'] == deviceId) 
      devices.splice(i, 1);
  }  
}


function sendMessage(data)
{
  if (data && data['device'] && data['device']['deviceId'] &&
      data['action'] && data['action']['sceneId']) {
    var device = findElem(devices, {deviceId: data['device']['deviceId']});
    if (!device) {
      devices.push({ deviceId: data['device']['deviceId'], 
                     sceneId: data['action']['sceneId'] });
    }
    else { 
      clearTimeout(device['timeout']);
      device['timeout'] = setTimeout(function() { 
        purgeDeviceFromDeviceCache(data['device']['deviceId']); }, 5000 );
      if (device['sceneId'] != data['action']['sceneId']) 
        device['sceneId'] = data['action']['sceneId'];
      else
        return;
    }
  }

  onmessage(data);
}


function startEventSource(cb) {
  var src = new EventSource(deviceConf['eventStreamUrl']);

  src.onopen = function(){
    onopen();
  };
  src.onmessage = function(e) {
    var parsedData = safeParse(e.data);

    if (parsedData['sceneTriggerData']) {
      updateSceneTriggerData(parsedData);
    }
    else if ((parsedData['delete'] == 'true') && parsedData['device'] && (parsedData['device']['deviceId'] == deviceConf['deviceId'])) {
      console.log('Deleting device info and exiting');
      fs.unlink('device.conf');
      process.exit(1);
    }
    else {
      sendMessage(parsedData);
    }
  };
  src.onerror = function() {
    onerror();
  };

  sendKeepAlive();

  if (typeof cb === 'function')
    cb();
}

function run(cb) {
  // Configure our HTTP server
  var server = http.createServer(function (req, res) {
    handleReq(req, res);
  });

  server.on('error', function(e) {
    logError('Unable to start local server on port ' + serverPort.toString());
    serverPort = serverPort + 1;
    run(cb);
  });

  if (serverPort < 3300) {
    console.log('Attempting to start local server on port ' + serverPort.toString());
    server.listen(serverPort, function(){
      console.log('Local http server running at ' + directUrl());
      startEventSource(cb);
    });
  }
  else {
    logError('[warning] Unable to start local server.');
    startEventSource(cb);
  }
}

function connect(deviceProperties, cb)
{
  serverPort = 3205;

  deviceProperties['directUrl'] = directUrl();

  fs.readFile('sceneData.conf', 'utf8', function (err,data) {
    if (!err) {
      sceneTriggerData = safeParse(data);
    }
    fs.readFile('device.conf', 'utf8', function (err,data) {
      if (err) 
      {
        console.log('Creating new device.');
        request.post({url: urlToThinkAutomatic + 'devices', 
                    form: deviceProperties }, function(err,httpResponse,body) { 
          updateThinkDeviceConf(body, function () { run(cb); });
        });
      }
      else
      {
        deviceConf = safeParse(data);
        console.log('Updating device.');
        request.patch({url: urlToThinkAutomatic + 'devices/' + deviceConf['deviceId'], 
                    qs: { access_token: deviceConf['deviceToken'] }, 
                    form: deviceProperties }, function(err,httpResponse,body) {
          updateThinkDeviceConf(body, function () { run(cb); });
        });
      }
    });
  });
}

function matchElem(elem, selector) {
  var oneMatch = false;

  if (elem && selector) {
    var keyArray = Object.keys(selector);

    for (var i = 0; i < keyArray.length; i++) {
      var key = keyArray[i];
      if (elem[key]) {
        if (elem[key] != selector[key])
          return false;
        oneMatch = true;      
      }
    };
  }
  return oneMatch;
}


function findElem(elemArray, selector) {
  if (elemArray && selector && (elemArray instanceof Array)) {
    for (var i = 0; i < elemArray.length; i++) {
      if (matchElem(elemArray[i], selector))
        return elemArray[i];
    };
  }
  return null;
}


function purgeRoomFromSceneCache(roomId) {
  var room = findElem(rooms, {roomId:roomId});
  var currSceneId = 0;

  if (room != null)
    currSceneId = room['sceneId'];

  for(var i = sceneSelectHistory.length; i--;) {
    if (sceneSelectHistory[i]["roomId"] == roomId &&
        sceneSelectHistory[i]["sceneId"] != currSceneId) 
      sceneSelectHistory.splice(i, 1);
  }  
}


function setRoomTimeout(roomId, sceneId) {
  var room = findElem(rooms, {roomId:roomId});
  var timeout = setTimeout(function() { purgeRoomFromSceneCache(roomId); }, 20000 );

  if (room == null) {
    rooms.push({ roomId:roomId, sceneId:sceneId, timeout:timeout });
  }
  else {
    clearTimeout(room['timeout']);
    room['timeout'] = timeout;
    room['sceneId'] = sceneId;
  }
}


function selectScene(scene) {
  if (scene) {
    if (scene['commands']) {
      scene['commands'].forEach(function (command) { sendMessage(command); });
    }
    setRoomTimeout(scene.roomId, scene.sceneId);
    if (scene.level == 0)
      purgeRoomFromSceneCache(scene.roomId);
    else
      sceneSelectHistory.push({"sceneId":scene.sceneId, "roomId":scene.roomId});
  }
}


function selectCachedScene(deviceSelector, deviceProperties, cb) {
  if (sceneTriggerData['sceneTriggerData']) {
    var devices = sceneTriggerData['sceneTriggerData']['devices'];
    if (devices) {
      var device = findElem(devices, deviceSelector);
      if (device && device['actions']) {
        var action = findElem(device['actions'], deviceProperties);
        if (action && action['scenes']) {
          var scenes = action['scenes'];
          for (var i = 0; i < scenes.length; i++) {
            var scene = scenes[i];
            if (findElem(sceneSelectHistory, scene) == null) {
              var fullScene = findElem(sceneTriggerData['sceneTriggerData']['scenes'], scene);
              if (fullScene) {
                selectScene(fullScene);

                var localDirectUrls = sceneTriggerData['sceneTriggerData']['localDirectUrls'];
                if (localDirectUrls) {
                  localDirectUrls.forEach(function (directUrl) {
                    try { 
                      console.log('Selecting scene ' + fullScene.sceneId.toString() + ' at: ' + directUrl.toString());
                      request.get({url: directUrl + '?sceneId=' + fullScene.sceneId.toString() }, function(error, response, body) {
                      });
                    }
                    catch (err) {
                      logError(err);
                    }
                  });
                }

                deviceProperties['sceneId'] = fullScene.sceneId;
//                deviceProperties['silent'] = 'true';
                cb(deviceProperties);
                return;
              }
            }
          };
        }
      }
    }
  }
  cb(deviceProperties);
}


function patch(deviceSelector, deviceProperties, cb) {
  // check if deviceSelector was omitted
  if ((typeof deviceProperties === 'function') || 
      (typeof deviceProperties === 'undefined')) {
    cb = deviceProperties;
    deviceProperties = deviceSelector;
    request.patch({url: urlToThinkAutomatic + 'devices/' + deviceConf['deviceId'], 
                  qs: { access_token: deviceConf['deviceToken'] }, 
                  form: deviceProperties }, function(err,httpResponse,body) { 
                    if (typeof cb === 'function')
                      cb(safeParse(body));
                  });
  }
  else {
    selectCachedScene(deviceSelector, deviceProperties, function (devicePropertiesWithScene) {
      devicePropertiesWithScene['hubId'] = deviceConf['deviceId'];

      if (typeof deviceSelector === 'number') {
        request.patch({url: urlToThinkAutomatic + 'devices/' + deviceSelector.toString(), 
                      qs: { access_token: deviceConf['deviceToken'] }, 
                      form: devicePropertiesWithScene }, function(err,httpResponse,body) { 
                        if (typeof cb === 'function')
                          cb(safeParse(body));
                      });
      }
      else {
        request.patch({url: urlToThinkAutomatic + 'devices', 
                      qs: { access_token: deviceConf['deviceToken'], where: deviceSelector }, 
                      form: devicePropertiesWithScene }, function(err,httpResponse,body) { 
                        if (typeof cb === 'function')
                          cb(safeParse(body));
                      });
      }
    });
  }
}


module.exports =  {
  connect: connect,
  patch: patch,
  on: on,
  getLocalIpAddress: getLocalIpAddress
};

