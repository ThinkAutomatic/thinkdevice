"use strict";

const http = require("http");
const os = require("os");
const ifaces = os.networkInterfaces();

const fs = require("fs");
const url = require("url");
const querystring = require("querystring");
const lockFile = require("lockfile");

const WebSocket = require("ws");
const urlToThinkAutomaticWS = "wss://socket.thinkautomatic.io";
const minBackoff = 100;
const maxBackoff = 15000;

var ws;
var wsBackoff = minBackoff;
var deviceConf;
var serverPort;
var httpLinkRequest;
var httpRequest;
var locks = [];

const deviceFile = "device.json";

function safeParseJSON(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    return { error: { message: err.message } };
  }
}

function handleErr(err, res) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(err + "\n");
}

function updateThinkDeviceConf(newData, cb) {
  try {
    if (
      newData.deviceId &&
      (!deviceConf.deviceId || newData.deviceId == deviceConf.deviceId)
    ) {
      if (newData.deviceTokenNew) {
        newData.deviceToken = newData.deviceTokenNew;
      }
      deviceConf = newData;
      fs.writeFile(deviceFile, JSON.stringify(deviceConf), function (err) {
        if (err) console.error(err);
        cb(err);
      });
    } else {
      if (newData.error && newData.error.code && newData.error.code == 3010) {
        console.error("Not authenticated. Deleting device info and exiting");
        fs.unlinkSync(deviceFile);
        process.exit(1);
      }
      throw newData;
    }
  } catch (err) {
    console.error(err);
    cb(err);
    return;
  }
}

function handleReq(req, res) {
  console.log("handleReq");
  var deviceId;
  var parsedUrl = url.parse(req.url);
  var params = querystring.parse(parsedUrl.query);

  if (parsedUrl.pathname == "/link") {
    console.log("link received");
    if (!params.linkToken) {
      handleErr("No linkToken provided", res);
    } else {
      if (params.deviceId) deviceId = params.deviceId;
      else deviceId = deviceConf.deviceId;

      patch({ linkToken: params.linkToken, deviceId: deviceId });

      // slight pause before redirecting to give platform chance to update
      setTimeout(function () {
        if (params.successRedirect) {
          res.writeHead(301, { Location: params.successRedirect });
        } else {
          res.writeHead(301, { Location: "https://app.thinkautomatic.io" });
        }
        res.end();
      }, 2000);
    }
  } else {
    if (httpRequest) {
      httpRequest(req, res);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end();
    }
  }
}

var onConnect = function () {
  console.log("Connection to platform opened");
};

var onClose = function () {
  console.log("Connection to platform closed");
};

var onMessage = function (data) {
  console.log("Received from platform:");
  console.log(data);
};

var onError = function (message) {
  console.error(message);
};

function patch(devicePropertiesUpdate) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(devicePropertiesUpdate));
  }
}

function fullLockPath(path) {
  return os.tmpdir() + "/" + path.replace("/", "").replace(/\//g, "") + ".lock";
}

function directUrl() {
  if (serverPort) {
    return "http://" + getLocalIpAddress() + ":" + serverPort.toString();
  } else {
    return null;
  }
}

function on(eventName, cb) {
  switch (eventName) {
    case "connect":
      onConnect = cb;
      break;
    case "close":
      onClose = cb;
      break;
    case "message":
      onMessage = cb;
      break;
    case "error":
      onError = cb;
      break;
    case "httpLinkRequest":
      httpLinkRequest = cb;
      break;
    case "httpRequest":
      httpRequest = cb;
      break;
  }
}

function getLocalIpAddress() {
  var localIpAddress;

  Object.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (iface) {
      if ("IPv4" !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }

      if (iface.address) localIpAddress = iface.address;
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

  if (!cb) cb = function (err) {};

  lockFile.lock(fullPath, options, function (err) {
    if (err) {
      cb(err);
      return;
    }

    for (i = 0; i < locks.length; i++) if (!locks[i]) break;

    if (i < locks.length) locks[i] = fullPath;
    else locks.push(fullPath);

    cb();
  });
}

function unlockPeripheral(path, cb) {
  var fullPath = fullLockPath(path);
  var i;

  if (!cb) cb = function (err) {};

  for (i = 0; i < locks.length; i++) if (locks[i] == fullPath) break;

  if (i < locks.length) {
    delete locks[i];
    lockFile.unlock(fullPath, cb);
  } else {
    cb(new Error("Invalid path"));
    return;
  }
}

function startServer() {
  // Configure our HTTP server
  var server = http.createServer(function (req, res) {
    handleReq(req, res);
  });

  server.on("error", function (e) {
    console.error(
      "Unable to start local server on port " + serverPort.toString()
    );
    serverPort = serverPort + 1;
    startServer();
  });

  if (serverPort < 65536) {
    console.log(
      "Attempting to start local server on port " + serverPort.toString()
    );
    server.listen(serverPort, function () {
      console.log("Local http server running at " + directUrl());
    });
  } else {
    console.warn("Unable to start local server.");
  }
}

function heartbeat() {
  clearTimeout(ws.pingTimeout);

  // Use `WebSocket#terminate()`, which immediately destroys the connection,
  // instead of `WebSocket#close()`, which waits for the close timer.
  // Delay should be equal to the interval at which your server
  // sends out pings plus a conservative assumption of the latency.
  ws.pingTimeout = setTimeout(() => {
    ws.terminate();
  }, 30000 + 1000);
}

function wsConnect() {
  console.log("Attempting websocket connection");
  ws = new WebSocket(
    urlToThinkAutomaticWS +
      (deviceConf && deviceConf.deviceToken
        ? "?token=" + deviceConf.deviceToken
        : "")
  );
  ws.on("open", function open() {
    wsBackoff = minBackoff;
    heartbeat();
    if (deviceConf) {
      deviceConf.directUrl = directUrl();
      patch(deviceConf);
    }
    onConnect();
  });
  ws.on("ping", heartbeat);
  ws.on("close", function close() {
    onClose();
    clearTimeout(ws.pingTimeout);
    setTimeout(wsConnect, wsBackoff);
    wsBackoff = Math.min(maxBackoff, wsBackoff * 2);
    console.log("Backing off %d ms", wsBackoff);
  });
  ws.on("error", function error() {
    onError();
    ws.close();
  });
  ws.on("message", function incoming(data) {
    var parsedData = safeParseJSON(data);

    if (parsedData) {
      if (
        parsedData &&
        parsedData.error &&
        parsedData.error.code &&
        parsedData.error.code == 3000
      ) {
        console.log("Deleting invalid device info and exiting");
        fs.unlinkSync(deviceFile);
        process.exit(1);
      } else {
        if (parsedData.sceneTriggerData) {
          // NYI processing of sceneTriggerData
          return;
        }
        if (parsedData.deviceToken) {
          updateThinkDeviceConf(parsedData, function () {
            if (parsedData.deviceTokenNew) {
              // close (& automatic reopen) ws to start using new token
              ws.close();
            }
          });
        }
        onMessage(parsedData);
      }
    }
  });
}

function connect(deviceProperties) {
  if (deviceProperties.serverPort) {
    serverPort = deviceProperties.serverPort;
  } else {
    serverPort = 3205;
  }

  deviceProperties.directUrl = directUrl();

  fs.readFile(deviceFile, "utf8", function (err, data) {
    var parsedData = safeParseJSON(data);
    if (parsedData && parsedData.deviceId) {
      deviceProperties.deviceId = parsedData.deviceId;
      deviceProperties.deviceToken = parsedData.deviceToken;
    }
    deviceConf = deviceProperties;
    wsConnect();
  });

  startServer();
}

// This code is to facilitate graceful exit from ctrl-c
var stdin = process.stdin;

stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

stdin.on("data", function (key) {
  if (key.charCodeAt(0) == 3) process.exit(1);
});

module.exports = {
  safeParseJSON: safeParseJSON,
  connect: connect,
  directUrl: directUrl,
  patch: patch,
  on: on,
  localIp: getLocalIpAddress,
  localPort: getServerPort,
  deviceConf: getDeviceConf,
  lockPeripheral: lockPeripheral,
  unlockPeripheral: unlockPeripheral,
};
