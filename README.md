# thinkdevice
This is a node.js module designed to make device integration with the Think Automatic home automation machine learning platform very simple.

## Getting Started

So far this module has only been tested on the Raspberry Pi as it is quite well suited as a home automation hub, therefore these instructions are aimed at setting up and running on a Raspberry Pi.

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
The example is very short but fully functional.
```javascript
'use strict';

var td = require('thinkdevice');

td.connect({ name: 'Example Hub',  deviceTypeUuid: '636a0568-5dd1-414f-9328-a092164e5374' }, function () { 
  console.log('Started')
});

td.on('open', function() {
  console.log('Connection to platform is opened');  
});

td.on('message', function (data) {
  console.log('Received:');
  console.log(JSON.stringify(data));
});

td.on('error', function () {
  console.log('Error receiving data from platform');
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
Sending keepAlive
Started
Connection to platform is opened
Received:
{ device:
   { name: 'Example Hub',
     hubId: null,
     local: true,
     homeId: null,
     online: true,
     roomId: null,
     deviceId: 2822,
     roomName: null,
     directUrl: 'http://192.168.2.22:3205/',
     deviceTypeUuid: '636a0568-5dd1-414f-9328-a092164e5374',
     externalIpAddress: '71.227.123.456' } }
```
There will also now be two new files in your MyDevice directory. One called device.conf and another called error.log.

The device.conf file contains the same information reported above along with a security token for the Think Automatic platform. Although you can look at this file, you can also safely ignore it.

### Testing that the example is already integrated with the platform

At present you will need to create a free account on the Think Automatic platform by going [here](https://app.thinkautomatic.io/users/register) or if you already have an account login [here](https://app.thinkautomatic.io/users/login). Note this is designed for a phone screen, but works in any browser.

Once you have an account and are logged in create at least one home in your account if you have not already by following the on screen instructions.

Once you have created and selected a home, stay in 'edit mode' and tap on 'not in a room'. This is where devices can be accessed that are not yet placed in a room, not yet discovered, or do not belong in a room such as a hub device.

From there tap on 'search for new hubs or other local devices'. As long as you are on the same local area network as your Raspberry Pi/local machine you should now see an entry that says 'Example Hub'. If you tap on that it will ask you if you want to attempt to associate it with the current home. Tap OK.

Your 'Example Hub' should now be associated with the home you created. To test this we will create a test room and send a link command to your 'Example Hub'.

Tap on 'Add new room' and enter 'test room'. From there you should get some options for 'test room' including 'link new devices in test room'. Tap on that then tap submit on the popup. You should then see output from your example program running on your Raspberry Pi that looks something like this.
```
Received:
{ link: { homeId: 1392, roomId: 2329 },
  device:
   { name: 'Example Hub',
     hubId: null,
     local: null,
     homeId: 1392,
     online: true,
     roomId: null,
     deviceId: 2822,
     roomName: null,
     directUrl: 'http://192.168.2.22:3205/',
     deviceTypeUuid: '636a0568-5dd1-414f-9328-a092164e5374',
     externalIpAddress: '71.227.123.456' } }
```
Congratulations! You have successfully created a hub that is integrated with the Think Automatic machine learning platform.

Add a device that communicates through the hub.

### Link a virtual device through our Example Hub

We are now going to use the Example Hub to communicate with a virtual device. We'll use another predefined device type called a 'Widget'. Note: Device types can be browsed, searched and created by going [here](https://app.thinkautomatic.io/devicetypes).

To do this all we need to do is add some code to our Example Hub so that knows about Widgets.

If we replace our message handler in the Example Hub that looks like this
```javascript
td.on('message', function (data) {
  console.log('Received:');
  console.log(JSON.stringify(data));
});
```
with code that looks like this
```javascript
td.on('message', function (data) {
  console.log('Received:');
  console.log(data);

  if (data['link']) {
    var newWidget = { name: 'New Widget', 
                      deviceTypeUuid: 'e24a893b-4434-47a3-831b-11031269ae7d',
                      homeId: data['link']['homeId'], 
                      roomId: data['link']['roomId'],
                      widgetId: Math.floor((Math.random() * 1000) + 1).toString() };

    td.patch({}, newWidget, function (data) {
      console.log('Response from platform for new widget:');
      console.log(data['name']);
    });
  }
});
```
Now if you go back to the 'test room' and repeat the 'link new devices in test room' steps from above, then our Example Hub will respond by creating a device of type Widget specified by the unique id e24a893b-4434-47a3-831b-11031269ae7d.

If you then exit link mode then tap on scenes you can see the commands for the 'New Widget' come in on the Example Hub. You can also tap on the dots in the upper righthand corner to access the direct controls for the devices in the test room.

More documentation coming soon...

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

