'use strict';

const http = require('http');
const https = require('https');
const os = require('os');
const ifaces = os.networkInterfaces();
const axios = require('axios');
const EventSource = require('eventsource');
const fs = require('fs');
const util = require('util');
const url = require('url');
const querystring = require('querystring');
const lockFile = require('lockfile');

const urlToThinkAutomatic = 'https://api.thinkautomatic.io/v1/';
var deviceConf;
var serverPort;
var httpLinkRequest;
var httpRequest;
var locks = [];

const deviceFile = 'device.json';

function handleErr(err, res) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(err + '\n');
}

function scheduleKeepAlive() {
  setTimeout(function() { sendKeepAlive(); }, 15 * 60 * 1000);
}

function sendKeepAlive() {
  console.log('Sending thinkdevice keepAlive');
  post('devices/' + deviceConf['deviceId'] + '/keepAlive', { directUrl: directUrl() }, function(data) {
    updateThinkDeviceConf(data, scheduleKeepAlive);});
}

function updateThinkDeviceConf(newData, cb) {
  try
  {
    if (newData['deviceId']) {
      deviceConf = newData;
      fs.writeFile(deviceFile, JSON.stringify(deviceConf), function (err) {
        if (err)
          console.error(err);
        cb(err);
      });
    }
    else {
      if (newData['error'] && newData['error']['code'] && newData['error']['code'] == 3010) {
        console.error('Not authenticated. Deleting device info and exiting');
        fs.unlinkSync(deviceFile);
        process.exit(1);
      }
      throw newData;
    }
  }
  catch (err) {
    console.error(err);
    cb(err);
    return;
  }
}

function handleReq(req, res) {
  console.log('handleReq');
  var deviceId;
  var parsedUrl = url.parse(req.url);
  var params = querystring.parse(parsedUrl.query);

  if (parsedUrl.pathname == '/link') {
    console.log('link received');
    if (!params['linkToken']) {
      handleErr('No linkToken provided', res);
    }
    else {
      if (params['deviceId'])
        deviceId = params['deviceId'];
      else
        deviceId = deviceConf['deviceId'];

      post('devices/' + deviceId.toString() + '/link', { linkToken: params['linkToken'] }, function(data) {
        if (data && data['error']) {
          handleErr(data.error.message, res);
        }
        else if (deviceId == deviceConf['deviceId']) {
          updateThinkDeviceConf(data, function (err) {
            if (err) {
              handleErr(err, res);
            }
            else {
              if (httpLinkRequest) {
                httpLinkRequest(req, res);
              }
              else if (params['successRedirect']) {
                res.writeHead(301, { Location: params['successRedirect']});
                res.end();
              }
              else {
                handleErr('Link succeeded but no successRedirect supplied', res);
              }
            }
          });
        }
      });
    }
  }
  else {
    if (httpRequest) {
      httpRequest(req, res);
    }
    else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end();
    }
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
  console.error('Error receiving data from platform');
}

function startEventSource(cb) {
  var src = new EventSource(deviceConf['eventStreamUrl']);

  src.onopen = function() {
    onopen();
  };
  src.onmessage = function(e) {
    var parsedData = safeParseJSON(e.data);

    if (parsedData['device'] && (parsedData['device']['deviceId'] == deviceConf['deviceId']) &&
        parsedData['device']['deviceToken'] && (parsedData['device']['deviceToken'] == deviceConf['deviceToken'])) {
      if (parsedData['delete'] == 'true') {
        console.log('Deleting device info and exiting');
        fs.unlinkSync(deviceFile);
        process.exit(1);
      }
      else {
        updateThinkDeviceConf(JSON.stringify(parsedData['device']), function() {
          onmessage(parsedData);
        });
      }
    }
    else {
      onmessage(parsedData);
    }
  };
  src.onerror = function() {
    onerror();
  };

  sendKeepAlive();

  if (typeof cb === 'function')
    cb();
}

function fullLockPath(path) {
  return os.tmpdir() + '/' + path.replace("/", "").replace(/\//g, "") + '.lock';
}

function safeParseJSON(data) {
  try {
    return JSON.parse(data);
  }
  catch (err) {
    return { error: { message: err.message } };
  }
}

function connect(deviceProperties, cb) {
  if (deviceProperties['serverPort'])
    serverPort = deviceProperties['serverPort'];
  else
    serverPort = 3205;

  deviceProperties['directUrl'] = directUrl();

  fs.readFile(deviceFile, 'utf8', function (err,data) {
    var parsedData = safeParseJSON(data);
    if (err || !parsedData || !parsedData['deviceId']) {
      console.log('Creating new device.');
      post('devices', deviceProperties, function(data) {
        if (data) {
          if (data['error']) {
            cb(data);
          }
          else {
            updateThinkDeviceConf(data, function(err) { if (err) cb(err); else run(cb); });
          }
        }
      });
    }
    else
    {
      deviceConf = parsedData;
      patch(deviceProperties, function(data) {
        updateThinkDeviceConf(data, function(err) { if (err) cb(err); else run(cb); });
      });
    }
  });
}

function directUrl() {
  if (serverPort) {
    return "http://" + getLocalIpAddress() + ":" + serverPort.toString();
  }
  else {
    return null;
  }
}

axios.interceptors.request.use(function (config) {
  if (deviceConf && deviceConf['deviceToken'])
    config.headers.Authorization = deviceConf['deviceToken'];

  return config;
});

function post(path, params, cb) {
  // check if params was omitted
  if ((typeof params === 'function') || (typeof params === 'undefined')) {
    cb = params;
    params = null;
  }

  // check if cb was omitted and put in no-op
  if (typeof cb === 'undefined') {
    cb = function(data){};
  }

  axios.post(urlToThinkAutomatic + path, params)
    .then(res => {
      cb(res.data);
    })
    .catch((err) => {
      cb({ error : { message: err.message } });
    });
}

function patch(deviceSelector, deviceProperties, cb) {
  // check if deviceSelector was omitted
  if ((typeof deviceProperties === 'function') ||
      (typeof deviceProperties === 'undefined')) {
    cb = deviceProperties;
    deviceProperties = deviceSelector;
    axios.patch(urlToThinkAutomatic + 'devices/' + deviceConf['deviceId'], deviceProperties)
      .then(res => {
        if (typeof cb === 'function') cb(res.data);
      })
      .catch((err) => {
        if (typeof cb === 'function') cb({ error: { message: err.message } });
      });
  }
  else {
    deviceProperties['hubId'] = deviceConf['deviceId'];

    if (typeof deviceSelector === 'number') {
      axios.patch(urlToThinkAutomatic + 'devices/' + deviceSelector.toString(), deviceProperties)
        .then(res => {
          if (typeof cb === 'function') cb(res.data);
        })
        .catch((err) => {
          if (typeof cb === 'function') cb({ error: { message: err.message } });
        });
    }
    else {
      axios.patch(urlToThinkAutomatic + 'devices', deviceProperties, { params: { where: deviceSelector } })
        .then(res => {
          if (typeof cb === 'function') cb(res.data);
        })
        .catch((err) => {
          if (typeof cb === 'function') cb({ error: { message: err.message } });
        });
    }
  }
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

function getServerPort() {
  return serverPort;
}

function getDeviceConf() {
  return deviceConf;
}

function lockPeripheral(path, options, cb) {
  var fullPath = fullLockPath(path);
  var i;

  if (!options || typeof options === "function") {
    cb = options;
    options = { wait: 10000 };
  }

  if (!cb)
    cb = function (err) {};

  lockFile.lock(fullPath, options, function (err) {
    if (err) {
      cb(err);
      return;
    }

    for (i = 0; i < locks.length; i++)
      if (!locks[i])
        break;

    if (i < locks.length)
      locks[i] = fullPath;
    else
      locks.push(fullPath);

    cb();
  });
}

function unlockPeripheral(path, cb) {
  var fullPath = fullLockPath(path);
  var i;

  if (!cb)
    cb = function (err) {};

  for (i = 0; i < locks.length; i++)
    if (locks[i] == fullPath)
      break;

  if (i < locks.length) {
    delete locks[i];
    lockFile.unlock(fullPath, cb);
  }
  else {
    cb(new Error("Invalid path"));
    return;
  }
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

  if (serverPort < 65536) {
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

// This code is to facilitate graceful exit from ctrl-c
var stdin = process.stdin;

stdin.setRawMode( true );
stdin.resume();
stdin.setEncoding( 'utf8' );

stdin.on( 'data', function( key ) {
  if (key.charCodeAt(0) == 3)
    process.exit(1);
});

module.exports =  {
  safeParseJSON: safeParseJSON,
  connect: connect,
  directUrl: directUrl,
  post: post,
  patch: patch,
  on: on,
  localIp: getLocalIpAddress,
  localPort: getServerPort,
  deviceConf: getDeviceConf,
  lockPeripheral: lockPeripheral,
  unlockPeripheral: unlockPeripheral
};
