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

function logError(err) {
  console.log(util.format(err) + '\n');
  log_file.write(util.format(err) + '\n');  
}

function directUrl() {
  var ipAddress;

  if (serverPort) {
    Object.keys(ifaces).forEach(function (ifname) {
      ifaces[ifname].forEach(function (iface) {
        if ('IPv4' !== iface.family || iface.internal !== false) {
          // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
          return;
        }

        ipAddress = iface.address;
      });
    });

    return "http://" + ipAddress + ":" + serverPort.toString() + "/";
  }
  else
  {
    return null;
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

  if (parsedUrl.pathname === '/link') {
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
                if (params['successRedirect']) {
                  res.writeHead(302, {'Location': params['successRedirect']});
                  res.end();
                }
                else {
                  handleErr("Link succeeded but no successRedirect supplied");
                }
              }
            });
        }
      });
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
  }
}

function startEventSource(cb)
{
  var src = new EventSource(deviceConf['eventStreamUrl']);

  src.onopen = function(){
    onopen();
  };
  src.onmessage = function(e) {
    try 
    { 
      var parsedData = JSON.parse(e.data); 

      if (parsedData['sceneTriggerData'])
        updateSceneTriggerData(parsedData);
      else
        onmessage(parsedData);
    }
    catch (err) 
    {
      logError(err);
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
  if (deviceConf['homeId']) {
    console.log('Device already associated with a home, not starting http server for discovery');
    startEventSource(cb);
  }
  else {
    // Configure our HTTP server
    var server = http.createServer(function (req, res) {
      handleReq(req, res);
    });

    server.on('error', function(e) {
      logError('Unable to start discover server on port ' + serverPort.toString());
      serverPort = serverPort + 1;
      run(cb);
    });

    if (serverPort < 3300) {
      console.log('Attempting to start discovery server on port ' + serverPort.toString());
      server.listen(serverPort, function(){
        console.log('Discovery http server running at ' + directUrl());
        startEventSource(cb);
      });
    }
    else {
      logError('Unable to start discover server, exiting.');
    }
  }
}

function connect(deviceProperties, cb)
{
  serverPort = 3205;

  deviceProperties['directUrl'] = directUrl();

  fs.readFile('sceneData.conf', 'utf8', function (err,data) {
    if (!err) {
      sceneTriggerData = JSON.parse(data);
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
        deviceConf = JSON.parse(data);
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
  var keyArray = Object.keys(selector);

  for (var i = 0; i < keyArray.length; i++) {
    var key = keyArray[i];
    if (elem[key]) {
      if (elem[key] !== selector[key])
        return false;
      oneMatch = true;      
    }
  };
  return oneMatch;
}


function findElem(elemArray, selector) {
  for (var i = 0; i < elemArray.length; i++) {
    if (matchElem(elemArray[i], selector))
      return elemArray[i];
  };
  return null;
}


function purgeRoomFromSceneCache(roomId) {
  var room = findElem(rooms, {roomId:roomId});
  var currSceneId = 0;

  if (room !== null)
    currSceneId = room['sceneId'];

  for(var i = sceneSelectHistory.length; i--;) {
    if (sceneSelectHistory[i]["roomId"] == roomId &&
        sceneSelectHistory[i]["sceneId"] !== currSceneId) 
      sceneSelectHistory.splice(i, 1);
  }  

  console.log('sceneSelectHistory_2');
  console.log(sceneSelectHistory);
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
                fullScene['commands'].forEach(function (command) { onmessage(command); });
                setRoomTimeout(fullScene.roomId, fullScene.sceneId);
                if (fullScene.level == 0)
                  purgeRoomFromSceneCache(fullScene.roomId);
                else
                  sceneSelectHistory.push({"sceneId":fullScene.sceneId, "roomId":fullScene.roomId});
                deviceProperties['sceneId'] = fullScene.sceneId;
                deviceProperties['silent'] = 'true';
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
                      cb(body);
                  });
  }
  else {
    selectCachedScene(deviceSelector, deviceProperties, function (devicePropertiesWithScene) {
      devicePropertiesWithScene['hubId'] = deviceConf['deviceId'];
      console.log('devicePropertiesWithScene');
      console.log(devicePropertiesWithScene);
      console.log('sceneSelectHistory');
      console.log(sceneSelectHistory);

      if (typeof deviceSelector === 'number') {
        request.patch({url: urlToThinkAutomatic + 'devices/' + deviceSelector.toString(), 
                      qs: { access_token: deviceConf['deviceToken'] }, 
                      form: devicePropertiesWithScene }, function(err,httpResponse,body) { 
                        if (typeof cb === 'function')
                          cb(body);
                      });
      }
      else {
        request.patch({url: urlToThinkAutomatic + 'devices', 
                      qs: { access_token: deviceConf['deviceToken'], where: deviceSelector }, 
                      form: devicePropertiesWithScene }, function(err,httpResponse,body) { 
                        if (typeof cb === 'function')
                          cb(body);
                      });
      }
    });
  }
}


module.exports =  {
  connect: connect,
  patch: patch,
  on: on
};

