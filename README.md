# thinkdevice
This is a node.js module designed to make device integration with the Think Automatic home automation machine learning platform very simple.

## Getting Started

This module has mainly been tested on the Raspberry Pi as it is quite well suited as a home automation hub, therefore these instructions are aimed at setting up and running on a Raspberry Pi. However it should be able to run on other node installations.

### Prerequisities

You will need to have node.js installed. Although it will likely work with more recent builds it has been tested on v0.10.28 which can be installed using the following commands.

```
cd ~
wget http://nodejs.org/dist/v0.10.28/node-v0.10.28-linux-arm-pi.tar.gz
cd /usr/local
sudo tar xzvf ~/node-v0.10.28-linux-arm-pi.tar.gz --strip=1
```

### Installing

To get up and running first create a directory for your thinkdevice project.

```
cd ~
mkdir MyDevice
cd MyDevice
```
Then install the thinkdevice module ignoring any warnings.

``` 
npm install thinkdevice
```
Copy the example to your MyDevice directory.
```
cp node_modules/thinkdevice/example/example.js .
```
The example is short but fully functional.
```javascript
'use strict';

var td = require('thinkdevice');

// Connect to Think Automatic platform as a Widget whose interface is specified
// by the given deviceTypeUuid. Device types can be designed and browsed by
// going to https://app.thinkautomatic.io/deviceTypes.
td.connect({ name: 'Example Widget',  deviceTypeUuid: 'fa3aff64-f259-4212-9adf-ab53ac9106fe' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

// This is the main message handler
td.on('message', function (data) {
  console.log('Received:');
  console.log(data);
  if (data.action && data.action.rangeAttr) {
    // This is where commands for the widget would be processed.
    console.log('** Do something with rangeAttr value "' + data.action.rangeAttr.toString() + '" here');
  }
  else if (data.link) {
    // The Widget can act as a hub device meaning that it can relay messages for 
    // other devices. This section would be where a link request from the 
    // platform would be handled.
    console.log('** Link request received ' + JSON.stringify(data.link));
  }
});

td.on('error', function () {
  console.log('Error receiving data from platform');
});

// The code below is to send device events to the platform based on key presses. 
var stdin = process.stdin;

stdin.setRawMode( true );
stdin.resume();
stdin.setEncoding( 'utf8' );

stdin.on( 'data', function( key ) {
  switch (key.charCodeAt(0)) {
    case 3:         process.exit(1);                    break;  // Ctrl - C
    case 27:
      switch (key.charCodeAt(2)) {
        case 65:    td.patch({ discreteAttr: 'up' });   break;  // up arrow key
        case 66:    td.patch({ discreteAttr: 'down' }); break;  // down arrow key
      }
      break;
  }
});
```
It can be run using the following command.
```
node example.js
```
And it will generate output that looks something like this
```
Creating new device.
Attempting to start local server on port 3205
Local http server running at http://192.168.2.22:3205/
Sending thinkdevice keepAlive
Started
Connection to platform is opened
Received:
{ device:
   { name: 'Example Widget',
     hubId: null,
     isHub: true,
     local: true,
     homeId: null,
     online: true,
     roomId: null,
     deviceId: 4239,
     homeName: null,
     roomName: null,
     directUrl: 'http://192.168.2.25:3205/',
     deviceTypeUuid: 'fa3aff64-f259-4212-9adf-ab53ac9106fe',
     externalIpAddress: '76.104.156.142' } }
```
There will also now be two new files in your MyDevice directory. One called device.conf and another called error.log.

The device.conf file contains the same information reported above along with a security token for the Think Automatic platform. Although you can look at this file, you can also safely ignore it.

### Testing that the example is already integrated with the platform

Next step is to create a free account on the Think Automatic platform by going [here](https://app.thinkautomatic.io/users/register) or if you already have an account login [here](https://app.thinkautomatic.io/users/login). Note this is designed for a phone screen, but works in any browser.

Once you have an account and are logged in, create at least one home with one room if you have not done so already by following the on screen instructions.

Once you have created a home and as long as you are on the same local network you should see an option for 'Show discovered device(s)'. 

<img src="/images/discovered.png" width="300">

After tapping that you will see your newly created 'Example Widget' listed. Tap on that and you should see a popup for linking.

<img src="/images/linking.png" width="300">

Tap 'Attempt Link' and your 'Example Widget' will be securely linked to your account and you should then see the room it was linked into now with three preset scenes which you can tap on.

<img src="/images/room.png" width="300">

When you tap on them you should see the commands received by the 'Example Widget' output to the console that should look something like this.
```
Received:
{ action: { sceneId: 4242, rangeAttr: '50' },
  device:
   { name: 'Example Widget',
     hubId: null,
     isHub: true,
     local: null,
     homeId: 4234,
     online: true,
     roomId: 4240,
     sceneId: '4243',
     deviceId: 4239,
     homeName: 'Test home',
     roomName: 'Test room ',
     directUrl: 'http://192.168.2.25:3208/',
     rangeAttr: '0',
     deviceTypeUuid: 'fa3aff64-f259-4212-9adf-ab53ac9106fe',
     externalIpAddress: '76.104.156.142' } }
```
Congratulations! You have successfully created a sample device that is integrated with the Think Automatic machine learning platform.

### Experiment with the Example Widget

In the Widget example the up arrow and down arrow on the keyboard generate events for { discreteAttr: 'up' } and { discreteAttr: 'down' } respectively. These are designated as triggering events for the Widget device type which means that they trigger scene changes in the same room where the Widget is placed. When you press these keys you can see the command that comes back to the Widget from the platform based on those triggering events.

For further experimentation try creating other virtual devices by using other device types that you can browse and/or create [here](https://app.thinkautomatic.io/deviceTypes). Once you have two or more devices running try moving them between rooms using the web UI to see how they interact.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

